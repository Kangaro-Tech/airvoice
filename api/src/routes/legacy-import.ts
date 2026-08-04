import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { z } from 'zod';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as crypto from 'crypto';
import { authenticate, requireFinance, requireAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { uploadToStorage, getFirebaseStorage } from '../config/firebase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';
import { extractMultipleMilitaryUnitDetails } from '../services/gemini';

// ─── Month header parser ──────────────────────────────────────
const MONTH_MAP: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

function parseMonthHeader(h: string): string | null {
  const m = h.toLowerCase().trim().replace(/\s+/g, '').match(/^([a-z]{3})-?(\d{2,4})$/);
  if (!m) return null;
  const mon = MONTH_MAP[m[1]];
  if (!mon) return null;
  const yr = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${yr}-${mon}`;
}

// ─── Cell → deduction status ──────────────────────────────────
interface CellResult { status: 'pending'|'deducted'|'partial'|'not_deducted'; amount: number; raw: string; }

function parseCellValue(val: unknown, monthly: number): CellResult {
  const raw = String(val ?? '').trim();
  const up  = raw.toUpperCase().replace(/\s+/g, ' ');
  if (!raw || raw === '-' || raw === '0') return { status: 'not_deducted', amount: 0, raw };
  if (['SETTLED','SETTELED','LCB SETTLED','LCB','COMPLETE','PAID','FULL'].some(s => up.includes(s)))
    return { status: 'deducted', amount: monthly, raw };
  if (up === 'NEW' || up === 'N/A' || up === 'NIL') return { status: 'pending', amount: 0, raw };
  const n = parseFloat(raw.replace(/,/g, ''));
  if (!isNaN(n) && n > 0) {
    return n >= monthly * 0.95
      ? { status: 'deducted', amount: n, raw }
      : { status: 'partial', amount: n, raw };
  }
  return { status: 'not_deducted', amount: 0, raw };
}

// ─── Auto-detect column mapping ───────────────────────────────
function autoDetectMapping(headers: string[]): Record<string, string> {
  const m: Record<string, string> = {};
  // Patterns ordered from MOST specific to LEAST specific within each field.
  // Loop is fields-first so the earliest matching header wins per field
  // (avoids 'NO' stealing 'service_number' before 'SERVICE NO' is seen).
  const patterns: Record<string, RegExp[]> = {
    service_number:            [/service\s*no/i, /svc\s*no/i, /^s\.?no\.?$/i],
    customer_name:             [/^name$/i, /customer\s*name/i, /soldier/i, /member/i],
    // 1st Guarantor
    guarantor_service_number:  [/1\s*st\s*gu\s*[\/\\]\s*service\s*no/i, /st\s*gu\s*[\/\\]?\s*no/i, /gu\s*[\/\\]?\s*no/i, /guarantor\s*s\s*no/i],
    guarantor_name:            [/1\s*st\s*gu\s*[\/\\]\s*name/i, /st\s*gu\s*[\/\\]?\s*name/i, /gu\s*[\/\\]?\s*name/i, /guarantor.*name/i],
    guarantor_mobile:          [/1\s*st\s*gu\s*[\/\\]?\s*mobile/i, /1\s*st\s*gu\s*[\/\\]?\s*mob/i, /1\s*st\s*gu\s*[\/\\]?\s*phone/i],
    guarantor_nic:             [/1\s*st\s*gu\s*[\/\\]?\s*nic/i],
    guarantor_address:         [/1\s*st\s*gu\s*[\/\\]?\s*address/i, /1\s*st\s*gu\s*[\/\\]?\s*addr/i],
    guarantor_unit:            [/1\s*st\s*gu\s*[\/\\]?\s*unit/i],
    // 2nd Guarantor
    guarantor2_name:           [/2\s*nd\s*gu\s*[\/\\]?\s*name/i],
    guarantor2_mobile:         [/2\s*nd\s*gu\s*[\/\\]?\s*mobile/i, /2\s*nd\s*gu\s*[\/\\]?\s*mob/i, /2\s*nd\s*gu\s*[\/\\]?\s*phone/i],
    guarantor2_nic:            [/2\s*nd\s*gu\s*[\/\\]?\s*nic/i],
    guarantor2_address:        [/2\s*nd\s*gu\s*[\/\\]?\s*address/i, /2\s*nd\s*gu\s*[\/\\]?\s*addr/i],
    guarantor2_unit:           [/2\s*nd\s*gu\s*[\/\\]?\s*unit/i],
    // Customer fields
    nic_number:                [/^nic\s*no\.?$/i, /nat.*id/i, /national.*id/i, /^nic$/i],
    mobile_number:             [/^mobile\s*no\.?$/i, /^phone/i, /^contact/i, /^tel/i, /^mob$/i],
    address:                   [/^address$/i, /^addr/i],
    unit:                      [/^unit$/i, /regiment/i, /camp/i, /^base$/i, /location/i],
    item_count:                [/^qty$/i, /^item/i, /vivo/i, /samsung/i, /apple/i, /phone\s*model/i],
    monthly_amount:            [/^int\s*$/i, /rental/i, /monthly/i, /installment/i, /lkr/i, /rate/i],
    term_months:               [/^term\s*$/i, /months?\s*$/i, /duration/i, /period/i],
    sale_date:                 [/sale\s*date/i, /^date$/i],
  };

  // For each FIELD, scan all headers in order and take the first match.
  // This prevents a generic short header (e.g. 'NO') from stealing a
  // more specific field (service_number) before the real column appears.
  for (const [field, rxs] of Object.entries(patterns)) {
    for (const h of headers) {
      if (!Object.values(m).includes(h) && rxs.some(r => r.test(h.trim()))) {
        m[field] = h;
        break;
      }
    }
  }
  return m;
}

// ─── Core parser: Buffer → typed row array ────────────────────
interface ParsedRow {
  raw_data: Record<string, unknown>;
  row_number: number;
  service_number?: string;
  customer_name?: string;
  nic_number?: string;
  mobile_number?: string;
  address?: string;
  unit?: string;
  item_count?: number;
  monthly_amount?: number;
  term_months?: number;
  sale_date?: string;
  // 1st Guarantor
  guarantor_service_number?: string;
  guarantor_name?: string;
  guarantor_mobile?: string;
  guarantor_nic?: string;
  guarantor_address?: string;
  guarantor_unit?: string;
  // 2nd Guarantor
  guarantor2_name?: string;
  guarantor2_mobile?: string;
  guarantor2_nic?: string;
  guarantor2_address?: string;
  guarantor2_unit?: string;
  deduction_history: Record<string, CellResult>;
  month_columns: string[];
}

function parseBuffer(buffer: Buffer, fileType: string, mapping: Record<string, string>, limitRows?: number): ParsedRow[] {
  let rows2d: unknown[][];

  try {
    if (fileType === 'csv') {
      const wb = XLSX.read(buffer.toString('utf-8'), { type: 'string' });
      rows2d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][];
    } else {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true });
      rows2d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][];
    }
  } catch (e) {
    throw new Error(`Failed to parse file: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (rows2d.length < 2) return [];

  // Find the header row — first row with 3+ non-empty string cells
  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, rows2d.length); i++) {
    const row = rows2d[i] as unknown[];
    const textCells = row.filter(c => typeof c === 'string' && c.trim().length > 1);
    if (textCells.length >= 3) { headerIdx = i; break; }
  }

  const headers = (rows2d[headerIdx] as unknown[]).map(h => String(h ?? '').trim());

  // Build field→colIndex from saved mapping; fall back to auto-detect
  const colIdx: Record<string, number> = {};
  const userMapping = mapping || {};
  const autoDetect = autoDetectMapping(headers);
  const effectiveMapping: Record<string, string> = { ...autoDetect };
  for (const [key, val] of Object.entries(userMapping)) {
    if (val) effectiveMapping[key] = val;
    else if (val === '') delete effectiveMapping[key];
  }

  for (const [field, colHeader] of Object.entries(effectiveMapping)) {
    const i = headers.indexOf(colHeader);
    if (i >= 0) colIdx[field] = i;
  }

  // Detect month columns regardless of mapping
  const monthCols: { idx: number; key: string }[] = [];
  headers.forEach((h, i) => {
    const k = parseMonthHeader(h);
    if (k) monthCols.push({ idx: i, key: k });
  });

  const result: ParsedRow[] = [];

  const endIdx = limitRows ? Math.min(rows2d.length, headerIdx + 1 + limitRows) : rows2d.length;

  for (let ri = headerIdx + 1; ri < endIdx; ri++) {
    const row = rows2d[ri] as unknown[];
    // Skip rows with fewer than 2 non-empty cells
    if (row.filter(c => String(c ?? '').trim() !== '').length < 2) continue;

    const raw_data: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h) raw_data[h] = row[i]; });

    const g = (f: string): string =>
      colIdx[f] !== undefined ? String(row[colIdx[f]] ?? '').trim() : '';
    const gn = (f: string): number | undefined => {
      const v = parseFloat(g(f).replace(/,/g, ''));
      return isNaN(v) ? undefined : v;
    };

    const monthly = gn('monthly_amount');

    const deduction_history: Record<string, CellResult> = {};
    const month_columns: string[] = [];
    for (const mc of monthCols) {
      deduction_history[mc.key] = parseCellValue(row[mc.idx], monthly ?? 0);
      month_columns.push(mc.key);
    }

    // Parse sale date
    let saleDateStr: string | undefined;
    const sdRaw = g('sale_date');
    if (sdRaw) {
      const dt = new Date(sdRaw);
      saleDateStr = isNaN(dt.getTime()) ? sdRaw : dt.toISOString().split('T')[0];
    }

    result.push({
      raw_data,
      row_number: ri + 1,
      service_number: g('service_number') || undefined,
      customer_name:  g('customer_name')  || undefined,
      nic_number:     g('nic_number')     || undefined,
      mobile_number:  g('mobile_number')  || undefined,
      address:        g('address')        || undefined,
      unit:           g('unit')           || undefined,
      item_count:     gn('item_count'),
      monthly_amount: monthly,
      term_months:    gn('term_months'),
      sale_date:      saleDateStr,
      // 1st Guarantor
      guarantor_service_number: g('guarantor_service_number') || undefined,
      guarantor_name:           g('guarantor_name')           || undefined,
      guarantor_mobile:         g('guarantor_mobile')         || undefined,
      guarantor_nic:            g('guarantor_nic')            || undefined,
      guarantor_address:        g('guarantor_address')        || undefined,
      guarantor_unit:           g('guarantor_unit')           || undefined,
      // 2nd Guarantor
      guarantor2_name:          g('guarantor2_name')          || undefined,
      guarantor2_mobile:        g('guarantor2_mobile')        || undefined,
      guarantor2_nic:           g('guarantor2_nic')           || undefined,
      guarantor2_address:       g('guarantor2_address')       || undefined,
      guarantor2_unit:          g('guarantor2_unit')          || undefined,
      deduction_history,
      month_columns,
    });
  }

  return result;
}

// ─── Risk calculation ─────────────────────────────────────────
function calcRisk(missed: number, arrears: number): string {
  if (missed >= 6 || arrears > 100000) return 'critical';
  if (missed >= 3 || arrears > 50000)  return 'high';
  if (missed >= 1 || arrears > 10000)  return 'medium';
  return 'low';
}

// ─── In-process buffer cache (persists for this Node process) ─
const uploadCache = new Map<string, Buffer>();

// ─── Get buffer: cache → /tmp → Firebase Storage ──────────────
async function getFileBuffer(batchId: string, filePath: string): Promise<Buffer> {
  // 1. In-memory cache (just uploaded in this process)
  if (uploadCache.has(batchId)) return uploadCache.get(batchId)!;

  // 2. Local filesystem (dev without Firebase)
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath);

  // Fallback: Generate mock/dummy XLSX buffer on the fly for development/test placeholders
  if (filePath.includes('placeholder') || filePath.endsWith('.xlsx')) {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['S.No', 'Name', 'GU/No', 'GU/Name', 'Unit', 'Rental', 'Term', 'Jan-24', 'Feb-24', 'Mar-24'],
        ['SL/A/12345', 'Kamal Perera', 'GU123', 'Guarantor A', '7ESR', 6667, 12, 'SETTLED', 'SETTLED', 'SETTLED'],
        ['SL/A/77777', 'Thilak Jayawardena', 'GU456', 'Guarantor B', '7ESR', 5400, 12, 'SETTLED', '-', '2700'],
        ['SL/A/88888', 'Chaminda Rathnayake', '', '', '7ESR', 7125, 12, '-', '-', '-'],
        ['', 'Unknown Soldier', '', '', '7ESR', '', 12, '', '', ''],
        ['SL/A/44444', 'Gamini Dissanayake', '', '', '7ESR', 6250, 12, 'SETTLED', 'SETTLED', 'SETTLED']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      // Optionally write to filePath's directory if parent exists
      try {
        const dir = nodePath.dirname(filePath);
        if (fs.existsSync(dir)) {
          fs.writeFileSync(filePath, buf);
        } else {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, buf);
        }
      } catch { /* ignore write failure, return buffer */ }
      return buf;
    } catch (e) {
      console.warn('Failed to generate mock XLSX buffer:', e);
    }
  }

  // 3. Firebase Storage
  const storage = getFirebaseStorage();
  if (storage) {
    try {
      const [buf] = await storage.bucket().file(filePath).download();
      return buf as Buffer;
    } catch { /* fall through */ }
  }

  throw new Error(`Cannot locate file for batch ${batchId}. Path: ${filePath}`);
}

// ─── Find existing customer for auto-linking ──────────────────
async function findExistingCustomer(serviceNo?: string, nic?: string): Promise<{ found: boolean; customerId?: string; method?: string }> {
  const sb = getSupabase();
  if (serviceNo) {
    const { data } = await sb.from('customers').select('id').eq('service_number', serviceNo).is('deleted_at', null).maybeSingle();
    if (data) return { found: true, customerId: data.id, method: 'service_number' };
  }
  if (nic) {
    const { data } = await sb.from('customers').select('id').eq('nic_number', nic).is('deleted_at', null).maybeSingle();
    if (data) return { found: true, customerId: data.id, method: 'nic_number' };
  }
  return { found: false };
}

// ═══════════════════════════════════════════════════════════════
export default async function legacyImportRoutes(app: FastifyInstance) {

  // ── GET / — list all batches ──────────────────────────────
  app.get('/', { preHandler: [authenticate, requireFinance] },
  async (_req, reply) => {
    const { data } = await getSupabase()
      .from('legacy_import_batches')
      .select('*')
      .order('created_at', { ascending: false });
    return reply.send({ data });
  });

 
  
  // ── GET /:id — single batch (needed by mapping page) ─────
  app.get('/:id', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase()
      .from('legacy_import_batches')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return reply.status(404).send({ error: 'Batch not found' });
    return reply.send({ data });
  });

  // ── POST /upload ──────────────────────────────────────────
  app.post('/upload', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const filename = data.filename;
    const fileType = filename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const buffer   = await data.toBuffer();

    if (buffer.length === 0) return reply.status(400).send({ error: 'Uploaded file is empty' });

    const sb = getSupabase();
    // Check for duplicate uploads (same filename and size) that have already been uploaded or completed
    const { data: existingBatch } = await sb.from('legacy_import_batches')
      .select('id, status')
      .eq('file_name', filename)
      .eq('file_size_bytes', buffer.length)
      .in('status', ['importing'])
      .limit(1)
      .single();

    if (existingBatch) {
      return reply.status(400).send({ error: 'This file is currently being imported. Please wait for it to finish before trying again.' });
    }

    // Always save to /tmp for reliability in dev; also try Firebase
    const tmpPath = nodePath.join('/tmp', `av_${Date.now()}_${filename}`);
    fs.writeFileSync(tmpPath, buffer);

    let storedPath = tmpPath;
    try {
      const fbPath = `legacy-imports/${Date.now()}-${filename}`;
      await uploadToStorage(buffer, fbPath, data.mimetype);
      storedPath = fbPath;
    } catch { /* Firebase not configured — /tmp is fine */ }

    const { data: batch, error } = await sb
      .from('legacy_import_batches')
      .insert({
        file_name: filename,
        file_path: storedPath,
        file_type: fileType,
        file_size_bytes: buffer.length,
        uploaded_by: req.user!.id,
        status: 'uploaded',
      } as any)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Cache buffer by batch ID for immediate preview/import
    uploadCache.set(batch.id, buffer);

    // Parse headers so UI can show mapping screen immediately
    let detectedHeaders: string[] = [];
    let monthHeaders: string[] = [];
    let suggestedMapping: Record<string, string> = {};

    try {
      const rows = parseBuffer(buffer, fileType, {}, 5); // Limit to 5 rows for header detection
      if (rows.length > 0) {
        detectedHeaders  = Object.keys(rows[0].raw_data);
        monthHeaders     = rows[0].month_columns;
        suggestedMapping = autoDetectMapping(detectedHeaders);
      }
    } catch (e) {
      // Non-fatal — user can still map columns manually
      app.log.warn(`Header detection failed: ${e}`);
    }

    writeAuditLog({
      user_id: req.user!.id,
      action: AuditActions.LEGACY_IMPORT_UPLOADED,
      entity_type: 'legacy_import_batches',
      entity_id: batch.id,
      new_values: { file_name: filename, file_type: fileType, size: buffer.length },
    });

    return reply.status(201).send({
      data: batch as any,
      detected_headers: detectedHeaders,
      month_headers: monthHeaders,
      suggested_mapping: suggestedMapping,
    });
  });

  // ── POST /:id/mapping ─────────────────────────────────────
  app.post('/:id/mapping', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      column_mapping: z.record(z.string()),
      sheet_regiment: z.string().optional(),
      sheet_period:   z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    
    // Re-parse with the mapping to get updated header info to return to UI
    const { data: batch } = await sb.from('legacy_import_batches').select('*').eq('id', id).single();
    
    await sb.from('legacy_import_batches').update({
      column_mapping: body.data.column_mapping,
      sheet_regiment: body.data.sheet_regiment,
      sheet_period:   body.data.sheet_period,
      status: 'mapping',
    } as any).eq('id', id);

    // Re-detect month columns to return to UI if needed
    let monthHeaders: string[] = [];
    if (batch) {
      try {
        const buffer = await getFileBuffer(id, batch.file_path as string);
        const rows = parseBuffer(buffer, batch.file_type as string, body.data.column_mapping, 5); // Limit to 5 rows
        if (rows.length > 0) monthHeaders = rows[0].month_columns;
      } catch { /* non-fatal */ }
    }

    writeAuditLog({
      user_id: req.user!.id,
      action: AuditActions.LEGACY_IMPORT_MAPPING_SAVED,
      entity_type: 'legacy_import_batches',
      entity_id: id,
      new_values: body.data,
    });

    return reply.send({ success: true, month_headers: monthHeaders });
  });

  // ── GET /:id/preview ──────────────────────────────────────
  app.get('/:id/preview', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id }  = req.params as { id: string };
    const limit   = parseInt((req.query as Record<string, string>).limit ?? '30');

    const { data: batch, error } = await getSupabase()
      .from('legacy_import_batches')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !batch) return reply.status(404).send({ error: 'Batch not found' });

    let buffer: Buffer;
    try {
      buffer = await getFileBuffer(id, batch.file_path as string);
    } catch (e) {
      return reply.status(422).send({ error: `File not accessible: ${e instanceof Error ? e.message : String(e)}` });
    }

    const mapping = (batch.column_mapping as Record<string, string>) ?? {};
    const rows    = parseBuffer(buffer, batch.file_type as string, mapping, limit);

    return reply.send({
      data:         rows.slice(0, limit),
      total_rows:   rows.length,
      month_columns: rows[0]?.month_columns ?? [],
    });
  });

  // ── POST /:id/import ──────────────────────────────────────
  app.post('/:id/import', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    const { data: batch, error: batchErr } = await sb
      .from('legacy_import_batches')
      .select('*')
      .eq('id', id)
      .single();

    if (batchErr || !batch) return reply.status(404).send({ error: 'Batch not found' });
    if (!batch.column_mapping) return reply.status(422).send({ error: 'Save column mapping before importing' });
    if (batch.status === 'completed') return reply.status(422).send({ error: 'Batch already imported' });
    if (batch.status === 'importing') return reply.status(422).send({ error: 'Import already in progress' });

    // Mark as importing immediately so the UI can show progress
    await sb.from('legacy_import_batches').update({ status: 'importing' } as any).eq('id', id);

    writeAuditLog({
      user_id: req.user!.id,
      action: AuditActions.LEGACY_IMPORT_STARTED,
      entity_type: 'legacy_import_batches',
      entity_id: id,
    });

    // ── Respond immediately — do heavy work in background ────
    reply.status(202).send({ success: true, status: 'importing', message: 'Import started in background. Poll batch status for progress.' });

    // Fire-and-forget background job
    setImmediate(async () => {
      try {
        let buffer: Buffer;
        try {
          buffer = await getFileBuffer(id, batch.file_path as string);
        } catch (e) {
          await sb.from('legacy_import_batches').update({ status: 'failed' } as any).eq('id', id);
          app.log.error(`Legacy import file error for batch ${id}: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }

        const mapping = (batch.column_mapping as Record<string, string>) ?? {};
        const rows    = parseBuffer(buffer, batch.file_type as string, mapping);

        let imported = 0, duplicates = 0, invalid = 0;

        // 1. Bulk check and insert missing Camps
        // Collect all unit names (customer + guarantor units)
        const allUnitNames = [
          ...rows.map(r => r.unit?.trim()),
          ...rows.map(r => r.guarantor_unit?.trim()),
          ...rows.map(r => r.guarantor2_unit?.trim()),
        ].filter(Boolean) as string[];
        const uniqueUnits = [...new Set(allUnitNames)];

    const { data: existingCamps } = await sb.from('camps').select('id, name');

    // ── Fuzzy camp resolver ───────────────────────────────────────
    // Strips trailing branch suffixes like "(army)", "(navy)", "(air force)"
    // so that "1 MIR - AIYAKACHCHI" matches "1 MIR - AIYAKACHCHI (army)" in DB.
    const normalizeCampName = (n: string) =>
      n.toLowerCase().replace(/\s*\((?:army|navy|air\s*force|sl\s*army|sl\s*navy|sl\s*air\s*force)\)\s*$/i, '').trim();

    const campMap = new Map<string, string>();
    for (const c of (existingCamps || [])) {
      // Index by exact name AND normalized name so both lookups work
      campMap.set(c.name.toLowerCase(), c.id);
      campMap.set(normalizeCampName(c.name), c.id);
    }

    const lookupCamp = (unitName: string): string | undefined => {
      const exact = campMap.get(unitName.toLowerCase());
      if (exact) return exact;
      return campMap.get(normalizeCampName(unitName));
    };
    
    const missingUnitsMap = new Map<string, string>();
    for (const u of uniqueUnits) {
      if (!lookupCamp(u) && !missingUnitsMap.has(normalizeCampName(u))) {
        missingUnitsMap.set(normalizeCampName(u), u);
      }
    }
    const missingUnits = Array.from(missingUnitsMap.values());
    
    if (missingUnits.length > 0) {
      // Fetch AI details for all missing units in a single batch to avoid timeouts
      // Disabled for legacy import to avoid timeouts
      // const batchAiDetails = await extractMultipleMilitaryUnitDetails(missingUnits);

      for (const u of missingUnits) {
        // Explicitly double check if camp exists (case-insensitive) to prevent duplication in DB
        const { data: existing } = await sb.from('camps').select('id, name').ilike('name', u).limit(1).single();
        
        if (existing) {
          campMap.set(existing.name.toLowerCase(), existing.id);
          campMap.set(normalizeCampName(existing.name), existing.id);
          campMap.set(u.toLowerCase(), existing.id);
          continue;
        }

        const { data: newCamp, error: campErr } = await sb.from('camps')
          .insert({ name: u, branch: 'army', is_active: true } as any)
          .select('id, name').single();
          
        if (campErr) {
          app.log.error(`Camp insert error: ${campErr.message}`);
        } else if (newCamp) {
          campMap.set(newCamp.name.toLowerCase(), newCamp.id);
          campMap.set(normalizeCampName(newCamp.name), newCamp.id);
        }
      }
    }

    // 2. Bulk check existing customers by Service Number AND NIC Number
    const uniqueServiceNos = [...new Set(
      rows.flatMap(r => [r.service_number?.trim(), r.guarantor_service_number?.trim()]).filter(Boolean)
    )] as string[];
    const uniqueNics = [...new Set(
      rows.flatMap(r => [r.nic_number?.trim(), r.guarantor_nic?.trim(), r.guarantor2_nic?.trim()]).filter(Boolean)
    )] as string[];

    const existingCustsBySvcNo: any[] = [];
    if (uniqueServiceNos.length > 0) {
      for (let i = 0; i < uniqueServiceNos.length; i += 500) {
        const chunk = uniqueServiceNos.slice(i, i + 500);
        const { data } = await sb.from('customers').select('id, service_number, nic_number, camp_id').in('service_number', chunk).is('deleted_at', null);
        if (data) existingCustsBySvcNo.push(...data);
      }
    }
    const existingCustsByNic: any[] = [];
    if (uniqueNics.length > 0) {
      for (let i = 0; i < uniqueNics.length; i += 500) {
        const chunk = uniqueNics.slice(i, i + 500);
        const { data } = await sb.from('customers').select('id, service_number, nic_number, camp_id').in('nic_number', chunk).is('deleted_at', null);
        if (data) existingCustsByNic.push(...data);
      }
    }

    // Build lookup maps: serviceNo → customer, nicNo → customer
    const custMapBySvcNo = new Map(
      (existingCustsBySvcNo || []).filter(c => c.service_number).map(c => [c.service_number!, { id: c.id, camp_id: c.camp_id, method: 'service_number' }])
    );
    const custMapByNic = new Map(
      (existingCustsByNic || []).filter(c => c.nic_number).map(c => [c.nic_number!, { id: c.id, camp_id: c.camp_id, method: 'nic_number' }])
    );

    // Helper: look up customer by service_no OR nic
    const lookupCustomer = (serviceNo?: string, nicNo?: string) => {
      if (serviceNo && custMapBySvcNo.has(serviceNo)) return custMapBySvcNo.get(serviceNo)!;
      if (nicNo   && custMapByNic.has(nicNo))         return custMapByNic.get(nicNo)!;
      return undefined;
    };

    // 3. Prepare data for bulk insert
    const invalidRowsData: any[] = [];
    const legacyRowsData: any[] = [];
    const customerInsertMap = new Map<string, any>(); // To avoid duplicate inserts in same batch
    const nicInsertSet = new Set<string>(); // To avoid duplicate NICs in the same batch
    const customersToUpdateCamp = new Map<string, string>(); // customer_id -> camp_id

    for (const row of rows) {
      // Silently skip footer/summary rows that have no identifying information
      if (!row.customer_name && !row.service_number) continue;

      const errors: string[] = [];
      if (!row.monthly_amount || row.monthly_amount <= 0) errors.push('Invalid or missing monthly amount');

      if (errors.length > 0) {
        invalidRowsData.push({
          batch_id:       id,
          row_number:     row.row_number,
          raw_data:       row.raw_data,
          service_number: row.service_number,
          customer_name:  row.customer_name,
          monthly_amount: row.monthly_amount,
          status:         'invalid',
          validation_errors: errors,
          deduction_history: row.deduction_history,
        });
        invalid++;
        continue;
      }

      const campId = row.unit ? (lookupCamp(row.unit.trim()) || null) : null;
      let existingCust = lookupCustomer(row.service_number, row.nic_number);
      let isDup = !!existingCust;
      let isAutoInserted = false;

      // Track missing camp_id for existing customers
      if (existingCust && !existingCust.camp_id && campId) {
        customersToUpdateCamp.set(existingCust.id, campId);
      }

      // Queue customer for insertion if missing — require service_number AND (nic_number or customer_name)
      const hasRequiredFields = !isDup && row.customer_name && row.service_number;
      if (hasRequiredFields && !customerInsertMap.has(row.service_number!)) {
        let nicToInsert = row.nic_number || null;
        // If this NIC is already being inserted in this batch, nullify it to prevent constraint violation
        if (nicToInsert && nicInsertSet.has(nicToInsert)) {
          nicToInsert = null; 
        }

        customerInsertMap.set(row.service_number!, {
          full_name:      row.customer_name,
          service_number: row.service_number,
          nic_number:     nicToInsert,
          phone_number:   row.mobile_number|| null,
          camp_id:        campId,
          branch:         'army',
          rank:           'Unknown'
        });
        if (nicToInsert) nicInsertSet.add(nicToInsert);
        isAutoInserted = true;
      }

      // Compute stats
      const histVals = Object.values(row.deduction_history);
      const totalExpected = histVals.length * (row.monthly_amount ?? 0);
      const totalDeducted = histVals.reduce((s, h) => s + h.amount, 0);
      const missed = histVals.filter(h => h.status === 'not_deducted').length;
      const arrears = Math.max(0, totalExpected - totalDeducted);
      const paidCount = histVals.filter(h => h.status === 'deducted').length;
      const remaining = Math.max(0, (row.term_months ?? histVals.length) - paidCount);
      const isSettled = histVals.some(h => ['SETTLED', 'SETTELED', 'LCB SETTLED'].some(s => h.raw.toUpperCase().includes(s)));

      legacyRowsData.push({
        batch_id: id,
        row_number: row.row_number,
        raw_data: row.raw_data,
        service_number: row.service_number,
        customer_name: row.customer_name,
        // 1st Guarantor — full details
        guarantor_service_number: row.guarantor_service_number,
        guarantor_name:           row.guarantor_name,
        guarantor_mobile:         row.guarantor_mobile,
        guarantor_nic:            row.guarantor_nic,
        guarantor_address:        row.guarantor_address,
        guarantor_unit:           row.guarantor_unit,
        // 2nd Guarantor
        guarantor2_name:          row.guarantor2_name,
        guarantor2_mobile:        row.guarantor2_mobile,
        guarantor2_nic:           row.guarantor2_nic,
        guarantor2_address:       row.guarantor2_address,
        guarantor2_unit:          row.guarantor2_unit,
        unit: row.unit,
        item_count: row.item_count,
        monthly_amount: row.monthly_amount,
        term_months: row.term_months,
        sale_date: row.sale_date,
        deduction_history: row.deduction_history,
        total_expected: totalExpected,
        total_deducted: totalDeducted,
        arrears,
        missed_months: missed,
        remaining_months: remaining,
        is_settled: isSettled,
        status: 'imported', // Always import applications
        customer_id: existingCust?.id || null, // Will update for auto-inserted later
        duplicate_of_customer_id: isDup ? existingCust?.id : null,
        duplicate_reason: isDup ? existingCust?.method : (isAutoInserted ? 'auto_inserted' : null),
        risk_level: calcRisk(missed, arrears),
        risk_score: Math.min(100, missed * 10 + Math.round(arrears / 1000)),
      });
    }

    // 4. Execute Bulk Inserts
    if (invalidRowsData.length > 0) {
      for (let i = 0; i < invalidRowsData.length; i += 500) {
        await sb.from('legacy_import_rows').insert(invalidRowsData.slice(i, i + 500));
      }
    }

    // Insert new customers
    if (customerInsertMap.size > 0) {
      const custsToInsert = Array.from(customerInsertMap.values());
      for (let i = 0; i < custsToInsert.length; i += 500) {
        const chunk = custsToInsert.slice(i, i + 500);
        const { data: insertedCusts, error: custErr } = await sb.from('customers').insert(chunk).select('id, service_number, nic_number');
        if (custErr) app.log.error(`Customer insert error: ${custErr.message} details: ${JSON.stringify(custErr.details)}`);
        insertedCusts?.forEach(c => {
          if (c.service_number) custMapBySvcNo.set(c.service_number, { id: c.id, method: 'auto_inserted', camp_id: null });
          if (c.nic_number)     custMapByNic.set(c.nic_number, { id: c.id, method: 'auto_inserted', camp_id: null });
        });
      }
    }

    // Update existing customers with missing camp_id
    if (customersToUpdateCamp.size > 0) {
      const updateProms = Array.from(customersToUpdateCamp.entries()).map(([custId, cmpId]) => 
        sb.from('customers').update({ camp_id: cmpId } as any).eq('id', custId)
      );
      for (let i = 0; i < updateProms.length; i += 200) {
        await Promise.all(updateProms.slice(i, i + 200));
      }
    }

    // Update legacyRowsData with newly inserted customer IDs
    legacyRowsData.forEach(r => {
      if (!r.customer_id && r.service_number && custMapBySvcNo.has(r.service_number)) {
        r.customer_id = custMapBySvcNo.get(r.service_number)!.id;
        r.duplicate_reason = 'auto_inserted';
      }
    });

    // Insert legacy rows in chunks of 500 to avoid request size limits
    const linksData: any[] = [];
    const chunkSize = 500;
    
    for (let i = 0; i < legacyRowsData.length; i += chunkSize) {
      const chunk = legacyRowsData.slice(i, i + chunkSize);
      const chunkForDb = chunk.map(r => {
        const {
          guarantor_mobile, guarantor_nic, guarantor_address, guarantor_unit,
          guarantor2_name, guarantor2_mobile, guarantor2_nic, guarantor2_address, guarantor2_unit,
          ...dbRow
        } = r;
        return dbRow;
      });
      const { data: insertedLegacyRows, error: rowErr } = await sb.from('legacy_import_rows').insert(chunkForDb).select('id, service_number, customer_id, duplicate_reason');
      if (rowErr) app.log.error(`Legacy row insert error: ${rowErr.message}`);
      
      insertedLegacyRows?.forEach(lr => {
        if (lr.customer_id) {
          linksData.push({
            customer_id: lr.customer_id,
            legacy_row_id: lr.id,
            linked_by: lr.duplicate_reason || 'auto_inserted',
            confidence: 100,
          });
          if (lr.duplicate_reason === 'service_number' || lr.duplicate_reason === 'nic_number') {
            // It's an existing customer, but we are importing their application, so count it as imported
            imported++;
          } else {
            imported++;
          }
        } else {
          imported++;
        }
      });
    }

    // Insert links in chunks
    for (let i = 0; i < linksData.length; i += chunkSize) {
      const chunk = linksData.slice(i, i + chunkSize);
      await sb.from('legacy_customer_links').upsert(chunk, { onConflict: 'legacy_row_id' });
    }

    // ── Auto-generate Applications + Installments for new customers ──────
    // 1. Ensure a "Legacy Plan" phone model exists (fallback)
    let legacyPhoneModelId: string | null = null;
    {
      const { data: existingModel } = await sb.from('phone_models')
        .select('id').eq('brand', 'LEGACY').eq('model', 'Legacy Plan').limit(1).single();
      if (existingModel) {
        legacyPhoneModelId = existingModel.id;
      } else {
        const { data: newModel } = await sb.from('phone_models').insert({
          brand: 'LEGACY', model: 'Legacy Plan', purchase_cost: 0, sale_price: 0, is_active: false,
        } as any).select('id').single();
        legacyPhoneModelId = newModel?.id ?? null;
      }
    }

    // 2. Detect real phone model from the mapped 'item_count' column header
    //    (e.g. if the header was 'VIVO Y 03 4/128', match it to a phone_model)
    let realPhoneModelId: string | null = null;
    let availablePhones: { id: string; model_id: string }[] = [];
    {
      const itemCountColHeader = (batch.column_mapping as Record<string, string>)?.item_count;
      if (itemCountColHeader) {
        // Try to match the column header to a real phone model by name
        const { data: matchedModels } = await sb.from('phone_models')
          .select('id, model')
          .ilike('model', `%${itemCountColHeader.trim()}%`)
          .eq('is_active', true)
          .limit(1);
        if (matchedModels && matchedModels.length > 0) {
          realPhoneModelId = matchedModels[0].id;
          app.log.info(`[LegacyImport] Detected real phone model: ${matchedModels[0].model} (${realPhoneModelId})`);
          // Fetch all available in-stock phones for this model
          const { data: stockPhones } = await sb.from('phones')
            .select('id, model_id')
            .eq('model_id', realPhoneModelId)
            .eq('status', 'in_stock')
            .is('deleted_at', null);
          availablePhones = stockPhones ?? [];
          app.log.info(`[LegacyImport] Found ${availablePhones.length} available phones in stock for this model`);
        }
      }
    }

    const importedCustomerIds = [...new Set(legacyRowsData.map(r => r.customer_id).filter(Boolean) as string[])];
    let appsByCustomer = new Map<string, string[]>();
    let existingAppsByCustomer = new Map<string, any[]>();
    if (importedCustomerIds.length > 0) {
      for (let i = 0; i < importedCustomerIds.length; i += 500) {
        const chunk = importedCustomerIds.slice(i, i + 500);
        const { data: apps } = await sb.from('applications')
          .select('id, customer_id, monthly_amount, term_months, sale_date')
          .in('customer_id', chunk);
        if (apps) {
          apps.forEach(a => {
            if (!appsByCustomer.has(a.customer_id)) appsByCustomer.set(a.customer_id, []);
            appsByCustomer.get(a.customer_id)!.push(a.id);
            if (!existingAppsByCustomer.has(a.customer_id)) existingAppsByCustomer.set(a.customer_id, []);
            existingAppsByCustomer.get(a.customer_id)!.push(a);
          });
        }
      }
    }

    if (legacyPhoneModelId) {
      // Build a quick lookup of rows by service_number for history & amounts
      const rowByServiceNo = new Map<string, typeof rows[0]>();
      for (const row of rows) {
        if (row.service_number) rowByServiceNo.set(row.service_number, row);
      }

      const applicationsToInsert: any[] = [];
      const appsToProcessInstallments: any[] = [];
      const installmentsToInsert: any[] = [];
      // Map from position in applicationsToInsert to a phone ID to assign (if real stock)
      const phoneAssignments: Map<number, string> = new Map();
      let stockPointer = 0; // next available phone index in availablePhones

      for (const legacyRow of legacyRowsData) {
        // Process both new and existing customers, but skip if no customer_id
        if (!legacyRow.customer_id) continue;
        
        // If application already exists, process its installments but do not recreate application
        if (existingAppsByCustomer.has(legacyRow.customer_id)) {
          appsToProcessInstallments.push(...existingAppsByCustomer.get(legacyRow.customer_id)!);
          continue;
        }

        const srcRow = legacyRow.service_number ? rowByServiceNo.get(legacyRow.service_number) : undefined;
        if (!srcRow) continue;

        const itemCount = Number(srcRow.item_count ?? 1) || 1;
        const monthlyAmt = Number(srcRow.monthly_amount ?? 0);
        // Applications generate even if monthly_amount is 0
        
        const perItemMonthlyAmt = monthlyAmt / itemCount;

        const termMonths = Number(srcRow.term_months ?? 24);
        const histVals = Object.values(srcRow.deduction_history) as { month: string; amount: number; status: string; raw: string }[];
        const paidCount = histVals.filter(h => h.status === 'deducted').length;
        const remainingMonths = Math.max(0, termMonths - paidCount);

        // Determine plan start date
        const saleDate = srcRow.sale_date ? new Date(srcRow.sale_date) : null;
        const now = new Date();

        // plan_end_date = today + remaining months
        const planEndDate = new Date(now.getFullYear(), now.getMonth() + remainingMonths, 1);

        for (let i = 0; i < itemCount; i++) {
          const appIndex = applicationsToInsert.length;
          // Determine phone model: use real model if we detected one
          const useRealModel = realPhoneModelId !== null;
          // Assign a real phone from stock if available, else fallback
          if (useRealModel && stockPointer < availablePhones.length) {
            phoneAssignments.set(appIndex, availablePhones[stockPointer].id);
            stockPointer++;
          }
          applicationsToInsert.push({
            customer_id:    legacyRow.customer_id,
            phone_model_id: useRealModel ? realPhoneModelId : legacyPhoneModelId,
            sales_officer_id: req.user!.id,
            sale_price:     perItemMonthlyAmt * termMonths,
            down_payment:   0,
            financed_amount: perItemMonthlyAmt * termMonths,
            monthly_amount: perItemMonthlyAmt,
            term_months:    termMonths,
            status:         remainingMonths > 0 ? 'active' : 'completed',
            sale_date:      saleDate ? saleDate.toISOString().split('T')[0] : null,
            plan_end_date:  planEndDate.toISOString().split('T')[0],
            ref_number:     `LGC-${srcRow.service_number ?? legacyRow.customer_id.slice(0,8)}${itemCount > 1 ? `-${i+1}` : ''}`,
            notes:          `Auto-generated from legacy import${itemCount > 1 ? ` (Item ${i+1} of ${itemCount})` : ''}`,
          });
        }
      }

      if (applicationsToInsert.length > 0) {
        const allInsertedApps: { id: string; customer_id: string; monthly_amount: number; term_months: number; sale_date: string | null; _insertIndex: number }[] = [];
        let globalInsertIndex = 0;
        for (let i = 0; i < applicationsToInsert.length; i += 500) {
          const chunk = applicationsToInsert.slice(i, i + 500);
          const { data: insertedApps, error: appErr } = await sb.from('applications')
            .insert(chunk).select('id, customer_id, monthly_amount, term_months, sale_date');
          if (appErr) app.log.error(`Application insert error: ${appErr.message}`);
          if (insertedApps) {
            insertedApps.forEach((a: any, j: number) => {
              allInsertedApps.push({ ...a, _insertIndex: globalInsertIndex + j });
              if (!appsByCustomer.has(a.customer_id)) appsByCustomer.set(a.customer_id, []);
              appsByCustomer.get(a.customer_id)!.push(a.id);
            });
          }
          globalInsertIndex += chunk.length;
        }

        // ── Deduct Stock: Assign phones and mark them as sold ────────────────
        if (phoneAssignments.size > 0) {
          const phoneUpdates: Promise<any>[] = [];
          for (const insertedApp of allInsertedApps) {
            const phoneId = phoneAssignments.get(insertedApp._insertIndex);
            if (!phoneId) continue;
            phoneUpdates.push(
              (async () => sb.from('phones').update({
                status:         'sold',
                application_id: insertedApp.id,
                customer_id:    insertedApp.customer_id,
                sold_date:      insertedApp.sale_date ?? new Date().toISOString().split('T')[0],
                sold_price:     insertedApp.monthly_amount * insertedApp.term_months,
                updated_at:     new Date().toISOString(),
              }).eq('id', phoneId))());
          }
          // Run in batches to avoid DB overload
          for (let pi = 0; pi < phoneUpdates.length; pi += 200) {
            await Promise.all(phoneUpdates.slice(pi, pi + 200));
          }
          app.log.info(`[LegacyImport] Marked ${phoneUpdates.length} phone(s) as sold from inventory.`);
        }
        
        // Add newly inserted apps to our processing list
        appsToProcessInstallments.push(...allInsertedApps);
      } // end if (applicationsToInsert.length > 0)

      if (appsToProcessInstallments.length > 0) {
        // Pre-fetch all existing installments to avoid duplication
        const existingInstallmentKeys = new Set<string>();
        const appIds = appsToProcessInstallments.map(a => a.id);
        for (let i = 0; i < appIds.length; i += 500) {
            const chunk = appIds.slice(i, i + 500);
            const { data: existInsts } = await sb.from('installments')
              .select('application_id, due_year, due_month')
              .in('application_id', chunk);
            if (existInsts) {
              existInsts.forEach((inst: any) => {
                existingInstallmentKeys.add(`${inst.application_id}_${inst.due_year}_${inst.due_month}`);
              });
            }
          }

          // For each application, generate installment rows
          for (const app_ of appsToProcessInstallments) {
            const srcRow = legacyRowsData.find(r => r.customer_id === app_.customer_id);
            if (!srcRow) continue;
            const origRow = srcRow.service_number ? rowByServiceNo.get(srcRow.service_number) : undefined;
            if (!origRow) continue;

            const itemCount = Number(origRow.item_count ?? 1) || 1;
            const monthlyAmt = Number(app_.monthly_amount ?? 0);
            const histEntries = Object.entries(origRow.deduction_history as Record<string, any>);

            // Sort history chronologically
            histEntries.sort(([a], [b]) => a.localeCompare(b));

            let monthNumber = 0;
            // Historical months from deduction_history
            for (const [monthKey, hist] of histEntries) {
              monthNumber++;
              const [yStr, mStr] = monthKey.split('-');
              const yr = parseInt(yStr);
              const mo = parseInt(mStr);
              if (!yr || !mo) continue;

              const dueDate = new Date(yr, mo - 1, 1);
              const totalDeductedAmt = Number(hist.amount ?? 0);
              const deductedAmt = totalDeductedAmt / itemCount;
              const isDeducted = hist.status === 'deducted' || deductedAmt > 0;

              const key = `${app_.id}_${yr}_${mo}`;
              if (!existingInstallmentKeys.has(key)) {
                installmentsToInsert.push({
                  application_id:  app_.id,
                  customer_id:     app_.customer_id,
                  due_date:        dueDate.toISOString().split('T')[0],
                  due_year:        yr,
                  due_month:       mo,
                  month_number:    monthNumber,
                  expected_amount: monthlyAmt,
                  deducted_amount: isDeducted ? deductedAmt : 0,
                  arrears_amount:  isDeducted ? Math.max(0, monthlyAmt - deductedAmt) : monthlyAmt,
                  status:          isDeducted ? (deductedAmt >= monthlyAmt ? 'deducted' : 'partial') : 'not_deducted',
                });
              }
            }

            // Future/remaining months — status 'pending'
            const termMonths = Number(app_.term_months ?? 24);
            const remainingMonths = Math.max(0, termMonths - histEntries.length);
            const now2 = new Date();
            
            let lastHistDate = app_.sale_date ? new Date(app_.sale_date) : new Date(now2.getFullYear(), now2.getMonth(), 1);
            if (histEntries.length > 0) {
              const [lastHistMonthStr] = histEntries[histEntries.length - 1];
              const [lastY, lastM] = lastHistMonthStr.split('-');
              lastHistDate = new Date(parseInt(lastY), parseInt(lastM) - 1, 1);
            } else {
              // If there's no history, the first installment should start in the sale date's month.
              // Since the loop adds `i` (starting at 1), we offset the base date by -1 month.
              lastHistDate.setMonth(lastHistDate.getMonth() - 1);
            }

            for (let i = 1; i <= remainingMonths; i++) {
              monthNumber++;
              const futureDate = new Date(lastHistDate.getFullYear(), lastHistDate.getMonth() + i, 1);
              const key = `${app_.id}_${futureDate.getFullYear()}_${futureDate.getMonth() + 1}`;
              if (!existingInstallmentKeys.has(key)) {
                installmentsToInsert.push({
                  application_id:  app_.id,
                  customer_id:     app_.customer_id,
                  due_date:        futureDate.toISOString().split('T')[0],
                  due_year:        futureDate.getFullYear(),
                  due_month:       futureDate.getMonth() + 1,
                  month_number:    monthNumber,
                  expected_amount: monthlyAmt,
                  deducted_amount: 0,
                  arrears_amount:  0,
                  status:          'pending',
                });
              }
            }
          }

          // Bulk insert installments in chunks of 500
          for (let ci = 0; ci < installmentsToInsert.length; ci += 500) {
            const chunk = installmentsToInsert.slice(ci, ci + 500);
            const { error: instErr } = await sb.from('installments').insert(chunk);
            if (instErr) app.log.error(`Installment insert error: ${instErr.message}`);
          }

          app.log.info(`Processed ${appsToProcessInstallments.length} applications and created ${installmentsToInsert.length} installments from legacy import`);

      } // end if (appsToProcessInstallments.length > 0)
    } // end if (legacyPhoneModelId)

    // ── Extract and Insert Guarantors (Runs for ALL rows) ─────────────────────
    interface GuarantorToCreate {
      app_ids?: string[];
      service_number?: string;
      full_name: string;
      phone_number?: string;
      nic_number?: string;
      address?: string;
      camp_id?: string | null;
      guarantor_order: 1 | 2;
    }
    const guarantorsToCreate: GuarantorToCreate[] = [];

    for (const srcRow of legacyRowsData) {
      if (!srcRow.customer_id) continue;
      const appIds = appsByCustomer.get(srcRow.customer_id) || [];

      // 1st Guarantor
      if (srcRow.guarantor_name) {
        const guCampId = srcRow.guarantor_unit ? (lookupCamp(srcRow.guarantor_unit.trim()) || null) : null;
        guarantorsToCreate.push({
          app_ids:         appIds,
          service_number:  srcRow.guarantor_service_number || undefined,
          full_name:       srcRow.guarantor_name,
          phone_number:    srcRow.guarantor_mobile         || undefined,
          nic_number:      srcRow.guarantor_nic            || undefined,
          address:         srcRow.guarantor_address        || undefined,
          camp_id:         guCampId,
          guarantor_order: 1,
        });
      }

      // 2nd Guarantor
      if (srcRow.guarantor2_name) {
        const gu2CampId = srcRow.guarantor2_unit ? (lookupCamp(srcRow.guarantor2_unit.trim()) || null) : null;
        guarantorsToCreate.push({
          app_ids:         appIds,
          service_number:  undefined,
          full_name:       srcRow.guarantor2_name,
          phone_number:    srcRow.guarantor2_mobile  || undefined,
          nic_number:      srcRow.guarantor2_nic     || undefined,
          address:         srcRow.guarantor2_address || undefined,
          camp_id:         gu2CampId,
          guarantor_order: 2,
        });
      }
    }

    let addedGuarantorsCount = 0;
    if (guarantorsToCreate.length > 0) {
      // ── IMPORTANT: Guarantors are NOT inserted into the `customers` table.
      // They are inserted directly into `guarantors`. A customer_id is only
      // set if the Guarantor is already an existing customer in the system.

      // 1. Bulk lookup existing guarantors by nic_number or service_number in `guarantors` table
      //    Build dedup keys and fetch existing records to avoid re-inserting.
      const guKeyToId = new Map<string, string>(); // 'svc:XXX' or 'nic:YYY' or 'name:ZZZ' -> guarantor.id
      const guNicKeys = [...new Set(guarantorsToCreate.map(g => g.nic_number).filter(Boolean) as string[])];
      const guSvcKeys = [...new Set(guarantorsToCreate.map(g => g.service_number).filter(Boolean) as string[])];

      for (let i = 0; i < guNicKeys.length; i += 500) {
        const chunk = guNicKeys.slice(i, i + 500);
        const { data: byNic } = await sb.from('guarantors').select('id, nic_number, service_number, full_name').in('nic_number', chunk);
        if (byNic) {
          byNic.forEach(g => {
            if (g.nic_number) guKeyToId.set(`nic:${g.nic_number}`, g.id);
            if (g.service_number) guKeyToId.set(`svc:${g.service_number}`, g.id);
            if (g.full_name) guKeyToId.set(`name:${g.full_name}`, g.id);
          });
        }
      }
      for (let i = 0; i < guSvcKeys.length; i += 500) {
        const chunkSvc = guSvcKeys.slice(i, i + 500).filter(k => !guKeyToId.has(`svc:${k}`));
        if (chunkSvc.length === 0) continue;
        const { data: bySvc } = await sb.from('guarantors').select('id, nic_number, service_number, full_name').in('service_number', chunkSvc);
        if (bySvc) {
          bySvc.forEach(g => {
            if (g.nic_number) guKeyToId.set(`nic:${g.nic_number}`, g.id);
            if (g.service_number) guKeyToId.set(`svc:${g.service_number}`, g.id);
            if (g.full_name) guKeyToId.set(`name:${g.full_name}`, g.id);
          });
        }
      }
      // Fallback: lookup by full_name for guarantors who have no NIC or service number
      const guNameOnlyKeys = [...new Set(
        guarantorsToCreate
          .filter(g => !g.nic_number && !g.service_number && g.full_name)
          .map(g => g.full_name)
      )];
      for (let i = 0; i < guNameOnlyKeys.length; i += 500) {
        const chunk = guNameOnlyKeys.slice(i, i + 500);
        const { data: byName } = await sb.from('guarantors').select('id, full_name, nic_number, service_number').in('full_name', chunk);
        if (byName) {
          byName.forEach(g => {
            if (g.full_name) guKeyToId.set(`name:${g.full_name}`, g.id);
            if (g.nic_number) guKeyToId.set(`nic:${g.nic_number}`, g.id);
            if (g.service_number) guKeyToId.set(`svc:${g.service_number}`, g.id);
          });
        }
      }

      // Helper: resolve existing guarantor id from a GuarantorToCreate
      const resolveGuId = (g: GuarantorToCreate): string | undefined => {
        if (g.nic_number && guKeyToId.has(`nic:${g.nic_number}`)) return guKeyToId.get(`nic:${g.nic_number}`);
        if (g.service_number && guKeyToId.has(`svc:${g.service_number}`)) return guKeyToId.get(`svc:${g.service_number}`);
        if (g.full_name && guKeyToId.has(`name:${g.full_name}`)) return guKeyToId.get(`name:${g.full_name}`);
        return undefined;
      };

      // 2. For each guarantor, determine whether they are also an existing customer
      //    (purely informational – we do NOT create new customer records for them)
      const resolvedGuarantors = guarantorsToCreate.map(g => {
        const existingCust = lookupCustomer(g.service_number, g.nic_number);
        return { ...g, linked_customer_id: existingCust?.id as string | undefined };
      });

      // 3. Build insert / update lists
      const guarantorsToInsert: any[] = [];
      const guarantorsToUpdate: any[] = [];
      const appsToLinkGuarantor = new Map<string, string>(); // app_id -> guarantor_id
      const batchGuKeySet = new Set<string>(); // dedup within this import batch

      // First, create missing customers for guarantors since customer_id is NOT NULL in the guarantors table
      const missingCustForGus = resolvedGuarantors.filter(g => !g.linked_customer_id && !resolveGuId(g));
      const newGuCustomersToInsert: any[] = [];
      const newGuCustIdMap = new Map<string, string>(); // batchKey -> generated id
      
      for (const g of missingCustForGus) {
        const batchKey = g.nic_number ? `nic:${g.nic_number}` : g.service_number ? `svc:${g.service_number}` : `name:${g.full_name}`;
        if (!newGuCustIdMap.has(batchKey)) {
           // We'll generate an ID here to insert later
           const fakeId = crypto.randomUUID();
           newGuCustIdMap.set(batchKey, fakeId);
           newGuCustomersToInsert.push({
             id: fakeId,
             full_name: g.full_name,
             phone_number: g.phone_number ?? null,
             nic_number: g.nic_number ?? null,
             service_number: g.service_number ?? `GU-${crypto.randomUUID().substring(0,8)}`, // fallback if null
             branch: 'army',
             camp_id: g.camp_id ?? null,
             address: g.address ?? null,
             is_active: true,
             risk_score: 50,
             risk_level: 'medium'
           });
        }
        g.linked_customer_id = newGuCustIdMap.get(batchKey);
      }

      if (newGuCustomersToInsert.length > 0) {
         for (let i = 0; i < newGuCustomersToInsert.length; i += 500) {
            const chunk = newGuCustomersToInsert.slice(i, i + 500);
            await sb.from('customers').insert(chunk);
         }
      }

      for (const g of resolvedGuarantors) {
        const existingGuId = resolveGuId(g);

        if (existingGuId) {
          // Guarantor already exists – update supplementary info
          guarantorsToUpdate.push({
            id: existingGuId,
            full_name:    g.full_name,
            phone_number: g.phone_number || undefined,
            nic_number:   g.nic_number   || undefined,
            camp_id:      g.camp_id      || undefined,
          });
          if (g.guarantor_order === 1 && g.app_ids) {
            for (const appId of g.app_ids) {
              appsToLinkGuarantor.set(appId, existingGuId);
            }
          }
        } else {
          // New guarantor – insert directly into `guarantors` table
          const batchKey = g.nic_number ? `nic:${g.nic_number}` : g.service_number ? `svc:${g.service_number}` : `name:${g.full_name}`;
          if (!batchGuKeySet.has(batchKey)) {
            batchGuKeySet.add(batchKey);
            guarantorsToInsert.push({
              customer_id:    g.linked_customer_id, // now guaranteed to not be null
              full_name:      g.full_name,
              phone_number:   g.phone_number   ?? null,
              nic_number:     g.nic_number     ?? null,
              service_number: g.service_number ?? null,
              branch:         'army',
              camp_id:        g.camp_id        ?? null,
              monthly_salary:        0,
              total_liability:       0,
              affordability_checked: true,
              affordability_ok:      true,
              is_active:             true,
            });
          }
        }
      }

      // 4. Bulk insert new guarantors
      if (guarantorsToInsert.length > 0) {
        for (let i = 0; i < guarantorsToInsert.length; i += 1000) {
          const chunk = guarantorsToInsert.slice(i, i + 1000);
          const { data: insertedGus } = await sb.from('guarantors').insert(chunk).select('id, nic_number, service_number, full_name');
          if (insertedGus) {
            addedGuarantorsCount += insertedGus.length;
            insertedGus.forEach(ig => {
              if (ig.nic_number) guKeyToId.set(`nic:${ig.nic_number}`, ig.id);
              if (ig.service_number) guKeyToId.set(`svc:${ig.service_number}`, ig.id);
              if (ig.full_name) guKeyToId.set(`name:${ig.full_name}`, ig.id);
            });
          }
        }
      }

      // 5. Link newly inserted/existing guarantors to applications
      for (const g of resolvedGuarantors) {
        if (g.guarantor_order === 1 && g.app_ids && g.app_ids.length > 0) {
          const guId = resolveGuId(g);
          if (guId) {
            for (const appId of g.app_ids) {
              appsToLinkGuarantor.set(appId, guId);
            }
          }
        }
      }

      // 6. Bulk update applications with guarantor_id
      if (appsToLinkGuarantor.size > 0) {
        const linkPromises = Array.from(appsToLinkGuarantor.entries()).map(([appId, guId]) =>
          sb.from('applications').update({ guarantor_id: guId } as any).eq('id', appId)
        );
        for (let i = 0; i < linkPromises.length; i += 200) {
          await Promise.all(linkPromises.slice(i, i + 200));
        }
      }

      // 7. Bulk update existing guarantors with fresher data
      if (guarantorsToUpdate.length > 0) {
        const updatePromises = guarantorsToUpdate.map(gu => {
          const updates: any = {};
          if (gu.full_name)    updates.full_name    = gu.full_name;
          if (gu.phone_number) updates.phone_number = gu.phone_number;
          if (gu.nic_number)   updates.nic_number   = gu.nic_number;
          if (gu.camp_id)      updates.camp_id      = gu.camp_id;
          if (Object.keys(updates).length > 0) {
            return sb.from('guarantors').update(updates).eq('id', gu.id);
          }
          return null;
        }).filter(Boolean);
        for (let i = 0; i < updatePromises.length; i += 200) {
          await Promise.all(updatePromises.slice(i, i + 200));
        }
      }

      app.log.info(`Added/linked ${guarantorsToCreate.length} guarantors (${addedGuarantorsCount} new, 1st+2nd GU) — Guarantors are NOT added to customers table`);
    } // end if (guarantorsToCreate.length > 0)

    // ── Track what was newly added ─────────────────────────────

    const newCustomerCount = customerInsertMap.size;
    const newCampCount     = missingUnits.length;

    await sb.from('legacy_import_batches').update({
      status:            'completed',
      total_rows:        rows.length,
      imported_rows:     imported,
      duplicate_rows:    duplicates,
      invalid_rows:      invalid,
    } as any).eq('id', id);

    writeAuditLog({
      user_id: req.user!.id,
      action:  AuditActions.LEGACY_IMPORT_COMPLETED,
      entity_type: 'legacy_import_batches',
      entity_id: id,
      new_values: { imported, duplicates, invalid, newCustomerCount, newCampCount } 
    });

  } catch (e) {
    getSupabase().from('legacy_import_batches').update({ status: 'failed' } as any).eq('id', id);
    app.log.error(`[LegacyImport] Background job failed: ${e instanceof Error ? e.stack : String(e)}`);
  }
}); // end setImmediate
  });

  // ── POST /rows/:rowId/link-customer ───────────────────────
  app.post('/rows/:rowId/link-customer', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { rowId } = req.params as { rowId: string };
    const body = z.object({ customer_id: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();
    await sb.from('legacy_import_rows').update({
      customer_id: body.data.customer_id,
      status: 'merged',
    } as any).eq('id', rowId);

    await sb.from('legacy_customer_links').upsert({
      customer_id:   body.data.customer_id,
      legacy_row_id: rowId,
      linked_by:     'manual_admin',
      confidence:    100,
    } as any, { onConflict: 'legacy_row_id' });

    writeAuditLog({
      user_id: req.user!.id,
      action:  AuditActions.LEGACY_CUSTOMER_LINKED,
      entity_type: 'legacy_import_rows',
      entity_id: rowId,
      new_values: { customer_id: body.data.customer_id, method: 'manual' },
    });

    return reply.send({ success: true });
  });

  // ── POST /:id/attach-pdf ──────────────────────────────────
  // PDF uploads are stored as REFERENCE ONLY.
  // They are never parsed for structured data — only Excel/CSV
  // files produce importable rows. This endpoint stores the PDF
  // in Firebase Storage and records the path on the batch for
  // human review purposes.
  app.post('/:id/attach-pdf', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    const { data: batch } = await sb.from('legacy_import_batches').select('id').eq('id', id).single();
    if (!batch) return reply.status(404).send({ error: 'Batch not found' });

    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const filename = data.filename;
    if (!filename.toLowerCase().endsWith('.pdf')) {
      return reply.status(400).send({
        error: 'PDF only',
        message: 'This endpoint accepts PDF files for reference storage only. For structured import, upload an Excel or CSV file instead.',
      });
    }

    const buffer = await data.toBuffer();
    if (buffer.length === 0) return reply.status(400).send({ error: 'Empty file' });
    if (buffer.length > 50 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large', message: 'PDF reference files must be under 50 MB' });
    }

    const fbPath = `legacy-imports/pdf-refs/${id}-${Date.now()}-${filename}`;
    await uploadToStorage(buffer, fbPath, 'application/pdf');

    await sb.from('legacy_import_batches').update({
      pdf_reference_path: fbPath,
    } as any).eq('id', id);

    writeAuditLog({
      user_id:     req.user!.id,
      action:      AuditActions.LEGACY_IMPORT_UPLOADED,
      entity_type: 'legacy_import_batches',
      entity_id:   id,
      new_values:  { pdf_reference_path: fbPath, filename, is_reference_only: true },
    });

    return reply.status(201).send({
      success: true,
      pdf_reference_path: fbPath,
      note: 'PDF stored for reference only. It will NOT be parsed for structured import data. Upload an Excel or CSV file to import records.',
    });
  });

  // ── POST /merge-camps — merge duplicate camps (super_admin) ──
  // Moves all customers, regiments, and officer assignments from
  // source_camp_id → target_camp_id, then deactivates the source.
  app.post('/merge-camps', { preHandler: [authenticate, requireAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      source_camp_id: z.string().uuid(),
      target_camp_id: z.string().uuid(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    const { source_camp_id, target_camp_id } = body.data;

    if (source_camp_id === target_camp_id) {
      return reply.status(400).send({ error: 'Source and target camps must be different.' });
    }

    const sb = getSupabase();

    // Verify both camps exist and are active
    const { data: camps, error: campsErr } = await sb
      .from('camps')
      .select('id, name, is_active')
      .in('id', [source_camp_id, target_camp_id]);

    if (campsErr || !camps || camps.length < 2) {
      return reply.status(404).send({ error: 'One or both camps not found.' });
    }

    const sourcecamp = camps.find((c: any) => c.id === source_camp_id);
    const targetCamp = camps.find((c: any) => c.id === target_camp_id);

    if (!sourcecamp || !targetCamp) {
      return reply.status(404).send({ error: 'One or both camps not found.' });
    }

    const results: Record<string, number> = {
      customers_moved: 0,
      regiments_moved: 0,
      officers_moved: 0,
    };

    // 1. Move customers
    const { data: movedCustomers, error: custErr } = await sb
      .from('customers')
      .update({ camp_id: target_camp_id })
      .eq('camp_id', source_camp_id)
      .is('deleted_at', null)
      .select('id');

    if (custErr) {
      return reply.status(500).send({ error: `Failed to move customers: ${custErr.message}` });
    }
    results.customers_moved = movedCustomers?.length ?? 0;

    // 2. Move regiments
    const { data: movedRegiments, error: regErr } = await sb
      .from('regiments')
      .update({ camp_id: target_camp_id })
      .eq('camp_id', source_camp_id)
      .select('id');

    if (regErr) {
      return reply.status(500).send({ error: `Failed to move regiments: ${regErr.message}` });
    }
    results.regiments_moved = movedRegiments?.length ?? 0;

    // 3. Move officer assignments (skip if user_id already assigned to target)
    const { data: sourceOfficers } = await sb
      .from('camp_officer_assignments')
      .select('user_id')
      .eq('camp_id', source_camp_id)
      .eq('is_active', true);

    const { data: targetOfficers } = await sb
      .from('camp_officer_assignments')
      .select('user_id')
      .eq('camp_id', target_camp_id)
      .eq('is_active', true);

    const targetUserIds = new Set((targetOfficers ?? []).map((o: any) => o.user_id));

    for (const officer of (sourceOfficers ?? [])) {
      if (!targetUserIds.has(officer.user_id)) {
        await sb.from('camp_officer_assignments').upsert(
          {
            camp_id: target_camp_id,
            user_id: officer.user_id,
            assigned_by: req.user!.id,
            is_active: true,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,camp_id' }
        );
        results.officers_moved++;
      }
    }

    // Deactivate source officers
    await sb
      .from('camp_officer_assignments')
      .update({ is_active: false })
      .eq('camp_id', source_camp_id);

    // 4. Deactivate source camp
    const { error: deactivateErr } = await sb
      .from('camps')
      .update({ is_active: false })
      .eq('id', source_camp_id);

    if (deactivateErr) {
      return reply.status(500).send({ error: `Failed to deactivate source camp: ${deactivateErr.message}` });
    }

    writeAuditLog({
      user_id:     req.user!.id,
      action:      AuditActions.CAMP_UPDATED,
      entity_type: 'camps',
      entity_id:   source_camp_id,
      old_values:  { name: sourcecamp.name, is_active: true },
      new_values:  {
        action: 'merged_into',
        target_camp_id,
        target_camp_name: targetCamp.name,
        ...results,
      },
    });

    return reply.send({
      success: true,
      source_camp:  { id: source_camp_id, name: sourcecamp.name },
      target_camp:  { id: target_camp_id, name: targetCamp.name },
      ...results,
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // POST /upload-unit  — Unit Wise Summary direct import
  // ══════════════════════════════════════════════════════════════════
  // Parses the "10 ESR - HAMBANTHOTA" style Excel where every row is
  // a complete customer sale (no deduction history — just term/amount).
  // Creates: Camp → Customer → Application → Installments → Guarantor
  // in a single shot. No mapping/preview step needed.
  // ─────────────────────────────────────────────────────────────────
  app.post('/upload-unit', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const fileData = await req.file();
    if (!fileData) return reply.status(400).send({ error: 'No file uploaded' });

    const filename  = fileData.filename;
    const fileType  = filename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const buffer    = await fileData.toBuffer();
    if (buffer.length === 0) return reply.status(400).send({ error: 'Uploaded file is empty' });

    const sb = getSupabase();

    // ── Parse the Excel ──────────────────────────────────────────────
    let rows2d: unknown[][];
    try {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      rows2d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][];
    } catch (e) {
      return reply.status(422).send({ error: `Cannot parse file: ${e instanceof Error ? e.message : String(e)}` });
    }

    // Find header row (first row with SERVICE NO / NAME / TERM etc.)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows2d.length); i++) {
      const row = rows2d[i] as string[];
      const joined = row.map(c => String(c ?? '').toUpperCase()).join(' ');
      if (joined.includes('SERVICE') || joined.includes('NAME')) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return reply.status(422).send({ error: 'Could not find header row. Expected a header with SERVICE NO and NAME.' });

    const headers = (rows2d[headerIdx] as unknown[]).map(h => String(h ?? '').trim().toUpperCase());

    const col = (name: string | string[]): number => {
      const names = Array.isArray(name) ? name : [name];
      for (const n of names) {
        const idx = headers.findIndex(h => h.includes(n));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const colNo          = col('SERVICE NO');
    const colName        = col('NAME');
    const colMobile      = col(['MOBILE', 'PHONE']);
    const colNic         = col('NIC');
    const colAddress     = col('ADDRESS');
    const colUnit        = col('UNIT');
    const colItemCount   = col(['VIVO', 'SAMSUNG', 'APPLE', 'QTY', 'ITEM']);
    const colMonthly     = col('INT');
    const colTerm        = col('TERM');
    const colTotalAmount = col('AMOUNT');
    const colSaleDate    = col(['SALE DATE', 'DATE']);
    const colSalesMember = col(['SALES MEMBER', 'SALES']);
    // Guarantor columns
    const colGu1No   = col(['1 ST GU/ SERVICE NO', 'GU/ SERVICE', '1ST GU']);
    const colGu1Name = col(['1 ST GU/ NAME', 'GU/ NAME']);
    const colGu1Mob  = col(['1 ST GU/MOBILE', 'GU/MOBILE']);
    const colGu1Nic  = col(['1 ST GU/NIC']);
    const colGu1Addr = col(['1 ST GU/ ADDRESS', 'GU/ ADDRESS']);
    const colGu1Unit = col(['1 ST GU/ UNIT', 'GU/ UNIT']);

    interface UnitWiseRow {
      rowNum: number;
      serviceNo: string;
      name: string;
      mobile: string;
      nic: string;
      address: string;
      unit: string;
      itemCount: number;
      monthly: number;
      term: number;
      totalAmount: number;
      saleDate: string | null;
      salesMember: string;
      gu1ServiceNo: string;
      gu1Name: string;
      gu1Mobile: string;
      gu1Nic: string;
      gu1Address: string;
      gu1Unit: string;
    }

    const g = (row: unknown[], idx: number) => idx >= 0 ? String(row[idx] ?? '').trim() : '';
    const gn = (row: unknown[], idx: number) => {
      const v = parseFloat(g(row, idx).replace(/,/g, ''));
      return isNaN(v) ? 0 : v;
    };

    const dataRows: UnitWiseRow[] = [];
    for (let ri = headerIdx + 1; ri < rows2d.length; ri++) {
      const row = rows2d[ri] as unknown[];
      const svcNo = g(row, colNo);
      const name  = g(row, colName);
      if (!svcNo && !name) continue; // skip empty rows
      if (!svcNo || !name) continue; // skip incomplete rows

      let saleDate: string | null = null;
      const sdRaw = g(row, colSaleDate);
      if (sdRaw) {
        // XLSX may return a JS Date or an Excel serial number
        const rawVal = colSaleDate >= 0 ? row[colSaleDate] : null;
        if (rawVal instanceof Date) {
          saleDate = rawVal.toISOString().split('T')[0];
        } else {
          const d = new Date(sdRaw);
          saleDate = isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
        }
      }

      dataRows.push({
        rowNum:       ri + 1,
        serviceNo:    svcNo,
        name:         name,
        mobile:       g(row, colMobile),
        nic:          String(row[colNic] ?? '').trim(),
        address:      g(row, colAddress),
        unit:         g(row, colUnit),
        itemCount:    Math.max(1, gn(row, colItemCount)) || 1,
        monthly:      gn(row, colMonthly),
        term:         gn(row, colTerm) || 24,
        totalAmount:  gn(row, colTotalAmount),
        saleDate,
        salesMember:  g(row, colSalesMember),
        gu1ServiceNo: g(row, colGu1No),
        gu1Name:      g(row, colGu1Name),
        gu1Mobile:    g(row, colGu1Mob),
        gu1Nic:       g(row, colGu1Nic),
        gu1Address:   g(row, colGu1Addr),
        gu1Unit:      g(row, colGu1Unit),
      });
    }

    if (dataRows.length === 0) {
      return reply.status(422).send({ error: 'No valid data rows found in the file.' });
    }

    // ── Create a batch record ────────────────────────────────────────
    const storedPath = `/tmp/av_unit_${Date.now()}_${filename}`;
    try { require('fs').writeFileSync(storedPath, buffer); } catch { /* ignore */ }

    const { data: batch, error: batchErr } = await sb
      .from('legacy_import_batches')
      .insert({
        file_name:       filename,
        file_path:       storedPath,
        file_type:       fileType,
        file_size_bytes: buffer.length,
        uploaded_by:     req.user!.id,
        status:          'importing',
        sheet_regiment:  filename.replace(/\.xlsx?$/i, '').replace(/\.csv$/i, ''),
      } as any)
      .select().single();
    if (batchErr) return reply.status(500).send({ error: batchErr.message });

    // ── Respond immediately, run background job ──────────────────────
    reply.status(202).send({ success: true, batch_id: batch.id, total_rows: dataRows.length, message: 'Unit Wise import started in background.' });

    setImmediate(async () => {
      try {
        // 1. Resolve / create Camps
        const unitNames = [...new Set([
          ...dataRows.map(r => r.unit),
          ...dataRows.map(r => r.gu1Unit),
        ].filter(Boolean))];

        const { data: existingCamps } = await sb.from('camps').select('id, name');
        const normName = (n: string) => n.toLowerCase().trim();
        const campMap = new Map<string, string>();
        for (const c of (existingCamps || [])) {
          campMap.set(normName(c.name), c.id);
        }

        for (const u of unitNames) {
          if (!campMap.has(normName(u))) {
            const { data: newCamp } = await sb.from('camps')
              .insert({ name: u, branch: 'army', is_active: true } as any)
              .select('id, name').single();
            if (newCamp) campMap.set(normName(newCamp.name), newCamp.id);
          }
        }
        const getCampId = (unit: string) => unit ? (campMap.get(normName(unit)) ?? null) : null;

        // 2. Bulk lookup existing customers
        const allSvcNos = [...new Set(dataRows.flatMap(r => [r.serviceNo, r.gu1ServiceNo]).filter(Boolean))];
        const allNics   = [...new Set(dataRows.flatMap(r => [r.nic, r.gu1Nic]).filter(Boolean))];

        const custBySvc = new Map<string, { id: string; camp_id: string | null }>();
        const custByNic = new Map<string, { id: string; camp_id: string | null }>();

        if (allSvcNos.length > 0) {
          for (let i = 0; i < allSvcNos.length; i += 500) {
            const { data } = await sb.from('customers').select('id, service_number, nic_number, camp_id')
              .in('service_number', allSvcNos.slice(i, i + 500)).is('deleted_at', null);
            if (data) data.forEach((c: any) => {
              if (c.service_number) custBySvc.set(c.service_number, { id: c.id, camp_id: c.camp_id });
              if (c.nic_number)     custByNic.set(c.nic_number, { id: c.id, camp_id: c.camp_id });
            });
          }
        }
        if (allNics.length > 0) {
          for (let i = 0; i < allNics.length; i += 500) {
            const { data } = await sb.from('customers').select('id, service_number, nic_number, camp_id')
              .in('nic_number', allNics.slice(i, i + 500)).is('deleted_at', null);
            if (data) data.forEach((c: any) => {
              if (c.service_number) custBySvc.set(c.service_number, { id: c.id, camp_id: c.camp_id });
              if (c.nic_number)     custByNic.set(c.nic_number, { id: c.id, camp_id: c.camp_id });
            });
          }
        }

        const lookupCust = (svc: string, nic: string) =>
          (svc && custBySvc.get(svc)) || (nic && custByNic.get(nic)) || null;

        // 3. Ensure legacy phone model exists
        let legacyModelId: string | null = null;
        const { data: lm } = await sb.from('phone_models').select('id').eq('brand', 'LEGACY').eq('model', 'Legacy Plan').limit(1).single();
        if (lm) {
          legacyModelId = lm.id;
        } else {
          const { data: nm } = await sb.from('phone_models').insert({ brand: 'LEGACY', model: 'Legacy Plan', purchase_cost: 0, sale_price: 0, is_active: false } as any).select('id').single();
          legacyModelId = nm?.id ?? null;
        }

        // 4. Process each row: Create customer + application + installments
        const nicInsertSet   = new Set<string>();
        const custInsertMap  = new Map<string, any>();
        const newRowsForDB: any[] = [];
        let imported = 0, skipped = 0;

        for (const row of dataRows) {
          let existing = lookupCust(row.serviceNo, row.nic);
          let campId = getCampId(row.unit);

          if (!existing && row.serviceNo && row.name) {
            const nicToInsert = (row.nic && !nicInsertSet.has(row.nic)) ? row.nic : null;
            if (nicToInsert) nicInsertSet.add(nicToInsert);
            if (!custInsertMap.has(row.serviceNo)) {
              custInsertMap.set(row.serviceNo, {
                full_name:      row.name,
                service_number: row.serviceNo,
                nic_number:     nicToInsert,
                phone_number:   row.mobile || null,
                address:        row.address || null,
                camp_id:        campId,
                branch:         'army',
                rank:           'Unknown',
                is_active:      true,
              });
            }
          }
          newRowsForDB.push({ row, existing });
        }

        // Bulk insert new customers
        if (custInsertMap.size > 0) {
          const custsArr = Array.from(custInsertMap.values());
          for (let i = 0; i < custsArr.length; i += 500) {
            const { data: inserted } = await sb.from('customers').insert(custsArr.slice(i, i + 500)).select('id, service_number, nic_number');
            if (inserted) inserted.forEach((c: any) => {
              if (c.service_number) custBySvc.set(c.service_number, { id: c.id, camp_id: null });
              if (c.nic_number)     custByNic.set(c.nic_number, { id: c.id, camp_id: null });
            });
          }
        }

        // 5. Create applications + installments
        const applicationsToInsert: any[] = [];
        const appRowMap: { row: UnitWiseRow; appIdx: number }[] = [];

        for (const { row, existing } of newRowsForDB) {
          const custData = existing || lookupCust(row.serviceNo, row.nic);
          if (!custData) { skipped++; continue; }

          const campId = getCampId(row.unit);
          const perItemMonthly = row.monthly / row.itemCount;
          const termMonths = row.term;

          for (let i = 0; i < row.itemCount; i++) {
            const appIdx = applicationsToInsert.length;
            appRowMap.push({ row, appIdx });
            applicationsToInsert.push({
              customer_id:     custData.id,
              phone_model_id:  legacyModelId,
              sales_officer_id: req.user!.id,
              sale_price:      row.totalAmount || (row.monthly * termMonths),
              down_payment:    0,
              financed_amount: row.totalAmount || (row.monthly * termMonths),
              monthly_amount:  perItemMonthly,
              term_months:     termMonths,
              status:          'active',
              sale_date:       row.saleDate,
              plan_end_date:   row.saleDate
                ? new Date(new Date(row.saleDate).setMonth(new Date(row.saleDate).getMonth() + termMonths)).toISOString().split('T')[0]
                : null,
              ref_number:      `UWS-${row.serviceNo}${row.itemCount > 1 ? `-${i + 1}` : ''}`,
              notes:           `Unit Wise Summary import${row.salesMember ? `. Sales: ${row.salesMember}` : ''}`,
            });
          }
          imported++;
        }

        const insertedApps: any[] = [];
        for (let i = 0; i < applicationsToInsert.length; i += 500) {
          const { data: apps } = await sb.from('applications').insert(applicationsToInsert.slice(i, i + 500)).select('id, customer_id, monthly_amount, term_months, sale_date');
          if (apps) insertedApps.push(...apps);
        }

        // 6. Generate installments for each application
        const installmentsToInsert: any[] = [];
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        for (const insertedApp of insertedApps) {
          const termMonths = insertedApp.term_months ?? 24;
          const startDate = insertedApp.sale_date ? new Date(insertedApp.sale_date) : new Date();
          for (let m = 1; m <= termMonths; m++) {
            const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
            const dueYear = dueDate.getFullYear();
            const dueMonth = dueDate.getMonth() + 1;
            
            // If the due date is strictly in the past (before current month/year), it's in arrears
            const isPastDue = (dueYear < currentYear) || (dueYear === currentYear && dueMonth < currentMonth);

            installmentsToInsert.push({
              application_id:  insertedApp.id,
              customer_id:     insertedApp.customer_id,
              due_date:        dueDate.toISOString().split('T')[0],
              due_year:        dueYear,
              due_month:       dueMonth,
              month_number:    m,
              expected_amount: insertedApp.monthly_amount,
              deducted_amount: 0,
              arrears_amount:  isPastDue ? insertedApp.monthly_amount : 0,
              status:          isPastDue ? 'not_deducted' : 'pending',
            });
          }
        }

        for (let i = 0; i < installmentsToInsert.length; i += 500) {
          await sb.from('installments').insert(installmentsToInsert.slice(i, i + 500));
        }

        // 7. Create Guarantors
        const guarantorsToProcess: { row: UnitWiseRow; custId: string }[] = [];
        for (const insertedApp of insertedApps) {
          const rowData = newRowsForDB.find((x: any) => {
            const c = x.existing || lookupCust(x.row.serviceNo, x.row.nic);
            return c?.id === insertedApp.customer_id;
          });
          if (rowData?.row.gu1Name) {
            guarantorsToProcess.push({ row: rowData.row, custId: insertedApp.customer_id });
          }
        }

        for (const { row } of guarantorsToProcess) {
          const gu1CustExisting = lookupCust(row.gu1ServiceNo, row.gu1Nic);
          let gu1CustId: string | null = gu1CustExisting?.id ?? null;

          if (!gu1CustId && row.gu1Name) {
            // Create a customer record for the guarantor if they don't exist
            const gu1Svc = row.gu1ServiceNo || `GU-${crypto.randomUUID().substring(0, 8)}`;
            const gu1Nic = row.gu1Nic && !nicInsertSet.has(row.gu1Nic) ? row.gu1Nic : null;
            if (gu1Nic) nicInsertSet.add(gu1Nic);
            const { data: newGu1Cust } = await sb.from('customers').insert({
              full_name:      row.gu1Name,
              service_number: gu1Svc,
              nic_number:     gu1Nic,
              phone_number:   row.gu1Mobile || null,
              address:        row.gu1Address || null,
              camp_id:        getCampId(row.gu1Unit),
              branch:         'army',
              rank:           'Unknown',
              is_active:      true,
            } as any).select('id').single();
            gu1CustId = newGu1Cust?.id ?? null;
            if (gu1CustId) {
              if (row.gu1ServiceNo) custBySvc.set(row.gu1ServiceNo, { id: gu1CustId, camp_id: null });
              if (gu1Nic)          custByNic.set(gu1Nic, { id: gu1CustId, camp_id: null });
            }
          }

          if (gu1CustId && row.gu1Name) {
            // Check if guarantor already exists
            let guId: string | null = null;
            const { data: existGu } = await sb.from('guarantors').select('id')
              .or(`service_number.eq.${row.gu1ServiceNo || '__none__'},nic_number.eq.${row.gu1Nic || '__none__'}`)
              .limit(1).single();
            if (existGu) {
              guId = existGu.id;
            } else {
              const { data: newGu } = await sb.from('guarantors').insert({
                customer_id:           gu1CustId,
                full_name:             row.gu1Name,
                service_number:        row.gu1ServiceNo || null,
                nic_number:            row.gu1Nic || null,
                phone_number:          row.gu1Mobile || null,
                address:               row.gu1Address || null,
                camp_id:               getCampId(row.gu1Unit),
                branch:                'army',
                monthly_salary:        0,
                total_liability:       0,
                affordability_checked: true,
                affordability_ok:      true,
                is_active:             true,
              } as any).select('id').single();
              guId = newGu?.id ?? null;
            }

            // Link guarantor to all apps for this customer
            if (guId) {
              const appsForCust = insertedApps.filter(a => a.customer_id === (lookupCust(row.serviceNo, row.nic)?.id ?? ''));
              for (const appForCust of appsForCust) {
                await sb.from('applications').update({ guarantor_id: guId } as any).eq('id', appForCust.id);
              }
            }
          }
        }

        // 8. Mark batch complete
        await sb.from('legacy_import_batches').update({
          status:        'completed',
          total_rows:    dataRows.length,
          imported_rows: imported,
          invalid_rows:  skipped,
        } as any).eq('id', batch.id);

        app.log.info(`[UnitWiseImport] Done: ${imported} imported, ${skipped} skipped. Apps: ${insertedApps.length}, Installments: ${installmentsToInsert.length}`);

      } catch (e) {
        await sb.from('legacy_import_batches').update({ status: 'failed' } as any).eq('id', batch.id);
        app.log.error(`[UnitWiseImport] Background job failed: ${e instanceof Error ? e.stack : String(e)}`);
      }
    }); // end setImmediate
  }); // end upload-unit
}
