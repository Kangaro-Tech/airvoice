import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog } from '../services/audit';

export default async function companyPaymentsRoutes(app: FastifyInstance) {

  // ── GET /company-payments ── List all AirVoice advance payments
  app.get('/', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { status?: string; customer_id?: string; page?: string };
    const sb = getSupabase();
    const page = parseInt(q.page ?? '1');
    const limit = 30;

    let query = sb
      .from('company_payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (q.status) query = query.eq('status', q.status);
    if (q.customer_id) query = query.eq('customer_id', q.customer_id);

    const { data: rawData, count, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    const customerIds = [...new Set((rawData ?? []).map((r: any) => r.customer_id))].filter(Boolean);
    const appIds = [...new Set((rawData ?? []).map((r: any) => r.application_id))].filter(Boolean);
    
    const [custRes, appRes] = await Promise.all([
      customerIds.length ? sb.from('customers').select('id, full_name, service_number, phone_number').in('id', customerIds) : { data: [] },
      appIds.length ? sb.from('applications').select('id, ref_number, monthly_amount').in('id', appIds) : { data: [] }
    ]);

    const data = (rawData ?? []).map((p: any) => ({
      ...p,
      customer: (custRes.data ?? []).find((c: any) => c.id === p.customer_id),
      application: (appRes.data ?? []).find((a: any) => a.id === p.application_id)
    }));

    return reply.send({ data, meta: { total: count, page, limit } });
  });

  // ── POST /company-payments ── AirVoice pays on behalf of customer
  app.post('/', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      application_id: z.string().uuid(),
      installment_id: z.string().uuid().optional(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();

    // Create the company payment record
    const { data: payment, error } = await sb
      .from('company_payments')
      .insert({
        ...body.data,
        status: 'outstanding',
        recovered_amount: 0,
        processed_by: req.user!.id,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // If linked to installment, mark it as covered by company
    if (body.data.installment_id) {
      await sb.from('installments')
        .update({ status: 'company_paid', updated_at: new Date().toISOString() } as any)
        .eq('id', body.data.installment_id);
    }

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'COMPANY_PAYMENT_CREATED',
      entity_type: 'company_payments',
      entity_id: payment.id,
      new_values: body.data,
    });

    // --- Automatically create an expense for company payment ---
    try {
      let catRes = await sb.from('expense_categories').select('id').eq('name', 'Company Payments').single();
      let catId = catRes.data?.id;
      if (!catId) {
        const newCat = await sb.from('expense_categories').insert({ name: 'Company Payments', type: 'expense' }).select('id').single();
        catId = newCat.data?.id;
      }

      if (catId) {
        await sb.from('expenses').insert({
          category_id: catId,
          amount: body.data.amount,
          description: `Company Payment for Customer ID: ${body.data.customer_id} ${body.data.notes ? '- ' + body.data.notes : ''}`,
          expense_date: new Date().toISOString().split('T')[0],
          status: 'approved',
          payment_method: 'Bank Transfer',
          submitted_by: req.user!.id
        });
      }
    } catch (err) {
      console.error('Failed to create expense for company payment:', err);
    }
    // -----------------------------------------------------------

    return reply.status(201).send({ data: payment });
  });

  // ── POST /company-payments/:id/recover ── Record partial/full recovery from customer
  app.post('/:id/recover', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      recover_amount: z.number().positive(),
      notes: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();

    // Get the current payment
    const { data: payment, error: fetchErr } = await sb
      .from('company_payments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !payment) return reply.status(404).send({ error: 'Payment not found' });

    const newRecovered = Number(payment.recovered_amount) + body.data.recover_amount;
    const remaining = Number(payment.amount) - newRecovered;
    const newStatus = remaining <= 0 ? 'fully_recovered' : newRecovered > 0 ? 'partially_recovered' : 'outstanding';

    const { data: updated, error: updateErr } = await sb
      .from('company_payments')
      .update({
        recovered_amount: Math.min(newRecovered, payment.amount),
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return reply.status(500).send({ error: updateErr.message });

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'COMPANY_PAYMENT_RECOVERED',
      entity_type: 'company_payments',
      entity_id: id,
      new_values: { recover_amount: body.data.recover_amount, new_status: newStatus },
    });

    return reply.send({ data: updated, remaining: Math.max(0, remaining) });
  });

  // ── GET /company-payments/summary ── Outstanding total per customer
  app.get('/summary', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')],
  }, async (_req: FastifyRequest, reply) => {
    const sb = getSupabase();
    const { data: rawData, error } = await sb
      .from('company_payments')
      .select('customer_id, amount, recovered_amount, status')
      .neq('status', 'fully_recovered');

    if (error) return reply.status(500).send({ error: error.message });
    
    const customerIds = [...new Set((rawData ?? []).map((r: any) => r.customer_id))].filter(Boolean);
    const { data: custRes } = customerIds.length > 0 
      ? await sb.from('customers').select('id, full_name, service_number').in('id', customerIds) 
      : { data: [] };

    const data = (rawData ?? []).map((p: any) => ({
      ...p,
      customer: (custRes ?? []).find((c: any) => c.id === p.customer_id)
    }));

    const customerMap: Record<string, any> = {};
    (data ?? []).forEach((p: any) => {
      const cid = p.customer_id;
      if (!customerMap[cid]) {
        customerMap[cid] = {
          customer_id: cid,
          customer_name: p.customer?.full_name ?? '—',
          service_number: p.customer?.service_number ?? '—',
          total_advanced: 0,
          total_recovered: 0,
        };
      }
      customerMap[cid].total_advanced += Number(p.amount);
      customerMap[cid].total_recovered += Number(p.recovered_amount);
    });

    return reply.send({
      data: Object.values(customerMap).map((c: any) => ({
        ...c,
        outstanding: c.total_advanced - c.total_recovered,
      })),
    });
  });

  // ── POST /company-payments/check-arrears ── Auto-flag 3-month defaults
  app.post('/check-arrears', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')],
  }, async (req: FastifyRequest, reply) => {
    const sb = getSupabase();

    // 1. Find customers with >= 3 'not_deducted' or 'partial' installments
    // where they have not been added to company payments for that application yet.
    
    // We group by application_id because arrears apply per application
    const { data: arrearsData, error: arrearsErr } = await sb
      .from('installments')
      .select('customer_id, application_id, status')
      .in('status', ['not_deducted', 'partial']);

    if (arrearsErr) return reply.status(500).send({ error: arrearsErr.message });

    const appArrearsMap = new Map<string, { customer_id: string; missed_count: number }>();
    
    for (const inst of (arrearsData || [])) {
      if (!appArrearsMap.has(inst.application_id)) {
        appArrearsMap.set(inst.application_id, { customer_id: inst.customer_id, missed_count: 0 });
      }
      appArrearsMap.get(inst.application_id)!.missed_count++;
    }

    const defaulterAppIds = Array.from(appArrearsMap.entries())
      .filter(([_, data]) => data.missed_count >= 3)
      .map(([app_id]) => app_id);

    if (defaulterAppIds.length === 0) {
      return reply.send({ success: true, processed: 0, message: 'No new defaulters found.' });
    }

    // 2. Filter out those who already have a company payment for this application
    const { data: existingCPs } = await sb
      .from('company_payments')
      .select('application_id')
      .in('application_id', defaulterAppIds);

    const existingAppIds = new Set((existingCPs || []).map((cp: any) => cp.application_id));
    const newDefaulterAppIds = defaulterAppIds.filter(id => !existingAppIds.has(id));

    if (newDefaulterAppIds.length === 0) {
       return reply.send({ success: true, processed: 0, message: 'Defaulters already processed.' });
    }

    // 3. For new defaulters, calculate the total arrears amount (sum of expected_amount - deducted_amount)
    //    and create a company payment record.
    const { data: newDefaulterInsts } = await sb
      .from('installments')
      .select('application_id, arrears_amount')
      .in('application_id', newDefaulterAppIds);

    const appArrearsAmountMap = new Map<string, number>();
    for (const inst of (newDefaulterInsts || [])) {
       const amount = Number(inst.arrears_amount) || 0;
       appArrearsAmountMap.set(inst.application_id, (appArrearsAmountMap.get(inst.application_id) || 0) + amount);
    }

    const companyPaymentsToInsert = newDefaulterAppIds.map(appId => {
      const data = appArrearsMap.get(appId)!;
      const amount = appArrearsAmountMap.get(appId) || 0;
      
      return {
        customer_id: data.customer_id,
        application_id: appId,
        amount: amount,
        notes: `Auto-flagged: Customer missed ${data.missed_count} installments.`,
        status: 'outstanding',
        recovered_amount: 0,
        processed_by: req.user!.id,
      };
    });

    const { data: insertedCPs, error: insertErr } = await sb
      .from('company_payments')
      .insert(companyPaymentsToInsert)
      .select();

    if (insertErr) return reply.status(500).send({ error: insertErr.message });

    // --- Automatically create expenses for auto-flagged company payments ---
    try {
      let catRes = await sb.from('expense_categories').select('id').eq('name', 'Company Payments').single();
      let catId = catRes.data?.id;
      if (!catId) {
        const newCat = await sb.from('expense_categories').insert({ name: 'Company Payments', type: 'expense' }).select('id').single();
        catId = newCat.data?.id;
      }

      if (catId && insertedCPs) {
        const expensesToInsert = insertedCPs.map((cp: any) => ({
          category_id: catId,
          amount: cp.amount,
          description: `Company Payment for Customer ID: ${cp.customer_id} - ${cp.notes}`,
          expense_date: new Date().toISOString().split('T')[0],
          status: 'approved',
          payment_method: 'Bank Transfer',
          submitted_by: req.user!.id
        }));

        await sb.from('expenses').insert(expensesToInsert);
      }
    } catch (err) {
      console.error('Failed to create expenses for auto-flagged company payments:', err);
    }
    // ------------------------------------------------------------------------

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'COMPANY_PAYMENT_AUTO_CREATED',
      entity_type: 'company_payments',
      entity_id: 'batch',
      new_values: { count: companyPaymentsToInsert.length, apps: newDefaulterAppIds },
    });

    return reply.send({ success: true, processed: companyPaymentsToInsert.length, data: insertedCPs });
  });
}
