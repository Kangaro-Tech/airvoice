import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog } from '../services/audit';

export default async function companyPaymentsRoutes(app: FastifyInstance) {

  // ── GET /company-payments ── List all AirVoice advance payments
  app.get('/', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin')],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { status?: string; customer_id?: string; page?: string };
    const sb = getSupabase();
    const page = parseInt(q.page ?? '1');
    const limit = 30;

    let query = sb
      .from('company_payments')
      .select(`
        *,
        customer:customers(id, full_name, service_number, phone_number),
        application:applications(id, ref_number, monthly_amount),
        installment:installments(id, due_date, expected_amount),
        processed_by_user:users!processed_by(phone_number)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (q.status) query = query.eq('status', q.status);
    if (q.customer_id) query = query.eq('customer_id', q.customer_id);

    const { data, count, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ data, meta: { total: count, page, limit } });
  });

  // ── POST /company-payments ── AirVoice pays on behalf of customer
  app.post('/', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin')],
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

    await writeAuditLog(sb, {
      user_id: req.user!.id,
      action: 'COMPANY_PAYMENT_CREATED',
      entity_type: 'company_payments',
      entity_id: payment.id,
      new_values: body.data,
    });

    return reply.status(201).send({ data: payment });
  });

  // ── POST /company-payments/:id/recover ── Record partial/full recovery from customer
  app.post('/:id/recover', {
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin')],
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

    await writeAuditLog(sb, {
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
    preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin')],
  }, async (_req: FastifyRequest, reply) => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('company_payments')
      .select('customer_id, amount, recovered_amount, status, customer:customers(full_name, service_number)')
      .neq('status', 'fully_recovered');

    if (error) return reply.status(500).send({ error: error.message });

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
}
