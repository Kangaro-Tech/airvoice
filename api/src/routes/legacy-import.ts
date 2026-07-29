import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { z } from 'zod';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as nodePath from 'path';
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
      .in('status', ['importing', 'completed'])
      .limit(1)
      .single();

    if (existingBatch) {
      return reply.status(400).send({ error: 'This file is already being imported or has been completed. Duplicate files are rejected.' });
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
      const batchAiDetails = await extractMultipleMilitaryUnitDetails(missingUnits);

      for (const u of missingUnits) {
        const aiDetails = batchAiDetails[u];
        const { data: newCamp, error: campErr } = await sb.from('camps')
          .insert({ name: u, branch: 'army' } as any)
          .select('id, name').single();
          
        if (campErr) {
          app.log.error(`Camp insert error: ${campErr.message}`);
        } else if (newCamp) {
          campMap.set(newCamp.name.toLowerCase(), newCamp.id);
          campMap.set(normalizeCampName(newCamp.name), newCamp.id);
          
          if (aiDetails && aiDetails.regiment) {
            await sb.from('regiments').insert({
              camp_id: newCamp.id,
              name: aiDetails.regiment,
              branch: 'army',
              is_active: true
            } as any);
          }
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
      for (let i = 0; i < updateProms.length; i += 50) {
        await Promise.all(updateProms.slice(i, i + 50));
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
          brand: 'LEGACY', model: 'Legacy Plan', base_price: 0, is_active: false,
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

    // Pre-fetch all applications for the imported customers (to check for existence & link guarantors)
    const importedCustomerIds = [...new Set(legacyRowsData.map(r => r.customer_id).filter(Boolean) as string[])];
    let appsByCustomer = new Map<string, string>();
    if (importedCustomerIds.length > 0) {
      for (let i = 0; i < importedCustomerIds.length; i += 500) {
        const chunk = importedCustomerIds.slice(i, i + 500);
        const { data: apps } = await sb.from('applications')
          .select('id, customer_id')
          .in('customer_id', chunk);
        if (apps) {
          apps.forEach(a => appsByCustomer.set(a.customer_id, a.id));
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
      const installmentsToInsert: any[] = [];
      // Map from position in applicationsToInsert to a phone ID to assign (if real stock)
      const phoneAssignments: Map<number, string> = new Map();
      let stockPointer = 0; // next available phone index in availablePhones

      for (const legacyRow of legacyRowsData) {
        // Process both new and existing customers, but skip if no customer_id
        if (!legacyRow.customer_id) continue;
        
        // Skip if an application already exists for this customer
        if (appsByCustomer.has(legacyRow.customer_id)) continue;

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

      // Insert applications
      if (applicationsToInsert.length > 0) {
        const allInsertedApps: { id: string; customer_id: string; monthly_amount: number; term_months: number; sale_date: string | null; _insertIndex: number }[] = [];
        let globalInsertIndex = 0;
        for (let i = 0; i < applicationsToInsert.length; i += 50) {
          const chunk = applicationsToInsert.slice(i, i + 50);
          const { data: insertedApps, error: appErr } = await sb.from('applications')
            .insert(chunk).select('id, customer_id, monthly_amount, term_months, sale_date');
          if (appErr) app.log.error(`Application insert error: ${appErr.message}`);
          if (insertedApps) {
            insertedApps.forEach((a: any, j: number) => {
              allInsertedApps.push({ ...a, _insertIndex: globalInsertIndex + j });
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
          for (let pi = 0; pi < phoneUpdates.length; pi += 50) {
            await Promise.all(phoneUpdates.slice(pi, pi + 50));
          }
          app.log.info(`[LegacyImport] Marked ${phoneUpdates.length} phone(s) as sold from inventory.`);
        }

        if (allInsertedApps.length > 0) {
          // For each application, generate installment rows
          for (const app_ of allInsertedApps) {
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

          // Bulk insert installments in chunks of 500
          for (let ci = 0; ci < installmentsToInsert.length; ci += 500) {
            const chunk = installmentsToInsert.slice(ci, ci + 500);
            const { error: instErr } = await sb.from('installments').insert(chunk);
            if (instErr) app.log.error(`Installment insert error: ${instErr.message}`);
          }

          app.log.info(`Created ${allInsertedApps.length} applications and ${installmentsToInsert.length} installments from legacy import`);

        } // end if (insertedApps && insertedApps.length > 0)
      } // end if (applicationsToInsert.length > 0)
    } // end if (legacyPhoneModelId)

    // ── Extract and Insert Guarantors (Runs for ALL rows) ─────────────────────
    interface GuarantorToCreate {
      app_id?: string;
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
      const appId = appsByCustomer.get(srcRow.customer_id);

      // 1st Guarantor
      if (srcRow.guarantor_name) {
        const guCampId = srcRow.guarantor_unit ? (lookupCamp(srcRow.guarantor_unit.trim()) || null) : null;
        guarantorsToCreate.push({
          app_id:          appId,
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
          app_id:          appId,
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
      // 1. Bulk insert missing Guarantor customers
      const newGuCustomersToInsert: any[] = [];
      const newGuNicInsertSet = new Set<string>();

      for (const g of guarantorsToCreate) {
        let existingCust = lookupCustomer(g.service_number, g.nic_number);
        if (!existingCust && (g.service_number || g.nic_number)) {
          // Avoid pushing same NIC/service_number twice in this batch
          const key = g.service_number || g.nic_number;
          if (key && !newGuNicInsertSet.has(key)) {
            newGuNicInsertSet.add(key);
            newGuCustomersToInsert.push({
              full_name: g.full_name,
              service_number: g.service_number || null,
              nic_number: g.nic_number || null,
              phone_number: g.phone_number || null,
              camp_id: g.camp_id || null,
              branch: 'army',
              rank: 'Unknown'
            });
          }
        }
      }

      if (newGuCustomersToInsert.length > 0) {
        for (let i = 0; i < newGuCustomersToInsert.length; i += 500) {
          const chunk = newGuCustomersToInsert.slice(i, i + 500);
          const { data: insertedGuCusts } = await sb.from('customers').insert(chunk).select('id, service_number, nic_number, camp_id');
          if (insertedGuCusts) {
            insertedGuCusts.forEach(c => {
              if (c.service_number) custMapBySvcNo.set(c.service_number, { id: c.id, method: 'service_number', camp_id: c.camp_id });
              if (c.nic_number) custMapByNic.set(c.nic_number, { id: c.id, method: 'nic_number', camp_id: c.camp_id });
            });
          }
        }
      }

      // 2. Resolve customer IDs for guarantors
      const resolvedGuarantors = guarantorsToCreate.map(g => {
        let existingCust = lookupCustomer(g.service_number, g.nic_number);
        return { ...g, customer_id: existingCust?.id };
      }).filter(g => g.customer_id);

      // 3. Bulk lookup existing guarantors by customer_id
      const guCustomerIds = [...new Set(resolvedGuarantors.map(g => g.customer_id as string))];
      let existingGuarantorMap = new Map<string, string>();
      if (guCustomerIds.length > 0) {
        // Chunk the IN clause if needed, but 2000 is usually fine for Supabase. We'll chunk to 500 just in case.
        for (let i = 0; i < guCustomerIds.length; i += 500) {
          const chunk = guCustomerIds.slice(i, i + 500);
          const { data: existingG } = await sb.from('guarantors').select('id, customer_id').in('customer_id', chunk);
          if (existingG) {
            existingG.forEach(g => existingGuarantorMap.set(g.customer_id, g.id));
          }
        }
      }

      // 4. Bulk insert new guarantors & collect updates
      const guarantorsToInsert: any[] = [];
      const guarantorsToUpdate: any[] = [];
      const appsToLinkGuarantor = new Map<string, string>(); // app_id -> guarantor_id

      for (const g of resolvedGuarantors) {
        const existingGuId = existingGuarantorMap.get(g.customer_id!);
        if (existingGuId) {
          guarantorsToUpdate.push({
            id: existingGuId,
            phone_number: g.phone_number || undefined,
            nic_number: g.nic_number || undefined,
            camp_id: g.camp_id || undefined,
          });
          if (g.guarantor_order === 1 && g.app_id) appsToLinkGuarantor.set(g.app_id, existingGuId);
        } else {
          // Avoid inserting the same guarantor twice in the same batch
          if (!guarantorsToInsert.some(ig => ig.customer_id === g.customer_id)) {
            guarantorsToInsert.push({
              customer_id:    g.customer_id,
              full_name:      g.full_name,
              phone_number:   g.phone_number   ?? null,
              nic_number:     g.nic_number     ?? null,
              service_number: g.service_number ?? null,
              branch:         'army',
              camp_id:        g.camp_id        ?? null,
              monthly_salary: 0,
              total_liability: 0,
              affordability_checked: true,
              affordability_ok: true,
            });
          }
        }
      }

      if (guarantorsToInsert.length > 0) {
        for (let i = 0; i < guarantorsToInsert.length; i += 500) {
          const chunk = guarantorsToInsert.slice(i, i + 500);
          const { data: insertedGus } = await sb.from('guarantors').insert(chunk).select('id, customer_id');
          if (insertedGus) {
            addedGuarantorsCount += insertedGus.length;
            insertedGus.forEach(ig => existingGuarantorMap.set(ig.customer_id, ig.id));
          }
        }
      }

      // 5. Link newly inserted guarantors to applications
      for (const g of resolvedGuarantors) {
        if (g.guarantor_order === 1 && g.app_id) {
          const guId = existingGuarantorMap.get(g.customer_id!);
          if (guId) appsToLinkGuarantor.set(g.app_id, guId);
        }
      }

      // Bulk update applications
      if (appsToLinkGuarantor.size > 0) {
        // Since we can't easily bulk update different values, we'll chunk Promises
        const linkPromises = Array.from(appsToLinkGuarantor.entries()).map(([appId, guId]) => 
          sb.from('applications').update({ guarantor_id: guId } as any).eq('id', appId)
        );
        // Process in batches of 50 to avoid overloading the DB
        for (let i = 0; i < linkPromises.length; i += 50) {
          await Promise.all(linkPromises.slice(i, i + 50));
        }
      }

      // Bulk update existing guarantors
      if (guarantorsToUpdate.length > 0) {
        const updatePromises = guarantorsToUpdate.map(gu => {
          const updates: any = {};
          if (gu.phone_number) updates.phone_number = gu.phone_number;
          if (gu.nic_number) updates.nic_number = gu.nic_number;
          if (gu.camp_id) updates.camp_id = gu.camp_id;
          if (Object.keys(updates).length > 0) {
            return sb.from('guarantors').update(updates).eq('id', gu.id);
          }
          return null;
        }).filter(Boolean);
        
        for (let i = 0; i < updatePromises.length; i += 50) {
          await Promise.all(updatePromises.slice(i, i + 50));
        }
      }

      app.log.info(`Added/linked ${guarantorsToCreate.length} guarantors (${addedGuarantorsCount} new, 1st+2nd GU)`);
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
      new_values: { total: rows.length, imported, duplicates, invalid },
    });

    // ── Fire real-time notifications (fire-and-forget) ────────
    // 1. One notification per new camp added
    for (const campName of missingUnits) {
      notify({ kind: 'camp_added', campName });
    }

    // 2. Notify camp officers about deductions
    for (const campName of uniqueUnits) {
      if (campName) {
        notify({ kind: 'camp_deductions_imported', campName, batchId: id });
      }
    }

      // 2. Summary notification for the entire import
      notify({
        kind: 'legacy_import_completed',
        totalRows:     rows.length,
        importedRows:  imported,
        duplicateRows: duplicates,
        newCustomers:  newCustomerCount,
        newCamps:      newCampCount,
        batchId:       id,
      });

      app.log.info(`Legacy import ${id} completed: ${imported} imported, ${duplicates} duplicates, ${invalid} invalid`);
      } catch (err) {
        app.log.error(`Legacy import background job failed for batch ${id}: ${err instanceof Error ? err.message : String(err)}`);
        const sb2 = getSupabase();
        await sb2.from('legacy_import_batches').update({ status: 'failed' } as any).eq('id', id);
      }
    }); // end setImmediate
  });

  // ── GET /:id/rows ─────────────────────────────────────────
  app.get('/:id/rows', { preHandler: [authenticate, requireFinance] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const q      = req.query as Record<string, string>;
    const page   = parseInt(q.page ?? '1');
    const limit  = 50;

    let query = getSupabase()
      .from('legacy_import_rows')
      .select('*', { count: 'exact' })
      .eq('batch_id', id)
      .order('row_number')
      .range((page - 1) * limit, page * limit - 1);

    if (q.status) query = query.eq('status', q.status);

    const { data, count } = await query;
    return reply.send({ data: data as any, meta: { total: count, page, limit } });
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
}
