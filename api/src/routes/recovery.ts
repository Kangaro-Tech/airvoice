import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function recoveryRoutes(app: FastifyInstance) {
  
  // ── GET /recovery/overdue ──
  app.get('/overdue', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {camp_id?:string;min_missed?:string};
    const minMissed = parseInt(q.min_missed ?? '0');
    const sb = getSupabase();

    // Query customers with active applications and installments
    const { data: customers } = await sb.from('customers')
      .select(`
        id, full_name, service_number, phone_number, email, risk_level, risk_score,
        camp:camps(name,branch),
        applications(
          id, ref_number, status, monthly_amount,
          installments(status, expected_amount, deducted_amount, arrears_amount, due_date)
        ),
        recovery_logs(contact_method, contacted_at, outcome, notes)
      `)
      .eq('applications.status','active')
      .is('deleted_at',null)
      .eq('is_active',true);

    if (!customers || customers.length === 0) return reply.send({ data: [] });

    // Fetch guarantors for all these customers in one query
    const customerIds = customers.map((c: any) => c.id);
    const { data: guarantorRows } = await sb
      .from('guarantors')
      .select('customer_id, full_name, phone_number, service_number, branch')
      .in('customer_id', customerIds)
      .is('deleted_at', null);

    // Build a map: customer_id -> guarantor info
    const guarantorMap = new Map<string, any>();
    (guarantorRows ?? []).forEach((g: any) => {
      if (!guarantorMap.has(g.customer_id)) {
        guarantorMap.set(g.customer_id, g);
      }
    });

    const result = (customers ?? []).map((c: any) => {
      const app = c.applications?.[0];
      const installments = app?.installments ?? [];
      const arrears = installments.reduce((s: number, inst: any) => s + Number(inst.arrears_amount ?? 0), 0);
      const missed = installments.filter((inst: any) => inst.status === 'not_deducted' || inst.status === 'arrears').length;

      if (missed < minMissed) return null;

      // Guarantor data comes directly from guarantors table
      const gRow = guarantorMap.get(c.id);
      const guarantor = gRow ? {
        name: gRow.full_name ?? '—',
        phone: gRow.phone_number ?? '—',
        service_number: gRow.service_number ?? '—',
      } : null;

      const sortedLogs = c.recovery_logs ? [...c.recovery_logs].sort((a: any, b: any) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime()) : [];
      const latestLog = sortedLogs[0];

      return {
        id: c.id,
        full_name: c.full_name,
        service_number: c.service_number,
        phone_number: c.phone_number,
        email: c.email,
        risk_level: c.risk_level ?? 'low',
        risk_score: c.risk_score ?? 0,
        camp: c.camp ? { name: c.camp.name, branch: c.camp.branch } : null,
        guarantor,
        arrears_amount: arrears,
        missed_months: missed,
        last_contact_date: latestLog ? new Date(latestLog.contacted_at).toISOString().split('T')[0] : null,
        last_contact_outcome: latestLog ? `${latestLog.notes || latestLog.outcome}` : `${missed} consecutive missed deduction(s).`,
        applications: c.applications || []
      };
    }).filter(Boolean);

    return reply.send({ data: result });
  });

  // ── GET /recovery/logs ──
  app.get('/logs', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {customer_id?:string;application_id?:string};
    let query = getSupabase().from('recovery_logs')
      .select('*,officer:users!officer_id(phone_number)').order('created_at',{ascending:false}).limit(100);
    if (q.customer_id)    query = query.eq('customer_id',q.customer_id);
    if (q.application_id) query = query.eq('application_id',q.application_id);
    const {data} = await query;
    return reply.send({data});
  });

  // ── POST /recovery/logs ──
  app.post('/logs', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      application_id:z.string().uuid(), customer_id:z.string().uuid(),
      contact_method:z.enum(['phone_call','whatsapp','sms','visit','letter']),
      contacted_at:z.string(), outcome:z.enum(['pending','kept','broken','partial','transferred_to_guarantor','written_off']),
      notes:z.string().optional(),
      promise_to_pay_date:z.string().date().optional(),
      promise_amount:z.number().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const {data,error} = await getSupabase().from('recovery_logs').insert({...body.data,officer_id:req.user!.id} as any).select().single();
    if (error) return reply.status(500).send({error:error.message});
    return reply.status(201).send({data});
  });

  // ── POST /recovery/transfer-guarantor ──
  app.post('/transfer-guarantor', { preHandler:[authenticate,requireRole('admin','super_admin','recovery_officer')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      reason: z.string()
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const sb = getSupabase();

    // Guarantors table is keyed by customer_id (the customer being guaranteed)
    const { data: guarantorData } = await sb
      .from('guarantors')
      .select('id')
      .eq('customer_id', body.data.customer_id)
      .is('deleted_at', null)
      .maybeSingle();

    // Write audit log
    const { error: logError } = await sb.from('audit_logs').insert({
      user_id:     req.user!.id,
      action:      'GUARANTOR_TRANSFER_INITIATED',
      entity_type: 'customers',
      entity_id:   body.data.customer_id,
      new_values:  { reason: body.data.reason, transferred_by: req.user!.id, guarantor_id: guarantorData?.id ?? null },
    } as any);

    if (logError) return reply.status(500).send({error: logError.message});
    return reply.send({ 
      success: true, 
      message: guarantorData ? 'Guarantor transfer submitted successfully' : 'Transfer logged — no guarantor linked to this customer',
    });
  });

  // ── POST /recovery/legal-notice ──
  app.post('/legal-notice', { preHandler:[authenticate,requireRole('recovery_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const sb = getSupabase();

    // Write proper audit log using correct columns
    const { error: logError } = await sb.from('audit_logs').insert({
      user_id:     req.user!.id,
      action:      'LEGAL_NOTICE_SENT',
      entity_type: 'customers',
      entity_id:   body.data.customer_id,
      new_values:  { issued_by: req.user!.id, issued_at: new Date().toISOString() },
    } as any);

    if (logError) return reply.status(500).send({error: logError.message});
    return reply.send({ success: true, message: 'Legal notice issued' });
  });

  // ── GET /recovery/letters ── List recovery letters
  app.get('/letters', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const q = req.query as { customer_id?: string; status?: string; page?: string };
    const page = parseInt(q.page ?? '1');
    const limit = 30;
    const sb = getSupabase();

    let query = sb
      .from('recovery_letters')
      .select(`
        *,
        customer:customers(id, full_name, service_number, phone_number),
        application:applications(id, ref_number),
        sent_by_user:users!sent_by(phone_number)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (q.customer_id) query = query.eq('customer_id', q.customer_id);
    if (q.status) query = query.eq('status', q.status);

    const { data, count, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data, meta: { total: count, page, limit } });
  });

  // ── POST /recovery/letters ── Create (draft) recovery letter
  app.post('/letters', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      application_id: z.string().uuid().optional(),
      letter_type: z.enum(['first_notice', 'second_notice', 'final_notice', 'legal_notice']).default('first_notice'),
      letter_body: z.string().min(10),
      delivery_method: z.enum(['email', 'whatsapp', 'post', 'in_person']).optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('recovery_letters')
      .insert({ ...body.data, status: 'draft' })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── PUT /recovery/letters/:id ── Edit recovery letter
  app.put('/letters/:id', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      letter_type: z.enum(['first_notice', 'second_notice', 'final_notice', 'legal_notice']).optional(),
      letter_body: z.string().min(10).optional(),
      delivery_method: z.enum(['email', 'whatsapp', 'post', 'in_person']).optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('recovery_letters')
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── POST /recovery/letters/:id/send ── Mark letter as sent
  app.post('/letters/:id/send', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    const { data, error } = await sb
      .from('recovery_letters')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: req.user!.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Write audit log
    await sb.from('audit_logs').insert({
      user_id: req.user!.id,
      action: 'RECOVERY_LETTER_SENT',
      entity_type: 'recovery_letters',
      entity_id: id,
      new_values: { sent_at: data.sent_at, sent_by: req.user!.id },
    } as any);

    return reply.send({ data });
  });

  // ── GET /recovery/letters/template ── Get a template for letter generation
  app.get('/letters/template', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const q = req.query as { customer_id?: string; letter_type?: string };
    const sb = getSupabase();

    let customerData: any = null;
    if (q.customer_id) {
      const { data: cust } = await sb
        .from('customers')
        .select('full_name, service_number, phone_number, rank, branch, camp:camps(name)')
        .eq('id', q.customer_id)
        .single();
      customerData = cust;
    }

    const letterType = q.letter_type ?? 'first_notice';
    const typeLabel: Record<string, string> = {
      first_notice: 'FIRST PAYMENT REMINDER',
      second_notice: 'SECOND PAYMENT NOTICE',
      final_notice: 'FINAL PAYMENT NOTICE',
      legal_notice: 'LEGAL NOTICE OF DEFAULT',
    };

    const today = new Date().toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' });
    const template = `AIRVOICE DEFENCE FINANCE
${typeLabel[letterType] ?? 'PAYMENT NOTICE'}
Date: ${today}

Dear ${customerData?.full_name ?? '[Customer Name]'},
Rank: ${customerData?.rank ?? '[Rank]'} | Service No: ${customerData?.service_number ?? '[Service Number]'}
Camp: ${customerData?.camp?.name ?? '[Camp Name]'} | Branch: ${customerData?.branch ?? '[Branch]'}

This letter is to formally notify you that your mobile phone installment account with AIRVOICE Defence Finance has outstanding arrears.

We kindly request you to settle the outstanding balance at the earliest possible date.

If you have already made the payment, please disregard this notice and contact our office to confirm receipt.

For queries, please contact our Recovery Office.

Sincerely,
AIRVOICE Defence Finance Recovery Department
Tel: +94 11 XXX XXXX`;

    return reply.send({ template, customer: customerData });
  });
}

