import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { authenticate, requireRole, requireFinance } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { refreshCustomerRisk } from '../services/customers';
import { notify } from '../services/notify';

const UpdateDeductionSchema = z.object({
  status: z.enum(['deducted', 'partial', 'not_deducted']),
  deducted_amount: z.number().min(0).optional(),
  not_deducted_reason: z.enum([
    'salary_insufficient', 'absent_authorised', 'absent_unauthorised',
    'retired', 'transferred', 'deceased', 'left_service', 'wrong_details', 'other',
  ]).optional(),
  not_deducted_notes: z.string().max(500).optional(),
}).refine(data => {
  if (data.status === 'not_deducted' && !data.not_deducted_reason) {
    return false;
  }
  return true;
}, { message: 'not_deducted_reason is required when status is not_deducted' });

export default async function deductionRoutes(app: FastifyInstance) {

  // ── Get monthly sheet for a camp ──────────────────────────
  app.get('/camp/:campId/sheet', {
    preHandler: [authenticate, requireRole('camp_officer', 'finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { campId } = request.params as { campId: string };
    const { year, month } = request.query as { year?: string; month?: string };

    // Verify camp officer has access
    if (request.user!.role === 'camp_officer') {
      const supabase = getSupabase();
      const { data: assignment } = await supabase
        .from('camp_officer_assignments')
        .select('id')
        .eq('user_id', request.user!.id)
        .eq('camp_id', campId)
        .eq('is_active', true)
        .single();

      if (!assignment) {
        return reply.status(403).send({ error: 'You are not assigned to this camp' });
      }
    }

    const supabase = getSupabase();
    const nowYear = parseInt(year ?? String(new Date().getFullYear()));
    const nowMonth = parseInt(month ?? String(new Date().getMonth() + 1));

    const { data: rawData, error } = await supabase
      .from('installments')
      .select(`
        id, status, expected_amount, deducted_amount, arrears_amount,
        not_deducted_reason, not_deducted_notes, month_number,
        due_year, due_month, due_date, confirmed_at,
        customer:customers!installments_customer_id_fkey(
          id, full_name, service_number, rank, nic_number, camp_id
        ),
        application:applications(
          id, ref_number, monthly_amount, term_months,
          customer:customers(
            id, full_name, service_number, rank, nic_number, camp_id
          )
        )
      `)
      .eq('due_year', nowYear)
      .eq('due_month', nowMonth);

    // Filter to only installments belonging to this camp and sort client-side
    const data = rawData
      ?.filter((i: any) => (i.customer?.camp_id || i.application?.customer?.camp_id) === campId)
      .map((i: any) => {
        // Overwrite application.customer with the installment's liable customer (e.g. guarantor)
        if (i.application && i.customer) {
          i.application.customer = i.customer;
        }
        // Fix for existing partials saved as deducted
        if (i.status === 'deducted' && i.deducted_amount > 0 && i.deducted_amount < i.expected_amount) {
          i.status = 'partial';
        }
        return i;
      })
      .sort((a: any, b: any) =>
        (a.application?.customer?.full_name ?? '').localeCompare(b.application?.customer?.full_name ?? '')
      ) ?? [];

    if (error) return reply.status(500).send({ error: error.message });

    // Get summary
    const total = data?.length ?? 0;
    const deducted = data?.filter(i => i.status === 'deducted').length ?? 0;
    const partial = data?.filter(i => i.status === 'partial').length ?? 0;
    const notDeducted = data?.filter(i => i.status === 'not_deducted').length ?? 0;
    const pending = data?.filter(i => i.status === 'pending').length ?? 0;
    const totalExpected = data?.reduce((s, i) => s + (i.expected_amount ?? 0), 0) ?? 0;
    const totalDeducted = data?.reduce((s, i) => s + (i.deducted_amount ?? 0), 0) ?? 0;

    return reply.send({
      data,
      summary: {
        year: nowYear,
        month: nowMonth,
        camp_id: campId,
        total_records: total,
        deducted_count: deducted,
        partial_count: partial,
        not_deducted_count: notDeducted,
        pending_count: pending,
        total_expected: totalExpected,
        total_deducted: totalDeducted,
        success_rate: total > 0 ? Math.round((deducted / total) * 100) : 0,
      },
    });
  });

  // ── Update single installment deduction ───────────────────
  app.patch('/:installmentId', {
    preHandler: [authenticate, requireRole('camp_officer', 'finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { installmentId } = request.params as { installmentId: string };
    const body = UpdateDeductionSchema.safeParse(request.body);
    if (!body.success) {
      console.error('PATCH validation error:', JSON.stringify(body.error.flatten(), null, 2));
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    const supabase = getSupabase();

    const { data: installment } = await supabase
      .from('installments')
      .select('*, application:applications(customer_id, sales_officer_id, monthly_amount)')
      .eq('id', installmentId)
      .single();

    if (!installment) return reply.status(404).send({ error: 'Installment not found' });

    const updates: Record<string, unknown> = {
      status: body.data.status,
      not_deducted_reason: body.data.not_deducted_reason,
      not_deducted_notes: body.data.not_deducted_notes,
      deduction_submitted_at: new Date().toISOString(),
      deduction_submitted_by: request.user!.id,
    };

    if (body.data.status === 'deducted') {
      updates.deducted_amount = body.data.deducted_amount ?? installment.expected_amount;
      updates.arrears_amount = 0;
      updates.confirmed_at = new Date().toISOString();
      updates.confirmed_by = request.user!.id;
    } else if (body.data.status === 'partial') {
      const deducted = body.data.deducted_amount ?? 0;
      updates.deducted_amount = deducted;
      updates.arrears_amount = installment.expected_amount - deducted;
    } else {
      updates.deducted_amount = 0;
      updates.arrears_amount = installment.expected_amount;
    }

    await supabase.from('installments').update(updates).eq('id', installmentId);

    // Notify finance about this deduction update
    notify({
      kind: 'deduction_processed',
      ref: installment.application?.ref_number ?? installmentId,
      status: body.data.status,
      amount: typeof updates.deducted_amount === 'number' ? (updates.deducted_amount as number) : undefined,
      customerName: installment.application?.customer?.full_name ?? undefined,
      installmentId,
    }).catch(() => {});

    // Release commission if this is the FIRST deduction and it succeeded
    if (body.data.status === 'deducted' && installment.month_number === 1) {
      const { data: commission } = await supabase
        .from('commissions')
        .select('id, status')
        .eq('application_id', installment.application_id)
        .single();

      if (commission && commission.status === 'pending') {
        await supabase.from('commissions').update({
          status: 'payable',
          triggered_by_installment_id: installmentId,
          became_payable_at: new Date().toISOString(),
        }).eq('id', commission.id);

        writeAuditLog({
          user_id: request.user!.id,
          action: AuditActions.COMMISSION_RELEASED,
          entity_type: 'commissions',
          entity_id: commission.id,
          metadata: { triggered_by: installmentId },
        });
      }
    }

    // Refresh customer risk score asynchronously
    if (installment.application?.customer_id) {
      refreshCustomerRisk(installment.application.customer_id).catch(() => {});
    }

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.DEDUCTION_SUBMITTED,
      entity_type: 'installments',
      entity_id: installmentId,
      old_values: { status: installment.status },
      new_values: updates,
    });

    return reply.send({ success: true, data: updates });
  });

  // ── Bulk update (submit entire monthly sheet) ─────────────
  app.post('/bulk-submit', {
    preHandler: [authenticate, requireRole('camp_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      camp_id: z.string().uuid(),
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      deductions: z.array(z.object({
        installment_id: z.string().uuid(),
        status: z.enum(['deducted', 'partial', 'not_deducted']),
        deducted_amount: z.number().min(0).optional(),
        not_deducted_reason: z.string().optional(),
        not_deducted_notes: z.string().optional(),
      })),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const supabase = getSupabase();

    // Upsert batch record — handles re-submissions for the same camp/month
    const { data: batch } = await supabase
      .from('deduction_batches')
      .upsert({
        camp_id: body.data.camp_id,
        submission_year: body.data.year,
        submission_month: body.data.month,
        submitted_by: request.user!.id,
        submitted_at: new Date().toISOString(),
        records_count: body.data.deductions.length,
      }, { onConflict: 'camp_id,submission_year,submission_month' })
      .select()
      .single();

    if (!batch) return reply.status(500).send({ error: 'Failed to create batch' });

    let deductedCount = 0;
    let totalDeducted = 0;
    let totalExpected = 0;

    for (const item of body.data.deductions) {
      const { data: inst } = await supabase
        .from('installments')
        .select('expected_amount, month_number, application_id')
        .eq('id', item.installment_id)
        .single();

      if (!inst) continue;
      totalExpected += inst.expected_amount;

      const updates: Record<string, unknown> = {
        status: item.status,
        not_deducted_reason: item.not_deducted_reason,
        not_deducted_notes: item.not_deducted_notes,
        deduction_submitted_at: new Date().toISOString(),
        deduction_submitted_by: request.user!.id,
        deduction_batch_id: batch.id,
      };

      if (item.status === 'deducted') {
        const amt = item.deducted_amount ?? inst.expected_amount;
        updates.deducted_amount = amt;
        updates.arrears_amount = 0;
        updates.confirmed_at = new Date().toISOString();
        updates.confirmed_by = request.user!.id;
        totalDeducted += amt;
        deductedCount++;

        // Commission release for month 1
        if (inst.month_number === 1) {
          await supabase.from('commissions')
            .update({ status: 'payable', triggered_by_installment_id: item.installment_id, became_payable_at: new Date().toISOString() })
            .eq('application_id', inst.application_id)
            .eq('status', 'pending');
        }
      } else {
        updates.deducted_amount = item.deducted_amount ?? 0;
        updates.arrears_amount = inst.expected_amount - (item.deducted_amount ?? 0);
      }

      await supabase.from('installments').update(updates).eq('id', item.installment_id);
    }

    // Update batch summary
    await supabase.from('deduction_batches').update({
      total_expected: totalExpected,
      total_deducted: totalDeducted,
      deducted_count: deductedCount,
      not_deducted_count: body.data.deductions.length - deductedCount,
    }).eq('id', batch.id);

    // Notify finance that a deduction batch was submitted
    notify({ kind: 'deduction_processed', ref: `batch_${batch.id}`, status: 'batch_submitted', installmentId: batch.id }).catch(() => {});

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.DEDUCTION_BATCH_SUBMITTED,
      entity_type: 'deduction_batches',
      entity_id: batch.id,
      new_values: {
        camp_id: body.data.camp_id,
        year: body.data.year,
        month: body.data.month,
        records: body.data.deductions.length,
        deducted: deductedCount,
      },
    });

    return reply.send({
      success: true,
      batch_id: batch.id,
      summary: {
        total_records: body.data.deductions.length,
        deducted_count: deductedCount,
        total_expected: totalExpected,
        total_deducted: totalDeducted,
      },
    });
  });

  // ── Monthly summary ───────────────────────────────────────
  app.get('/summary/monthly', {
    preHandler: [authenticate, requireFinance],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('monthly_deduction_summary')
      .select('*')
      .order('due_year', { ascending: false })
      .order('due_month', { ascending: false })
      .limit(120);

    return reply.send({ data });
  });

  // ── GET /deductions/camp/:campId/trend — 6-month success rate ─
  app.get('/camp/:campId/trend', {
    preHandler: [authenticate, requireRole('camp_officer', 'finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { campId } = request.params as { campId: string };
    const supabase = getSupabase();
    const now = new Date();

    const months: { year: number; month: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      });
    }

    const trend = await Promise.all(months.map(async ({ year, month, label }) => {
      const { data: installments } = await supabase
        .from('installments')
        .select('status, customer:customers!installments_customer_id_fkey(camp_id), application:applications(customer:customers(camp_id))')
        .eq('due_year', year)
        .eq('due_month', month);

      const campInstallments = (installments ?? []).filter(
        (i: any) => (i.customer?.camp_id || i.application?.customer?.camp_id) === campId
      );
      const total = campInstallments.length;
      const deducted = campInstallments.filter((i: any) => i.status === 'deducted').length;
      const rate = total > 0 ? Math.round((deducted / total) * 100) : 0;
      return { year, month, label, total, deducted, rate };
    }));

    return reply.send({ data: trend });
  });

  // ── GET /deductions/camp/:campId/past-submissions ─────────────
  app.get('/camp/:campId/past-submissions', {
    preHandler: [authenticate, requireRole('camp_officer', 'finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { campId } = request.params as { campId: string };
    const { data } = await getSupabase()
      .from('deduction_batches')
      .select('*')
      .eq('camp_id', campId)
      .order('submission_year', { ascending: false })
      .order('submission_month', { ascending: false })
      .limit(24);

    return reply.send({ data });
  });

  // ── GET /deductions/camp/:campId/retirement-watch ─────────────
  app.get('/camp/:campId/retirement-watch', {
    preHandler: [authenticate, requireRole('camp_officer', 'finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { campId } = request.params as { campId: string };
    const now = new Date();
    const sixMonthsLater = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

    const { data } = await getSupabase()
      .from('customers')
      .select('id, full_name, service_number, rank, retirement_date, applications(id, status, monthly_amount, phone_model:phone_models(model))')
      .eq('camp_id', campId)
      .not('retirement_date', 'is', null)
      .lte('retirement_date', sixMonthsLater.toISOString().split('T')[0])
      .gte('retirement_date', now.toISOString().split('T')[0])
      .is('deleted_at', null)
      .order('retirement_date', { ascending: true })
      .limit(50);

    return reply.send({ data });
  });

  // ── POST /deductions/camp/:campId/excel-import ────────────
  // Upload MIR Excel → sync installments for selected camp/month/year
  app.post('/camp/:campId/excel-import', {
    preHandler: [authenticate, requireRole('finance_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { campId } = request.params as { campId: string };

    const data = await (request as any).file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const { year: yearStr, month: monthStr } = request.query as { year?: string; month?: string };
    const year  = parseInt(yearStr  ?? String(new Date().getFullYear()));
    const month = parseInt(monthStr ?? String(new Date().getMonth() + 1));
    const MONTH_MAP_LOCAL: Record<string, string> = {
      jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
      jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    };
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    let wb: XLSX.WorkBook;
    try { wb = XLSX.read(buffer, { type: 'buffer', cellDates: true }); }
    catch (e) { return reply.status(400).send({ error: 'Failed to parse Excel file' }); }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
    if (rows2d.length < 2) return reply.status(400).send({ error: 'Excel file appears empty' });

    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(8, rows2d.length); i++) {
      const r = rows2d[i] as unknown[];
      if (r.filter(c => typeof c === 'string' && c.trim().length > 1).length >= 3) { headerIdx = i; break; }
    }
    const headers = (rows2d[headerIdx] as unknown[]).map(h => String(h ?? '').trim());

    // Detect month columns
    const monthCols: { idx: number; key: string }[] = [];
    headers.forEach((h, i) => {
      const cleaned = h.toLowerCase().trim().replace(/\s+/g, '');
      const m = cleaned.match(/^([a-z]{3})-?(\d{2,4})$/);
      if (m && MONTH_MAP_LOCAL[m[1]]) {
        const yr = m[2].length === 2 ? `20${m[2]}` : m[2];
        monthCols.push({ idx: i, key: `${yr}-${MONTH_MAP_LOCAL[m[1]]}` });
      }
    });

    const svcColIdx     = headers.findIndex(h => /service|svc|reg|no\.?/i.test(h.trim()));
    const nameColIdx    = headers.findIndex(h => /name|soldier|customer/i.test(h.trim()));
    const monthlyColIdx = headers.findIndex(h => /int|installment|monthly|amount|deduction/i.test(h.trim()));

    const targetMonthCol = monthCols.find(mc => mc.key === monthKey);
    if (!targetMonthCol) {
      return reply.status(400).send({
        error: `Month column "${monthKey}" not found in Excel. Available: ${monthCols.map(m => m.key).join(', ')}`,
      });
    }

    const sb = getSupabase();
    const { data: campCustomers } = await sb
      .from('customers').select('id, service_number, full_name')
      .eq('camp_id', campId).is('deleted_at', null);

    const custBySvcNo = new Map<string, string>();
    const custByName  = new Map<string, string>();
    for (const c of campCustomers ?? []) {
      if (c.service_number) custBySvcNo.set(c.service_number.trim().toUpperCase(), c.id);
      custByName.set(c.full_name.trim().toUpperCase(), c.id);
    }

    const parseCellLocal = (val: unknown, monthly: number): { status: string; amount: number } => {
      const raw = String(val ?? '').trim();
      const up  = raw.toUpperCase().replace(/\s+/g, ' ');
      if (!raw || raw === '-' || raw === '0') return { status: 'not_deducted', amount: 0 };
      if (['SETTLED','SETTELED','LCB SETTLED','LCB','COMPLETE','PAID','FULL'].some(s => up.includes(s)))
        return { status: 'deducted', amount: monthly };
      if (up === 'NEW' || up === 'N/A' || up === 'NIL') return { status: 'pending', amount: 0 };
      const n = parseFloat(raw.replace(/,/g, ''));
      if (!isNaN(n) && n > 0) {
        return n >= monthly * 0.95 ? { status: 'deducted', amount: n } : { status: 'partial', amount: n };
      }
      return { status: 'not_deducted', amount: 0 };
    };

    let matched = 0, updated = 0, notFound = 0;

    for (let ri = headerIdx + 1; ri < rows2d.length; ri++) {
      const row = rows2d[ri] as unknown[];
      if (row.filter(c => String(c ?? '').trim() !== '').length < 2) continue;

      const svcNo    = svcColIdx    >= 0 ? String(row[svcColIdx]    ?? '').trim().toUpperCase() : '';
      const custName = nameColIdx   >= 0 ? String(row[nameColIdx]   ?? '').trim().toUpperCase() : '';
      const monthly  = monthlyColIdx >= 0 ? parseFloat(String(row[monthlyColIdx] ?? '').replace(/,/g, '')) : 0;

      let customerId = svcNo ? custBySvcNo.get(svcNo) : undefined;
      if (!customerId && custName) customerId = custByName.get(custName);
      
      let isNewCustomer = false;

      if (!customerId) { 
        const fallbackName = custName || svcNo || 'Unknown Customer';
        if (!custName && !svcNo) { notFound++; continue; }
        
        // Find camp branch
        const { data: campData } = await sb.from('camps').select('branch').eq('id', campId).single();
        const campBranch = campData?.branch ?? 'army';

        const { data: newCust, error: err } = await sb.from('customers').insert({
           full_name: fallbackName,
           service_number: svcNo || null,
           camp_id: campId,
           branch: campBranch,
           rank: 'Unknown',
           created_by: request.user!.id
        }).select('id').single();
        
        if (err || !newCust) { notFound++; continue; }
        customerId = newCust.id;
        
        // Add to our maps so subsequent rows in same sheet match
        if (svcNo) custBySvcNo.set(svcNo, customerId as string);
        if (custName) custByName.set(custName, customerId as string);
        
        isNewCustomer = true;
      }

      matched++;
      const cellVal = row[targetMonthCol.idx];
      const { status, amount } = parseCellLocal(cellVal, monthly || 0);

      let application: any = null;

      if (isNewCustomer) {
        // Create dummy application
        const { data: defaultPhone } = await sb.from('phone_models').select('id, sale_price').limit(1).single();
        if (defaultPhone) {
          const saleDate = new Date(year, month - 1, 1);
          const planEnd = new Date(saleDate);
          planEnd.setMonth(planEnd.getMonth() + 12);

          const { data: newApp } = await sb.from('applications').insert({
            customer_id: customerId,
            phone_model_id: defaultPhone.id,
            sales_officer_id: request.user!.id,
            sale_price: defaultPhone.sale_price || (monthly * 12) || 0,
            down_payment: 0,
            financed_amount: monthly * 12,
            monthly_amount: monthly || 0,
            term_months: 12,
            sale_date: saleDate.toISOString().split('T')[0],
            plan_end_date: planEnd.toISOString().split('T')[0],
            status: 'approved',
            notes: 'Auto-created from Excel import'
          }).select('id').single();
          application = newApp;
        }
      } else {
        const { data: appData } = await sb
          .from('applications').select('id')
          .eq('customer_id', customerId)
          .not('status', 'eq', 'rejected')
          .limit(1).single();
        application = appData;
      }

      if (!application) continue;

      const { data: installment } = await sb
        .from('installments').select('id, status, expected_amount')
        .eq('application_id', application.id)
        .eq('due_year', year).eq('due_month', month)
        .maybeSingle();

      if (!installment) {
        const dueDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
        await sb.from('installments').insert({
          application_id:  application.id,
          customer_id:     customerId,
          due_date:        dueDate,
          due_year:        year,
          due_month:       month,
          amount:          monthly || 0,
          expected_amount: monthly || 0,
          deducted_amount: (status === 'deducted' || status === 'partial') ? amount : 0,
          arrears_amount:  status === 'not_deducted' ? (monthly || 0) : 0,
          status,
        } as any);
        updated++;
      } else {
        const exp = installment.expected_amount ?? monthly ?? 0;
        await sb.from('installments').update({
          status,
          deducted_amount: (status === 'deducted' || status === 'partial') ? amount : 0,
          arrears_amount:  status === 'not_deducted' ? exp : status === 'partial' ? exp - amount : 0,
        }).eq('id', installment.id);
        updated++;
      }
    }

    return reply.send({
      success: true,
      summary: { matched, updated, not_found: notFound },
      message: `Synced ${updated} installment(s) from Excel. ${notFound} row(s) not matched.`,
    });
  });
}
