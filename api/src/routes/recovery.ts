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

    // Query active customers
    const { data: customersRaw } = await sb.from('customers')
      .select('id, full_name, service_number, phone_number, email, risk_level, risk_score, camp_id')
      .is('deleted_at',null)
      .eq('is_active',true);
      
    if (!customersRaw || customersRaw.length === 0) return reply.send({ data: [] });
    let customers = customersRaw || [];
    
    const custIds = customers.map(c => c.id);

    // Fetch active applications for these customers
    const { data: appsRaw } = await sb.from('applications')
      .select('id, ref_number, status, monthly_amount, customer_id')
      .eq('status', 'active')
      .in('customer_id', custIds);
      
    const apps = appsRaw || [];
    if (apps.length === 0) return reply.send({ data: [] });
    
    // Filter customers who have active applications
    const activeAppCustIds = new Set(apps.map(a => a.customer_id));
    customers = customers.filter(c => activeAppCustIds.has(c.id));
    
    // Fetch installments for these applications
    const appIds = apps.map(a => a.id);
    const { data: instRaw } = await sb.from('installments')
      .select('status, expected_amount, deducted_amount, arrears_amount, due_date, application_id')
      .in('application_id', appIds);
      
    const installments = instRaw || [];
    
    // Fetch recovery logs for these customers
    const { data: logsRaw } = await sb.from('recovery_logs')
      .select('contact_method, contacted_at, outcome, notes, customer_id')
      .in('customer_id', custIds);
      
    const logs = logsRaw || [];
    
    // Map data back to applications and customers
    const instMap: Record<string, any[]> = {};
    installments.forEach((i: any) => { instMap[i.application_id] = instMap[i.application_id] || []; instMap[i.application_id].push(i); });
    
    const appMap: Record<string, any[]> = {};
    apps.forEach((a: any) => { 
      a.installments = instMap[a.id] || [];
      appMap[a.customer_id] = appMap[a.customer_id] || [];
      appMap[a.customer_id].push(a); 
    });
    
    const logMap: Record<string, any[]> = {};
    logs.forEach((l: any) => { logMap[l.customer_id] = logMap[l.customer_id] || []; logMap[l.customer_id].push(l); });

    customers.forEach(c => {
      c.applications = appMap[c.id] || [];
      c.recovery_logs = logMap[c.id] || [];
    });

    // Manually fetch camps
    const campIds = [...new Set((customers || []).map(c => c.camp_id).filter(Boolean))];
    const campsRes = campIds.length > 0 ? await sb.from('camps').select('id, name, branch').in('id', campIds) : { data: [] };
    const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, { name: c.name, branch: c.branch }]));
    customers.forEach((c: any) => { c.camp = campMap[c.camp_id] || null; });

    // Fetch accepted guarantor requests for these applications
    const guarantorAppIds = customers.map((c: any) => c.applications?.[0]?.id).filter(Boolean);
    let reqMap = new Map<string, any>();
    if (guarantorAppIds.length > 0) {
      const { data: reqRows } = await sb
        .from('guarantor_requests')
        .select('application_id, guarantor_name, guarantor_phone, guarantor_customer_id')
        .in('application_id', guarantorAppIds)
        .eq('status', 'accepted');

      // Manually get guarantor customer service numbers
      const gCustIds = [...new Set((reqRows || []).map((r: any) => r.guarantor_customer_id).filter(Boolean))];
      const gCustRes = gCustIds.length > 0 ? await sb.from('customers').select('id, service_number').in('id', gCustIds) : { data: [] };
      const gCustMap = Object.fromEntries((gCustRes.data || []).map(c => [c.id, c]));

      (reqRows ?? []).forEach((r: any) => {
        r.guarantor_customer = gCustMap[r.guarantor_customer_id] || null;
        if (!reqMap.has(r.application_id)) {
          reqMap.set(r.application_id, r);
        }
      });
    }

    const result = (customers ?? []).map((c: any) => {
      const app = c.applications?.[0];
      const installments = app?.installments ?? [];
      const arrears = installments.reduce((s: number, inst: any) => s + Number(inst.arrears_amount ?? 0), 0);
      const missed = installments.filter((inst: any) => inst.status === 'not_deducted' || inst.status === 'arrears').length;

      if (missed < minMissed) return null;

      // Guarantor data comes from guarantor_requests
      const reqRow = app ? reqMap.get(app.id) : null;
      const guarantor = reqRow ? {
        name: reqRow.guarantor_name ?? '—',
        phone: reqRow.guarantor_phone ?? '—',
        service_number: reqRow.guarantor_customer?.service_number ?? '—',
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

  // ── POST /recovery/transfer-guarantor ── (creates a pending approval request)
  app.post('/transfer-guarantor', { preHandler:[authenticate,requireRole('admin','super_admin','recovery_officer','finance_officer')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      reason: z.string().min(10),
      draft_letter: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({error:'Validation Error', details: body.error.flatten()});
    const sb = getSupabase();

    // Fetch customer + active application + accepted guarantor request
    const { data: customer } = await sb.from('customers')
      .select('id, full_name, service_number, phone_number, rank, branch, camp:camps(name)')
      .eq('id', body.data.customer_id).single();

    const { data: activeApp } = await sb.from('applications')
      .select('id, ref_number, monthly_amount, arrears_amount:installments(arrears_amount)')
      .eq('customer_id', body.data.customer_id)
      .eq('status', 'active').maybeSingle();

    let guarantorCustomerId: string | null = null;
    let guarantorName = 'Unknown';
    if (activeApp) {
      const { data: gr } = await sb.from('guarantor_requests')
        .select('guarantor_customer_id, guarantor_name')
        .eq('application_id', activeApp.id).eq('status', 'accepted').maybeSingle();
      if (gr) {
        guarantorCustomerId = gr.guarantor_customer_id;
        if (gr.guarantor_customer_id) {
          const { data: gCust } = await sb.from('customers').select('full_name, service_number').eq('id', gr.guarantor_customer_id).single();
          guarantorName = gCust?.full_name ?? gr.guarantor_name ?? 'Unknown';
        } else {
          guarantorName = gr.guarantor_name ?? 'Unknown';
        }
      }
    }

    // Build a professional draft letter if none provided
    const today = new Date().toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' });
    const letterContent = body.data.draft_letter || `AIRVOICE DEFENCE FINANCE
GUARANTOR LIABILITY TRANSFER NOTICE
Date: ${today}

To: ${guarantorName}
Re: Guarantor Liability Transfer — Customer: ${customer?.full_name ?? ''} (${customer?.service_number ?? ''})

Dear ${guarantorName},

This letter is to formally notify you that we are initiating a liability transfer request from the primary account holder to you as their registered guarantor with AIRVOICE Defence Finance.

Primary Customer: ${customer?.full_name ?? ''}
Service Number: ${customer?.service_number ?? ''}
Camp: ${(customer?.camp as any)?.name ?? '—'}
Application Ref: ${activeApp?.ref_number ?? '—'}

Reason for Transfer:
${body.data.reason}

This transfer request is pending approval from an authorised AIRVOICE Finance Administrator. Once approved, your salary deductions will be updated accordingly.

For queries, please contact our Recovery Department.

Sincerely,
AIRVOICE Defence Finance Recovery Department`;

    // Store the transfer request as a recovery_letter with draft status
    // We embed transfer metadata as a JSON prefix in letter_body so we can filter/parse later
    const metaPrefix = JSON.stringify({
      __transfer: true,
      customer_id: body.data.customer_id,
      guarantor_customer_id: guarantorCustomerId,
      guarantor_name: guarantorName,
      application_id: activeApp?.id ?? null,
      reason: body.data.reason,
      requested_by: req.user!.id,
    });
    const fullBody = `${metaPrefix}
---LETTER---
${letterContent}`;

    const { data: letter, error: letterErr } = await sb.from('recovery_letters').insert({
      customer_id: body.data.customer_id,
      application_id: activeApp?.id ?? null,
      letter_type: 'final_notice',
      letter_body: fullBody,
      status: 'draft',
    }).select().single();

    if (letterErr) return reply.status(500).send({ error: letterErr.message });

    // Write audit log
    await sb.from('audit_logs').insert({
      user_id: req.user!.id,
      action: 'GUARANTOR_TRANSFER_REQUESTED',
      entity_type: 'customers',
      entity_id: body.data.customer_id,
      new_values: { reason: body.data.reason, letter_id: letter.id, guarantor_customer_id: guarantorCustomerId },
    } as any);

    return reply.send({
      success: true,
      letter_id: letter.id,
      message: 'Transfer request submitted and is pending admin/super-admin approval.',
      draft_letter: letterContent,
      guarantor_name: guarantorName,
    });
  });

  // ── GET /recovery/transfer-requests ── List pending transfer approval requests
  app.get('/transfer-requests', { preHandler:[authenticate,requireRole('admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const sb = getSupabase();
    const { data: rawLetters, error } = await sb.from('recovery_letters')
      .select('id, customer_id, application_id, letter_body, created_at')
      .eq('letter_type', 'final_notice')
      .eq('status', 'draft')
      .like('letter_body', '%"__transfer":true%')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });

    const custIds = [...new Set((rawLetters || []).map(r => r.customer_id).filter(Boolean))];
    const appIds2 = [...new Set((rawLetters || []).map(r => r.application_id).filter(Boolean))];
    const [custRes, appRes] = await Promise.all([
      custIds.length > 0 ? sb.from('customers').select('id, full_name, service_number, phone_number, rank, camp_id').in('id', custIds) : Promise.resolve({ data: [] }),
      appIds2.length > 0 ? sb.from('applications').select('id, ref_number, monthly_amount').in('id', appIds2) : Promise.resolve({ data: [] }),
    ]);
    const lCampIds = [...new Set((custRes.data || []).map(c => c.camp_id).filter(Boolean))];
    const lCampsRes = lCampIds.length > 0 ? await sb.from('camps').select('id, name').in('id', lCampIds) : { data: [] };
    const lCampMap = Object.fromEntries((lCampsRes.data || []).map(c => [c.id, { name: c.name }]));
    const custMap2 = Object.fromEntries((custRes.data || []).map(c => [c.id, { ...c, camp: lCampMap[c.camp_id] || null }]));
    const appMap2 = Object.fromEntries((appRes.data || []).map(a => [a.id, a]));

    const data = (rawLetters || []).map((row: any) => ({
      ...row,
      customer: custMap2[row.customer_id] || null,
      application: appMap2[row.application_id] || null,
    }));

    const parsed = (data ?? []).map((row: any) => {
      try {
        const metaStr = row.letter_body.split('\n---LETTER---\n')[0];
        const letterText = row.letter_body.split('\n---LETTER---\n')[1] ?? '';
        const meta = JSON.parse(metaStr);
        return { ...row, meta, letter_text: letterText };
      } catch {
        return { ...row, meta: {}, letter_text: row.letter_body };
      }
    });

    return reply.send({ data: parsed });
  });

  // ── POST /recovery/transfer-requests/:id/approve ── Admin approves a pending transfer
  app.post('/transfer-requests/:id/approve', { preHandler:[authenticate,requireRole('admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    const { data: letter, error: fetchErr } = await sb.from('recovery_letters')
      .select('id, letter_body, customer_id, application_id, status').eq('id', id).single();

    if (fetchErr || !letter) return reply.status(404).send({ error: 'Transfer request not found' });
    if (letter.status !== 'draft') return reply.status(400).send({ error: 'This transfer has already been processed' });

    let meta: any = {};
    try {
      const metaStr = letter.letter_body.split('\n---LETTER---\n')[0];
      meta = JSON.parse(metaStr);
    } catch {
      return reply.status(400).send({ error: 'Invalid transfer request format' });
    }

    const { guarantor_customer_id, application_id } = meta;

    if (guarantor_customer_id && application_id) {
      // 1. Transfer unpaid installments to the guarantor
      await sb.from('installments')
        .update({ customer_id: guarantor_customer_id } as any)
        .eq('application_id', application_id)
        .in('status', ['pending', 'not_deducted', 'arrears']);

      // 2. Add recovery log
      await sb.from('recovery_logs').insert({
        application_id: application_id,
        customer_id: letter.customer_id,
        officer_id: req.user!.id,
        contact_method: 'letter',
        contacted_at: new Date().toISOString(),
        outcome: 'transferred_to_guarantor',
        notes: `Liability officially transferred to guarantor (approved by admin). Reason: ${meta.reason ?? ''}`
      } as any);
    }

    // Mark the letter as sent (approved)
    await sb.from('recovery_letters').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by: req.user!.id,
    }).eq('id', id);

    await sb.from('audit_logs').insert({
      user_id: req.user!.id,
      action: 'GUARANTOR_TRANSFER_APPROVED',
      entity_type: 'customers',
      entity_id: letter.customer_id,
      new_values: { letter_id: id, approved_by: req.user!.id, guarantor_customer_id },
    } as any);

    return reply.send({ success: true, message: 'Transfer approved and installments transferred to guarantor.' });
  });

  // ── POST /recovery/transfer-requests/:id/reject ── Admin rejects a pending transfer
  app.post('/transfer-requests/:id/reject', { preHandler:[authenticate,requireRole('admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    await sb.from('recovery_letters').update({ status: 'cancelled' }).eq('id', id);
    return reply.send({ success: true, message: 'Transfer request rejected.' });
  });

  // ── POST /recovery/legal-notice ──
  app.post('/legal-notice', { preHandler:[authenticate,requireRole('recovery_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      notes: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const sb = getSupabase();

    // Fetch customer for the letter (manual join for camp)
    const { data: custRaw } = await sb.from('customers')
      .select('full_name, service_number, rank, branch, camp_id')
      .eq('id', body.data.customer_id).single();
    let cust: any = custRaw;
    if (cust?.camp_id) {
      const { data: campData } = await sb.from('camps').select('name').eq('id', cust.camp_id).single();
      cust = { ...cust, camp: campData };
    }

    const { data: activeApp } = await sb.from('applications').select('id, ref_number')
      .eq('customer_id', body.data.customer_id).eq('status', 'active').maybeSingle();

    const today = new Date().toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' });
    const letterBody = `AIRVOICE DEFENCE FINANCE
LEGAL NOTICE OF DEFAULT
Date: ${today}

To: ${cust?.full_name ?? 'Unknown'}
Rank: ${cust?.rank ?? ''} | Service No: ${cust?.service_number ?? ''}
Camp: ${(cust?.camp as any)?.name ?? '—'} | Branch: ${cust?.branch ?? ''}
Application Ref: ${activeApp?.ref_number ?? '—'}

Dear ${cust?.full_name ?? 'Sir/Madam'},

Despite previous notices and communications, your AIRVOICE Defence Finance account remains in arrears. This letter constitutes a formal LEGAL NOTICE that if the outstanding balance is not cleared within 14 days of the date above, AIRVOICE Defence Finance reserves the right to take legal action and notify your commanding officer.

${body.data.notes ? `Additional Notes:\n${body.data.notes}\n\n` : ''}Sincerely,
AIRVOICE Defence Finance Legal Department`;

    // Create legal notice letter
    const { data: letter, error: letterErr } = await sb.from('recovery_letters').insert({
      customer_id: body.data.customer_id,
      application_id: activeApp?.id ?? null,
      letter_type: 'legal_notice',
      letter_body: letterBody,
      status: 'draft',
    }).select().single();

    // Write audit log
    await sb.from('audit_logs').insert({
      user_id: req.user!.id,
      action: 'LEGAL_NOTICE_SENT',
      entity_type: 'customers',
      entity_id: body.data.customer_id,
      new_values: { issued_by: req.user!.id, issued_at: new Date().toISOString(), letter_id: letter?.id },
    } as any);

    return reply.send({
      success: true,
      message: 'Legal notice drafted',
      letter_id: letter?.id,
      letter_body: letterBody,
    });
  });

  // ── GET /recovery/letters ── List recovery letters
  app.get('/letters', { preHandler:[authenticate,requireRole('recovery_officer','finance_officer','admin','super_admin')] }, async (req:FastifyRequest, reply) => {
    const q = req.query as { customer_id?: string; status?: string; page?: string };
    const page = parseInt(q.page ?? '1');
    const limit = 30;
    const sb = getSupabase();

    let query = sb
      .from('recovery_letters')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (q.customer_id) query = query.eq('customer_id', q.customer_id);
    if (q.status) query = query.eq('status', q.status);

    const { data: rawData, count, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    const rows = rawData || [];
    if (rows.length > 0) {
      const custIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];
      const appIds = [...new Set(rows.map((r: any) => r.application_id).filter(Boolean))];
      const userIds = [...new Set(rows.map((r: any) => r.sent_by).filter(Boolean))];

      const [custRes, appRes, userRes] = await Promise.all([
        custIds.length > 0 ? sb.from('customers').select('id, full_name, service_number, phone_number').in('id', custIds) : Promise.resolve({ data: [] }),
        appIds.length > 0 ? sb.from('applications').select('id, ref_number').in('id', appIds) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? sb.from('users').select('id, phone_number').in('id', userIds) : Promise.resolve({ data: [] }),
      ]);

      const custMap = Object.fromEntries((custRes.data || []).map(c => [c.id, c]));
      const appMap = Object.fromEntries((appRes.data || []).map(a => [a.id, a]));
      const userMap = Object.fromEntries((userRes.data || []).map(u => [u.id, u]));

      rows.forEach((r: any) => {
        r.customer = custMap[r.customer_id] || null;
        r.application = appMap[r.application_id] || null;
        r.sent_by_user = userMap[r.sent_by] || null;
      });
    }

    return reply.send({ data: rows, meta: { total: count, page, limit } });
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
      const { data: custRaw } = await sb
        .from('customers')
        .select('full_name, service_number, phone_number, rank, branch, camp_id')
        .eq('id', q.customer_id)
        .single();
      if (custRaw?.camp_id) {
        const { data: campData } = await sb.from('camps').select('name').eq('id', custRaw.camp_id).single();
        customerData = { ...custRaw, camp: campData };
      } else {
        customerData = custRaw;
      }
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

