import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

export default async function salesRoutes(app: FastifyInstance) {

  // ── GET /sales/performance ── Officer performance summary
  app.get('/performance', {
    preHandler: [authenticate, requireRole('sales_officer', 'admin', 'super_admin', 'finance_officer')],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { month?: string; officer_id?: string };
    const sb = getSupabase();

    const now = new Date();
    const month = q.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${month}-01`;
    const monthEnd = new Date(
      parseInt(month.split('-')[0]),
      parseInt(month.split('-')[1]),
      0
    ).toISOString().split('T')[0];

    // Commissions for the period
    let commQuery = sb.from('commissions')
      .select('*,application:applications(ref_number,phone_model_id,monthly_amount),officer:users!sales_officer_id(phone_number)')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd + 'T23:59:59Z');

    if (req.user!.role === 'sales_officer') {
      commQuery = commQuery.eq('sales_officer_id', req.user!.id);
    } else if (q.officer_id) {
      commQuery = commQuery.eq('sales_officer_id', q.officer_id);
    }

    const { data: commissions } = await commQuery;

    // Aggregate by officer
    const officerMap: Record<string, {
      officer_id: string;
      officer_phone: string;
      phones_sold: number;
      commission_pending: number;
      commission_payable: number;
      commission_paid: number;
    }> = {};

    (commissions ?? []).forEach((c: Record<string, unknown>) => {
      const oid = c.sales_officer_id as string;
      const officer = c.officer as Record<string, unknown> | null;
      if (!officerMap[oid]) {
        officerMap[oid] = {
          officer_id: oid,
          officer_phone: officer?.phone_number as string ?? '—',
          phones_sold: 0,
          commission_pending: 0,
          commission_payable: 0,
          commission_paid: 0,
        };
      }
      officerMap[oid].phones_sold++;
      const status = c.status as string;
      const amt = Number(c.amount ?? 0);
      if (status === 'pending') officerMap[oid].commission_pending += amt;
      else if (status === 'payable') officerMap[oid].commission_payable += amt;
      else if (status === 'paid') officerMap[oid].commission_paid += amt;
    });

    return reply.send({
      data: Object.values(officerMap),
      commissions: commissions ?? [],
      month,
    });
  });

  // ── GET /sales/free-phone-requests ── List free phone requests
  app.get('/free-phone-requests', {
    preHandler: [authenticate, requireRole('sales_officer', 'camp_officer', 'admin', 'super_admin')],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { status?: string; page?: string };
    const page = parseInt(q.page ?? '1'), limit = 30;
    const supabase = getSupabase();
    let query = supabase
      .from('free_phone_requests')
      .select('*,camp:camps(name,branch)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (q.status) query = query.eq('status', q.status);
    if (req.user!.role === 'sales_officer') {
      query = query.eq('requested_by', req.user!.id);
    }
    const { data, count } = await query;
    return reply.send({ data, meta: { total: count, page, limit } });
  });

  // ── POST /sales/free-phone-requests ── Submit a free phone request
  app.post('/free-phone-requests', {
    preHandler: [authenticate, requireRole('sales_officer', 'camp_officer', 'admin', 'super_admin')],
  }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      camp_id: z.string().uuid().optional(),
      officer_name: z.string().min(2),
      officer_service: z.string().optional(),
      officer_rank: z.string().optional(),
      phone_model: z.string().min(1),
      reason: z.string().min(5),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    const { data, error } = await getSupabase().from('free_phone_requests').insert({
      ...body.data,
      requested_by: req.user!.id,
      status: 'pending',
    }).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.FREE_PHONE_REQUESTED, entity_type: 'free_phone_requests', entity_id: data.id });
    return reply.status(201).send({ data });
  });

  // ── POST /sales/free-phone-requests/:id/review ── Approve or reject
  app.post('/free-phone-requests/:id/review', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      action: z.enum(['approve', 'reject']),
      rejected_reason: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const updates = body.data.action === 'approve'
      ? { status: 'approved', approved_by: req.user!.id, approved_at: new Date().toISOString() }
      : { status: 'rejected', rejected_reason: body.data.rejected_reason };
    const { data, error } = await getSupabase().from('free_phone_requests').update(updates).eq('id', id).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    const action = body.data.action === 'approve' ? AuditActions.FREE_PHONE_APPROVED : AuditActions.FREE_PHONE_REJECTED;
    writeAuditLog({ user_id: req.user!.id, action, entity_type: 'free_phone_requests', entity_id: id });
    return reply.send({ data });
  });
}
