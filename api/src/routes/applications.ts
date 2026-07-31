import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff, requireFinance, requireAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { checkPhoneEligibility, getActivePhoneCount } from '../services/customers';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';

const CreateApplicationSchema = z.object({
  customer_id: z.string().uuid(),
  phone_model_id: z.string().uuid(),
  sale_price: z.number().positive(),
  down_payment: z.number().min(0).default(0),
  term_months: z.number().int().min(1).max(60),
  guarantor_id: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

const ReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(1000).optional(),
  rejection_reason: z.string().max(500).optional(),
});

const HandoverSchema = z.object({
  phone_id: z.string().uuid(),
  handover_date: z.string().date(),
  notes: z.string().optional(),
});

export default async function applicationRoutes(app: FastifyInstance) {

  // ── List / queue ──────────────────────────────────────────
  app.get('/', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      status?: string; camp_id?: string; sales_officer_id?: string;
      page?: string; limit?: string; q?: string; branch?: string;
    };
    const supabase = getSupabase();
    const page = parseInt(query.page ?? '1');
    const limit = parseInt(query.limit ?? '20');
    const offset = (page - 1) * limit;
    const isSalesOfficer = request.user!.role === 'sales_officer';

    // We must query 'applications' directly and manually join related data because FKs and the pipeline view are missing
    let q = supabase
      .from('applications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (isSalesOfficer) {
      q = q.eq('sales_officer_id', request.user!.id);
      
      // Auto-migrate any lingering 'draft' applications to 'submitted' (fire-and-forget)
      supabase
        .from('applications')
        .update({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: request.user!.id })
        .eq('sales_officer_id', request.user!.id)
        .eq('status', 'draft')
        .is('deleted_at', null)
        .then(() => {}); // intentional fire-and-forget
    } else {
      // Admin/Staff filters
      if (query.camp_id) {
        // Since camp_id is on customer, we must pre-fetch customers in that camp
        const { data: cData } = await supabase.from('customers').select('id').eq('camp_id', query.camp_id);
        const cIds = (cData || []).map(c => c.id);
        if (cIds.length === 0) return reply.send({ data: [], meta: { total: 0 } });
        q = q.in('customer_id', cIds);
      }
      if (query.sales_officer_id) q = q.eq('sales_officer_id', query.sales_officer_id);
      
      // Camp officers see only their camp
      if (request.user!.role === 'camp_officer') {
        const { data: assignments } = await supabase
          .from('camp_officer_assignments')
          .select('camp_id')
          .eq('user_id', request.user!.id)
          .eq('is_active', true);
        const campIds = (assignments ?? []).map((a: { camp_id: string }) => a.camp_id);
        if (campIds.length === 0) return reply.send({ data: [], meta: { total: 0 } });
        
        const { data: cData } = await supabase.from('customers').select('id').in('camp_id', campIds);
        const cIds = (cData || []).map(c => c.id);
        if (cIds.length === 0) return reply.send({ data: [], meta: { total: 0 } });
        q = q.in('customer_id', cIds);
      }
    }

    if (query.status) q = q.eq('status', query.status);
    if (query.q) q = q.or(`ref_number.ilike.%${query.q}%`);

    const { data: rawData, error, count } = await q;
    if (error) return reply.status(500).send({ error: error.message });

    const apps = rawData || [];
    let normalized: any[] = [];
    
    if (apps.length > 0) {
      const custIds = [...new Set(apps.map((a: any) => a.customer_id).filter(Boolean))];
      const modelIds = [...new Set(apps.map((a: any) => a.phone_model_id).filter(Boolean))];
      
      const [custRes, modelsRes] = await Promise.all([
        custIds.length > 0 ? supabase.from('customers').select('*').in('id', custIds) : Promise.resolve({ data: [] }),
        modelIds.length > 0 ? supabase.from('phone_models').select('*').in('id', modelIds) : Promise.resolve({ data: [] })
      ]);
      
      const customers = custRes.data || [];
      const campIds = [...new Set(customers.map((c: any) => c.camp_id).filter(Boolean))];
      const campsRes = campIds.length > 0 ? await supabase.from('camps').select('id, name').in('id', campIds) : { data: [] };
      
      const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c.name]));
      const custMap = Object.fromEntries(customers.map(c => [c.id, { ...c, camp_name: campMap[c.camp_id] }]));
      const modelMap = Object.fromEntries((modelsRes.data || []).map(m => [m.id, m]));
      
      normalized = apps.map((a: any) => {
        const c = custMap[a.customer_id];
        const m = modelMap[a.phone_model_id];
        
        // If searching by customer name/NIC and it doesn't match, we should theoretically filter it, 
        // but for now we just return the matches since we can't do joined ILIKE easily.
        return {
          ...a,
          status: a.status === 'draft' ? 'submitted' : a.status,
          customer_name: c?.full_name,
          customer_nic: c?.nic_number,
          service_number: c?.service_number,
          customer_branch: c?.branch,
          risk_score: c?.risk_score,
          retirement_date: c?.retirement_date,
          camp_name: c?.camp_name,
          camp_id: c?.camp_id,
          phone_brand: m?.brand,
          phone_model: m?.model,
          sales_officer_name: null,
          retirement_flag: null,
        };
      });
      
      // Post-filter for query.q if it didn't match ref_number but might match customer name/svc number
      if (query.q && !isSalesOfficer) {
        const term = query.q.toLowerCase();
        normalized = normalized.filter(a => 
          (a.ref_number || '').toLowerCase().includes(term) ||
          (a.customer_name || '').toLowerCase().includes(term) ||
          (a.service_number || '').toLowerCase().includes(term)
        );
      }
    }

    return reply.send({
      data: normalized,
      meta: { total: count ?? 0, page, limit, pages: Math.ceil((count ?? 0) / limit) },
    });
  });


  // ── Get single application ────────────────────────────────
  app.get('/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();

    // Fetch base application
    const { data: appData, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      request.log.error(error);
      return reply.status(404).send({ error: 'Application not found', details: error.message });
    }

    // Manually fetch related entities (FK constraints missing in DB)
    const [customerRes, phoneModelRes, phoneRes, guarantorRes, commissionRes] = await Promise.all([
      appData.customer_id
        ? supabase.from('customers').select('id, full_name, nic_number, service_number, branch, rank, retirement_date, risk_level, risk_score, camp_id').eq('id', appData.customer_id).single()
        : Promise.resolve({ data: null }),
      appData.phone_model_id
        ? supabase.from('phone_models').select('id, brand, model, storage, sale_price').eq('id', appData.phone_model_id).single()
        : Promise.resolve({ data: null }),
      appData.phone_id
        ? supabase.from('phones').select('id, imei_1, imei_2, status').eq('id', appData.phone_id).single()
        : Promise.resolve({ data: null }),
      appData.guarantor_id
        ? supabase.from('guarantors').select('id, full_name, monthly_salary, total_liability, affordability_ok').eq('id', appData.guarantor_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('commissions').select('id, status, amount').eq('application_id', id).limit(1).single()
        .then(r => r).catch(() => ({ data: null })),
    ]);

    // Fetch camp for customer
    let campData = null;
    const customer = customerRes.data as any;
    if (customer?.camp_id) {
      const { data: cd } = await supabase.from('camps').select('id, name').eq('id', customer.camp_id).single();
      campData = cd;
    }

    const data = {
      ...appData,
      customer: customer ? { ...customer, camp: campData } : null,
      phone_model: phoneModelRes.data || null,
      phone: phoneRes.data || null,
      guarantor: guarantorRes.data || null,
      commission: commissionRes.data || null,
      sales_officer: null,
    };

    return reply.send({ data });
  });

  // ── Create application ─────────────────────────────────────
  app.post('/', {
    preHandler: [authenticate, requireRole('sales_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = CreateApplicationSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    // Phone eligibility check — guarantor unlocks higher limit (2→4)
    const hasGuarantor = !!body.data.guarantor_id;
    const eligibility = await checkPhoneEligibility(body.data.customer_id, hasGuarantor);
    if (!eligibility.eligible && !eligibility.requires_special_approval) {
      return reply.status(422).send({
        error: 'Application Blocked',
        message: eligibility.reason,
        rule: eligibility.rule_applied,
      });
    }

    const supabase = getSupabase();

    // Get customer retirement date for plan check
    const { data: customer } = await supabase
      .from('customers')
      .select('retirement_date')
      .eq('id', body.data.customer_id)
      .single();

    // Calculate financials
    const financed = body.data.sale_price - body.data.down_payment;
    const monthly = Math.ceil(financed / body.data.term_months);
    const saleDate = new Date();
    const planEnd = new Date(saleDate);
    planEnd.setMonth(planEnd.getMonth() + body.data.term_months);

    // Retirement check
    const retirementDate = customer?.retirement_date ? new Date(customer.retirement_date) : null;
    const retirementRisk = retirementDate && planEnd >= retirementDate;

    const { data: app, error } = await supabase
      .from('applications')
      .insert({
        customer_id: body.data.customer_id,
        phone_model_id: body.data.phone_model_id,
        sales_officer_id: request.user!.id,
        guarantor_id: body.data.guarantor_id,
        sale_price: body.data.sale_price,
        down_payment: body.data.down_payment,
        financed_amount: financed,
        monthly_amount: monthly,
        term_months: body.data.term_months,
        sale_date: saleDate.toISOString().split('T')[0],
        plan_end_date: planEnd.toISOString().split('T')[0],
        retirement_date: customer?.retirement_date,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: request.user!.id,
        requires_special_approval: eligibility.requires_special_approval ?? false,
        notes: body.data.notes,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Create commission record
    await supabase.from('commissions').insert({
      application_id: app.id,
      sales_officer_id: request.user!.id,
      customer_id: body.data.customer_id,
      amount: 250,
      status: 'pending',
    });

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.APPLICATION_CREATED,
      entity_type: 'applications',
      entity_id: app.id,
      new_values: body.data,
      metadata: {
        ref_number: app.ref_number,
        retirement_risk: retirementRisk,
        requires_special_approval: eligibility.requires_special_approval,
      },
    });

    notify({
      kind: 'application_submitted',
      ref: app.ref_number,
      appId: app.id,
      customerId: app.customer_id,
      salesOfficerId: request.user!.id
    });

    return reply.status(201).send({ data: app, retirement_risk: retirementRisk });
  });

  // ── Submit application (draft → submitted) ────────────────
  app.post('/:id/submit', {
    preHandler: [authenticate, requireRole('sales_officer', 'customer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { data: appRow } = await getSupabase().from('applications').select('ref_number,customer_id,sales_officer_id').eq('id', id).single();
    const result = await advanceStage(request, reply, 'draft', 'submitted', AuditActions.APPLICATION_SUBMITTED, {
      submitted_at: new Date().toISOString(),
      submitted_by: request.user!.id,
    });
    if (appRow) notify({ kind: 'application_submitted', ref: appRow.ref_number, appId: id, customerId: appRow.customer_id, salesOfficerId: appRow.sales_officer_id });
    return result;
  });

  // ── Sales review ──────────────────────────────────────────
  app.post('/:id/sales-review', {
    preHandler: [authenticate, requireRole('sales_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ReviewSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { id } = request.params as { id: string };
    const { data: appRow } = await getSupabase().from('applications').select('ref_number').eq('id', id).single();
    const ref = appRow?.ref_number ?? id;
    const nextStatus = body.data.action === 'approve' ? 'admin_review' : 'rejected';
    const result = await advanceStage(request, reply, 'submitted', nextStatus, AuditActions.APPLICATION_STAGE_ADVANCED, {
      sales_reviewed_at: new Date().toISOString(),
      sales_reviewed_by: request.user!.id,
      sales_note: body.data.note,
      ...(nextStatus === 'rejected' ? {
        rejected_at: new Date().toISOString(),
        rejected_by: request.user!.id,
        rejection_reason: body.data.rejection_reason,
        rejection_stage: 'sales_review',
      } : {}),
    });
    if (nextStatus === 'rejected') notify({ kind: 'application_rejected', ref, appId: id, reason: body.data.rejection_reason, triggeredBy: request.user!.id });
    else notify({ kind: 'application_pending_review', ref, appId: id, stage: 'admin_review' });
    return result;
  });

  // ── Camp officer review ───────────────────────────────────
  app.post('/:id/camp-review', {
    preHandler: [authenticate, requireRole('camp_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      action: z.enum(['approve', 'reject']),
      note: z.string().optional(),
      rejection_reason: z.string().optional(),
      retirement_risk_confirmed: z.boolean().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { id } = request.params as { id: string };
    const { data: appRow } = await getSupabase().from('applications').select('ref_number').eq('id', id).single();
    const ref = appRow?.ref_number ?? id;
    const nextStatus = body.data.action === 'approve' ? 'finance_review' : 'rejected';
    const result = await advanceStage(request, reply, 'camp_review', nextStatus, AuditActions.APPLICATION_STAGE_ADVANCED, {
      camp_reviewed_at: new Date().toISOString(),
      camp_reviewed_by: request.user!.id,
      camp_note: body.data.note,
      retirement_risk_confirmed: body.data.retirement_risk_confirmed,
      ...(nextStatus === 'rejected' ? {
        rejected_at: new Date().toISOString(),
        rejected_by: request.user!.id,
        rejection_reason: body.data.rejection_reason,
        rejection_stage: 'camp_review',
      } : {}),
    });
    if (nextStatus === 'rejected') notify({ kind: 'application_rejected', ref, appId: id, reason: body.data.rejection_reason, triggeredBy: request.user!.id });
    else notify({ kind: 'application_pending_review', ref, appId: id, stage: 'finance_review' });
    return result;
  });

  // ── Finance review ────────────────────────────────────────
  app.post('/:id/finance-review', {
    preHandler: [authenticate, requireFinance],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ReviewSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { id } = request.params as { id: string };
    const { data: appRow } = await getSupabase().from('applications').select('ref_number').eq('id', id).single();
    const ref = appRow?.ref_number ?? id;
    const nextStatus = body.data.action === 'approve' ? 'admin_review' : 'rejected';
    const result = await advanceStage(request, reply, 'finance_review', nextStatus, AuditActions.APPLICATION_STAGE_ADVANCED, {
      finance_reviewed_at: new Date().toISOString(),
      finance_reviewed_by: request.user!.id,
      finance_note: body.data.note,
      ...(nextStatus === 'rejected' ? {
        rejected_at: new Date().toISOString(),
        rejected_by: request.user!.id,
        rejection_reason: body.data.rejection_reason,
        rejection_stage: 'finance_review',
      } : {}),
    });
    if (nextStatus === 'rejected') notify({ kind: 'application_rejected', ref, appId: id, reason: body.data.rejection_reason, triggeredBy: request.user!.id });
    else notify({ kind: 'application_pending_review', ref, appId: id, stage: 'admin_review' });
    return result;
  });

  // ── Admin final approval ──────────────────────────────────
  app.post('/:id/admin-approve', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = ReviewSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { id } = request.params as { id: string };
    const { data: appRow } = await getSupabase().from('applications').select('ref_number').eq('id', id).single();
    const ref = appRow?.ref_number ?? id;
    const nextStatus = body.data.action === 'approve' ? 'approved' : 'rejected';
    const result = await advanceStage(request, reply, 'admin_review', nextStatus, AuditActions.APPLICATION_APPROVED, {
      admin_approved_at: new Date().toISOString(),
      admin_approved_by: request.user!.id,
      admin_note: body.data.note,
      ...(nextStatus === 'rejected' ? {
        rejected_at: new Date().toISOString(),
        rejected_by: request.user!.id,
        rejection_reason: body.data.rejection_reason,
        rejection_stage: 'admin_review',
      } : {}),
    });
    if (nextStatus === 'approved') notify({ kind: 'application_approved', ref, appId: id, stage: 'admin_review', triggeredBy: request.user!.id });
    else notify({ kind: 'application_rejected', ref, appId: id, reason: body.data.rejection_reason, triggeredBy: request.user!.id });
    return result;
  });

  // ── Phone handover (approved → active) ───────────────────
  app.post('/:id/handover', {
    preHandler: [authenticate, requireRole('sales_officer', 'inventory_manager', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = HandoverSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const supabase = getSupabase();

    // Verify application is in approved state
    const { data: app } = await supabase
      .from('applications')
      .select('id, status, customer_id, term_months, monthly_amount, sale_date')
      .eq('id', id)
      .single();

    if (!app || app.status !== 'approved') {
      return reply.status(422).send({ error: 'Application must be in "approved" state for handover' });
    }

    // Assign phone to application
    await supabase
      .from('phones')
      .update({
        status: 'sold',
        application_id: id,
        customer_id: app.customer_id,
        sold_date: body.data.handover_date,
        allocated_by: request.user!.id,
        allocated_at: new Date().toISOString(),
      })
      .eq('id', body.data.phone_id);

    // Create installment schedule
    const installments = [];
    const saleDate = new Date(app.sale_date ?? new Date());
    for (let m = 1; m <= app.term_months; m++) {
      const due = new Date(saleDate);
      due.setMonth(due.getMonth() + m);
      installments.push({
        application_id: id,
        customer_id: app.customer_id,
        month_number: m,
        due_year: due.getFullYear(),
        due_month: due.getMonth() + 1,
        due_date: due.toISOString().split('T')[0],
        expected_amount: app.monthly_amount,
        status: 'pending',
      });
    }
    await supabase.from('installments').insert(installments);

    // Advance to active
    await supabase
      .from('applications')
      .update({
        status: 'active',
        phone_id: body.data.phone_id,
        handover_date: body.data.handover_date,
        handover_by: request.user!.id,
      })
      .eq('id', id);

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.PHONE_HANDOVER,
      entity_type: 'applications',
      entity_id: id,
      new_values: { phone_id: body.data.phone_id, handover_date: body.data.handover_date },
    });

    return reply.send({ success: true, installments_created: installments.length });
  });

  // ── Special approval for 3rd phone ───────────────────────
  app.post('/:id/special-approval', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      granted: z.boolean(),
      note: z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const supabase = getSupabase();
    await supabase.from('applications').update({
      special_approval_granted: body.data.granted,
      special_approval_by: request.user!.id,
      special_approval_at: new Date().toISOString(),
      admin_note: body.data.note,
    }).eq('id', id);

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.SPECIAL_APPROVAL_GRANTED,
      entity_type: 'applications',
      entity_id: id,
      new_values: { granted: body.data.granted },
    });

    return reply.send({ success: true, granted: body.data.granted });
  });

  // ── POST /applications/request-special-approval ───────────
  // Sales officer submits a request when customer is blocked (≥2 active plans)
  app.post('/request-special-approval', {
    preHandler: [authenticate, requireRole('sales_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      customer_id:    z.string().uuid(),
      phone_model_id: z.string().uuid(),
      term_months:    z.number().int().min(1).max(60),
      reason:         z.string().min(10, 'Please provide a detailed justification (min 10 chars)'),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const supabase = getSupabase();

    // Look up customer info for notification
    const { data: customer } = await supabase
      .from('customers')
      .select('full_name, service_number, nic_number')
      .eq('id', body.data.customer_id)
      .single();

    if (!customer) return reply.status(404).send({ error: 'Customer not found' });

    // Restrict special approval requests to customers with exactly 2 active plans
    const activeCount = await getActivePhoneCount(body.data.customer_id);
    if (activeCount !== 2) {
      return reply.status(400).send({
        error: 'Eligibility Error',
        message: `Only customers with exactly 2 active plans/applications are eligible for special approval. This customer currently has ${activeCount} active plan(s).`
      });
    }

    // Look up requesting officer's name/phone
    const { data: officer } = await supabase
      .from('users')
      .select('phone_number, full_name')
      .eq('id', request.user!.id)
      .single();

    // Insert special approval request record
    const { data: sarRecord, error } = await supabase
      .from('special_approval_requests')
      .insert({
        customer_id:     body.data.customer_id,
        phone_model_id:  body.data.phone_model_id,
        term_months:     body.data.term_months,
        requested_by:    request.user!.id,
        reason:          body.data.reason,
        status:          'pending',
      })
      .select()
      .single();

    if (error) {
      // Table might not exist yet — return a graceful error
      console.error('[special-approval-request] DB error:', error.message);
      return reply.status(500).send({ error: 'Failed to save request. Please ensure the special_approval_requests table exists.' });
    }

    const salesOfficerName = officer?.full_name || officer?.phone_number || 'A Sales Officer';

    // Notify all admins + super_admins via SSE + DB
    notify({
      kind: 'special_approval_request',
      customerName: customer.full_name,
      requestId: sarRecord.id,
      salesOfficerName,
      reason: body.data.reason,
    }).catch(() => {});

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.SPECIAL_APPROVAL_GRANTED,
      entity_type: 'special_approval_requests',
      entity_id: sarRecord.id,
      new_values: { customer_id: body.data.customer_id, reason: body.data.reason },
    });

    return reply.status(201).send({
      success: true,
      message: 'Special approval request submitted. Admins have been notified.',
      data: sarRecord,
    });
  });

  // ── GET /applications/special-approval-requests ───────────
  // Admin and Sales Officer view special approval requests
  app.get('/special-approval-requests', {
    preHandler: [authenticate, requireRole('sales_officer', 'admin', 'super_admin')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { status?: string };
    const supabase = getSupabase();
    let query = supabase
      .from('special_approval_requests')
      .select(`
        *,
        customer:customers(id, full_name, service_number, nic_number, rank),
        phone_model:phone_models(id, brand, model, sale_price),
        requested_by_user:users!requested_by(id, phone_number),
        application:applications(id, ref_number, status)
      `)
      .order('created_at', { ascending: false });

    if (q.status) query = query.eq('status', q.status);
    if (request.user!.role === 'sales_officer') {
      query = query.eq('requested_by', request.user!.id);
    }
    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── POST /applications/special-approval-requests/:id/review ──
  // Admin approves or rejects the request → creates application if approved
  app.post('/special-approval-requests/:id/review', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      action: z.enum(['approve', 'reject']),
      note:   z.string().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const supabase = getSupabase();
    const { data: sar } = await supabase
      .from('special_approval_requests')
      .select('*, customer:customers(full_name), requested_by')
      .eq('id', id)
      .single();

    if (!sar || sar.status !== 'pending') {
      return reply.status(404).send({ error: 'Request not found or already resolved' });
    }

    const granted = body.data.action === 'approve';

    let applicationId: string | null = null;

    if (granted) {
      const { data: phoneModel } = await supabase
        .from('phone_models')
        .select('sale_price')
        .eq('id', sar.phone_model_id)
        .single();

      const salePrice = Number(phoneModel?.sale_price ?? 0);
      const financedAmount = salePrice;
      const monthlyAmount = Math.ceil(financedAmount / sar.term_months);
      const saleDate = new Date();
      const planEndDate = new Date(saleDate);
      planEndDate.setMonth(planEndDate.getMonth() + sar.term_months);

      const { data: createdApplication, error: createAppError } = await supabase
        .from('applications')
        .insert({
          customer_id: sar.customer_id,
          phone_model_id: sar.phone_model_id,
          sales_officer_id: sar.requested_by,
          sale_price: salePrice,
          down_payment: 0,
          financed_amount: financedAmount,
          monthly_amount: monthlyAmount,
          term_months: sar.term_months,
          sale_date: saleDate.toISOString().split('T')[0],
          plan_end_date: planEndDate.toISOString().split('T')[0],
          status: 'draft',
          requires_special_approval: true,
          notes: `Special approval request approved. Reason: ${sar.reason}`,
          special_approval_granted: true,
          special_approval_by: request.user!.id,
          special_approval_at: new Date().toISOString(),
          admin_note: body.data.note,
        })
        .select('id')
        .single();

      if (createAppError || !createdApplication) {
        return reply.status(500).send({ error: 'Failed to create the application from the approved request.' });
      }

      applicationId = createdApplication.id;

      await supabase.from('commissions').insert({
        application_id: createdApplication.id,
        sales_officer_id: sar.requested_by,
        customer_id: sar.customer_id,
        amount: 250,
        status: 'pending',
      });
    }

    await supabase.from('special_approval_requests').update({
      status: granted ? 'approved' : 'rejected',
      reviewed_by: request.user!.id,
      reviewed_at: new Date().toISOString(),
      review_note: body.data.note,
      application_id: applicationId,
    }).eq('id', id);

    // Notify the requesting sales officer back (direct user notification)
    notify({
      kind: 'special_approval_resolved',
      customerName: sar.customer?.full_name ?? 'Customer',
      requestId: id,
      granted,
      salesOfficerId: sar.requested_by,
    }, sar.requested_by).catch(() => {});

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.SPECIAL_APPROVAL_GRANTED,
      entity_type: 'special_approval_requests',
      entity_id: id,
      new_values: { action: body.data.action, note: body.data.note, application_id: applicationId },
    });

    return reply.send({
      success: true,
      granted,
      application_id: applicationId,
      message: granted
        ? 'Request approved. An application has been created for the sales officer.'
        : 'Request rejected. The sales officer has been notified.',
    });
  });

  // ── PATCH /:id — edit application (admin only, early stages) ─
  app.patch('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      phone_model_id: z.string().uuid().optional(),
      guarantor_id:   z.string().uuid().optional().nullable(),
      down_payment:   z.number().min(0).optional(),
      term_months:    z.number().int().min(1).max(60).optional(),
      camp_id:        z.string().uuid().optional().nullable(),
      notes:          z.string().max(2000).optional().nullable(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const supabase = getSupabase();
    const { data: existing } = await supabase.from('applications').select('status,sale_price,term_months').eq('id', id).single();
    if (!existing) return reply.status(404).send({ error: 'Application not found' });

    const EDITABLE_STATUSES = ['draft', 'submitted', 'sales_review'];
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      return reply.status(422).send({
        error: 'Cannot edit application',
        message: `Applications in status '${existing.status}' cannot be edited. Only draft, submitted, or sales_review applications may be changed.`,
      });
    }

    // Recalculate monthly amount if term changes
    const updates: Record<string, unknown> = { ...body.data };
    if (body.data.term_months && existing.sale_price) {
      updates.monthly_amount = Math.ceil(existing.sale_price / body.data.term_months);
    }

    const { data, error } = await supabase.from('applications')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) return reply.status(500).send({ error: error.message });

    writeAuditLog({
      user_id: request.user!.id, action: AuditActions.APPLICATION_UPDATED,
      entity_type: 'applications', entity_id: id, new_values: body.data,
    });
    return reply.send({ data });
  });

  // ── DELETE /:id — soft-delete application ─────────────────
  app.delete('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();
    const { data: existing } = await supabase.from('applications').select('status').eq('id', id).single();
    if (!existing) return reply.status(404).send({ error: 'Application not found' });

    const DELETABLE = ['draft', 'rejected', 'cancelled'];
    if (!DELETABLE.includes(existing.status)) {
      return reply.status(422).send({
        error: 'Cannot delete active application',
        message: `Only draft, rejected, or cancelled applications may be deleted. Current status: ${existing.status}`,
      });
    }

    await supabase.from('applications').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    writeAuditLog({
      user_id: request.user!.id, action: AuditActions.APPLICATION_CANCELLED,
      entity_type: 'applications', entity_id: id, new_values: { deleted: true },
    });
    return reply.send({ success: true });
  });
}

// ── Shared stage-advance helper ───────────────────────────
async function advanceStage(
  request: FastifyRequest,
  reply: FastifyReply,
  fromStatus: string,
  toStatus: string,
  auditAction: string,
  updates: Record<string, unknown>
) {
  const { id } = request.params as { id: string };
  const supabase = getSupabase();

  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, ref_number, customer_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !app) {
    return reply.status(404).send({ error: 'Application not found' });
  }

  if (app.status !== fromStatus) {
    return reply.status(422).send({
      error: 'Invalid State',
      message: `Application must be in "${fromStatus}" status. Current: "${app.status}"`,
    });
  }

  const { data: updated, error } = await supabase
    .from('applications')
    .update({ status: toStatus, ...updates })
    .eq('id', id)
    .select()
    .single();

  if (error) return reply.status(500).send({ error: error.message });

  writeAuditLog({
    user_id: request.user!.id,
    action: auditAction,
    entity_type: 'applications',
    entity_id: id,
    old_values: { status: fromStatus },
    new_values: { status: toStatus, ...updates },
    metadata: { ref_number: app.ref_number },
  });

  return reply.send({ data: updated });
}
