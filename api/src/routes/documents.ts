import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { uploadToStorage, getSignedUrl } from '../config/firebase';
import { writeAuditLog, AuditActions } from '../services/audit';

// ── Allowed document types ────────────────────────────────────
const DOCUMENT_TYPES = [
  'nic_front',
  'nic_back',
  'military_id',
  'selfie',
  'paysheet_1',
  'paysheet_2',
  'paysheet_3',
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  nic_front:   'NIC (Front)',
  nic_back:    'NIC (Back)',
  military_id: 'Military ID',
  selfie:      'Selfie',
  paysheet_1:  'Paysheet (Month 1)',
  paysheet_2:  'Paysheet (Month 2)',
  paysheet_3:  'Paysheet (Month 3)',
};

// Required documents for a customer to be considered verified
const REQUIRED_FOR_VERIFICATION: DocumentType[] = [
  'nic_front',
  'nic_back',
  'selfie',
];

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── Helper: derive content type for storage path ──────────────
function ext(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png',
    'image/heic': 'heic', 'image/heif': 'heif',
    'image/webp': 'webp', 'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}

// ── Check if customer owns this request (or is staff) ─────────
async function assertCanAccessCustomer(
  customerId: string,
  userId: string,
  role: string,
  reply: FastifyReply
): Promise<boolean> {
  if (role !== 'customer') return true;

  const { data } = await getSupabase()
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', userId)
    .single();

  if (!data) {
    reply.status(403).send({ error: 'Forbidden', message: 'Cannot access another customer\'s documents' });
    return false;
  }
  return true;
}

import { extractNicFromImage } from '../services/gemini';
import { notify } from '../services/notify';

// ── Auto-verify helper ──────────────────────────────────────
async function autoVerifyDocument(
  customerId: string,
  docId: string,
  documentType: string,
  verifiedById: string,
  fileBuffer?: Buffer,
  mimeType?: string
): Promise<{ status: 'verified' | 'rejected' | 'pending'; reason?: string }> {
  const sb = getSupabase();

  if (documentType === 'selfie') {
    // Selfies are auto-approved
    await sb.from('customer_documents').update({
      verification_status: 'verified',
      verified_by: verifiedById,
      verified_at: new Date().toISOString(),
      rejection_reason: null,
    }).eq('id', docId);
    return { status: 'verified' };
  }

  if (documentType === 'nic_front' || documentType === 'nic_back') {
    // Fetch the customer's NIC number and name
    const { data: customer } = await sb
      .from('customers')
      .select('nic_name, full_name, nic_number')
      .eq('id', customerId)
      .single();

    let nic = (customer?.nic_number?.trim() ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

    let extractedNic = 'NONE';
    // Run Gemini Vision check if buffer and key are available
    if (fileBuffer && mimeType && process.env.GEMINI_API_KEY) {
      const base64 = fileBuffer.toString('base64');
      try {
        extractedNic = await extractNicFromImage(base64, mimeType);
      } catch (err) {
        console.error('[AI] Error extracting NIC from image:', err);
      }
    }

    const cleanExtracted = extractedNic.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const isExtractedValid = cleanExtracted.length > 0 &&
      (/^\d{9}[VvXx]$/.test(cleanExtracted) || /^\d{12}$/.test(cleanExtracted));

    // If the customer has no NIC set in the system, but AI found a valid one:
    if (!nic && isExtractedValid) {
      nic = cleanExtracted;
      await sb.from('customers').update({ nic_number: cleanExtracted }).eq('id', customerId);
    }

    // Sri Lankan NIC format validation
    const oldNic = /^\d{9}[VvXx]$/.test(nic);
    const newNic = /^\d{12}$/.test(nic);
    const isValidFormat = nic.length > 0 && (oldNic || newNic);

    if (!isValidFormat) {
      // If there's no valid NIC registered, and AI couldn't read one, set to pending for manual review
      const reason = 'AI could not read the NIC number from the image. Pending manual review.';
      await sb.from('customer_documents').update({
        verification_status: 'pending',
        rejection_reason: reason,
      }).eq('id', docId);
      return { status: 'pending', reason };
    }

    let isMatch = true;
    let geminiReason = '';

    if (isExtractedValid && cleanExtracted !== nic) {
      isMatch = false;
      geminiReason = `AI Verification failed. Uploaded document shows NIC "${extractedNic}", but system has registered "${customer?.nic_number || nic}".`;
    }

    let newStatus: 'verified' | 'rejected' | 'pending' = 'pending';
    let finalReason: string | null = null;

    if (extractedNic === 'NONE') {
      newStatus = 'pending';
      finalReason = 'AI could not read the NIC number from this image. Pending manual review.';
    } else {
      newStatus = isMatch ? 'verified' : 'rejected';
      finalReason = isMatch ? null : geminiReason;
    }

    await sb.from('customer_documents').update({
      verification_status: newStatus,
      verified_by: verifiedById,
      verified_at: new Date().toISOString(),
      rejection_reason: finalReason,
    }).eq('id', docId);

    if (newStatus === 'rejected') {
      // Trigger a notification on mismatch
      notify({
        kind: 'nic_mismatch',
        customerName: customer?.full_name || 'Customer',
        nic,
        message: `Uploaded document for ${documentType.replace('_', ' ')}: ${geminiReason}`,
      }).catch(err => console.error('[NOTIFY] Error dispatching mismatch notification:', err));
    }

    return { status: newStatus, reason: finalReason ?? undefined };
  }

  // Other document types stay pending for manual review
  return { status: 'verified' };
}

export default async function documentRoutes(app: FastifyInstance) {

  // ── POST /customers/:customerId/documents ─────────────────
  // Upload a single document (multipart/form-data)
  // Field: file  + field: document_type
  app.post('/:customerId/documents', {
    preHandler: [authenticate],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = req.params as { customerId: string };
    const user = req.user!;

    if (!await assertCanAccessCustomer(customerId, user.id, user.role, reply)) return;

    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let originalFilename = '';
    let mimeType = '';
    let documentType: string | null = null;
    let fileSize = 0;

    for await (const part of parts) {
      if (part.type === 'file') {
        mimeType = part.mimetype;
        originalFilename = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
        fileSize = fileBuffer.length;
      } else if (part.type === 'field' && part.fieldname === 'document_type') {
        documentType = part.value as string;
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!documentType || !DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}`,
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return reply.status(400).send({
        error: 'Unsupported file type',
        message: `Allowed types: JPEG, PNG, HEIC, WEBP, PDF`,
      });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return reply.status(400).send({
        error: 'File too large',
        message: 'Maximum file size is 20 MB',
      });
    }

    const sb = getSupabase();

    // Check the customer exists
    const { data: customer } = await sb.from('customers').select('id, full_name').eq('id', customerId).single();
    if (!customer) return reply.status(404).send({ error: 'Customer not found' });

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `customers/${customerId}/documents/${documentType}_${timestamp}.${ext(mimeType)}`;

    const { error: uploadErr } = await sb.storage
      .from('customer_documents')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadErr) {
      return reply.status(500).send({ error: 'Storage Upload Failed', message: uploadErr.message });
    }

    // If a document of this type already exists for this customer, soft-replace it
    const { data: existing } = await sb
      .from('customer_documents')
      .select('id')
      .eq('customer_id', customerId)
      .eq('document_type', documentType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: docRow, error } = await sb
      .from('customer_documents')
      .insert({
        customer_id:       customerId,
        document_type:     documentType,
        storage_path:      storagePath,
        original_filename: originalFilename,
        mime_type:         mimeType,
        file_size_bytes:   fileSize,
        verification_status: 'pending',
        uploaded_by:       user.id,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Delete the superseded record so only latest is active
    if (existing) {
      await sb.from('customer_documents').delete().eq('id', existing.id);
    }

    // ── AI Auto-verification for NIC and Selfie ────────────────
    // System automatically validates NIC format and approves selfies
    const autoResult = await autoVerifyDocument(customerId, docRow.id, documentType, user.id, fileBuffer, mimeType);

    // Recompute verification completeness
    await updateVerificationStatus(customerId);

    writeAuditLog({
      user_id:     user.id,
      action:      AuditActions.CUSTOMER_DOCUMENTS_UPLOADED,
      entity_type: 'customer_documents',
      entity_id:   docRow.id,
      new_values:  { customer_id: customerId, document_type: documentType, file_size_bytes: fileSize },
      ip_address:  req.ip,
    });

    // Return signed URL from Supabase Storage for immediate preview (15 min)
    const { data: signedData, error: signErr } = await sb.storage
      .from('customer_documents')
      .createSignedUrl(storagePath, 900);

    if (signErr || !signedData?.signedUrl) {
      return reply.status(500).send({ error: 'Failed to generate preview URL' });
    }

    return reply.status(201).send({
      data: {
        ...docRow,
        signed_url: signedData.signedUrl,
        label:      DOCUMENT_LABELS[documentType as DocumentType],
        auto_verification: autoResult,
      },
    });
  });

  // ── GET /customers/:customerId/documents ──────────────────
  app.get('/:customerId/documents', {
    preHandler: [authenticate],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = req.params as { customerId: string };
    const user = req.user!;

    if (!await assertCanAccessCustomer(customerId, user.id, user.role, reply)) return;

    const { data, error } = await getSupabase()
      .from('customer_documents')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });

    const sb = getSupabase();
    const withUrls = await Promise.all((data ?? []).map(async (doc) => {
      const { data: signedData } = await sb.storage
        .from('customer_documents')
        .createSignedUrl(doc.storage_path, 900);
      return {
        ...doc,
        label:      DOCUMENT_LABELS[doc.document_type as DocumentType] ?? doc.document_type,
        signed_url: signedData?.signedUrl ?? '',
      };
    }));

    // Also compute which required docs are still missing
    const uploadedTypes = new Set(withUrls.map(d => d.document_type));
    const missing = REQUIRED_FOR_VERIFICATION.filter(t => !uploadedTypes.has(t));

    return reply.send({
      data:             withUrls,
      missing_required: missing,
      is_complete:      missing.length === 0,
    });
  });

  // ── POST /customers/:customerId/documents/:docId/verify ──
  // Staff-only: approve or reject a document
  app.post('/:customerId/documents/:docId/verify', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId, docId } = req.params as { customerId: string; docId: string };
    const body = z.object({
      status: z.enum(['verified', 'rejected']),
      rejection_reason: z.string().max(500).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('customer_documents')
      .update({
        verification_status: body.data.status,
        verified_by:         req.user!.id,
        verified_at:         new Date().toISOString(),
        rejection_reason:    body.data.rejection_reason ?? null,
      })
      .eq('id', docId)
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error) return reply.status(404).send({ error: 'Document not found' });

    await updateVerificationStatus(customerId);

    writeAuditLog({
      user_id:     req.user!.id,
      action:      body.data.status === 'verified' ? AuditActions.CUSTOMER_VERIFIED : AuditActions.CUSTOMER_UPDATED,
      entity_type: 'customer_documents',
      entity_id:   docId,
      new_values:  { status: body.data.status, rejection_reason: body.data.rejection_reason },
    });

    return reply.send({ data });
  });
}

// ── Recompute & persist document verification completeness ────
async function updateVerificationStatus(customerId: string): Promise<void> {
  const sb = getSupabase();

  const { data: docs } = await sb
    .from('customer_documents')
    .select('document_type, verification_status')
    .eq('customer_id', customerId);

  if (!docs) return;

  const uploadedTypes = new Set(docs.map(d => d.document_type));
  const allRequired   = REQUIRED_FOR_VERIFICATION.every(t => uploadedTypes.has(t));
  const anyRejected   = docs.some(d => d.verification_status === 'rejected');
  const allVerified   = REQUIRED_FOR_VERIFICATION.every(t =>
    docs.some(d => d.document_type === t && d.verification_status === 'verified')
  );

  let newStatus = 'incomplete';
  if (allVerified) {
    newStatus = 'verified';
  } else if (allRequired && !anyRejected) {
    newStatus = 'pending_review';
  } else if (anyRejected) {
    newStatus = 'rejected';
  }

  await sb
    .from('customers')
    .update({ document_verification_status: newStatus })
    .eq('id', customerId);
}
