import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireFinance, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';

export default async function payrollRoutes(app: FastifyInstance) {

  // ── GET /payroll/staff ─── List all active staff members
  app.get('/staff', { preHandler: [authenticate, requireFinance] }, async (_req, reply) => {
    const { data, error } = await getSupabase()
      .from('staff_registry')
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── GET /payroll/staff/users ─── List registered staff users for payroll linking
  app.get('/staff/users', { preHandler: [authenticate, requireFinance] }, async (_req, reply) => {
    const validStaffRoles = ['admin', 'super_admin', 'finance_officer', 'accountant', 'recovery_officer', 'camp_officer', 'sales_officer', 'inventory_manager'];
    const sb = getSupabase();

    const { data: assignedUsers, error: assignedErr } = await sb
      .from('staff_registry')
      .select('user_id')
      .not('user_id', 'is', null);

    if (assignedErr) return reply.status(500).send({ error: assignedErr.message });

    const assignedIds = (assignedUsers ?? [])
      .map((item: Record<string, unknown>) => item.user_id as string)
      .filter(Boolean);

    const { data, error } = await sb.from('users')
      .select('id,phone_number,role,is_active')
      .in('role', validStaffRoles)
      .eq('is_active', true)
      .order('phone_number', { ascending: true });

    if (error) return reply.status(500).send({ error: error.message });

    const filteredData = (data ?? []).filter(user => !assignedIds.includes(user.id));
    return reply.send({ data: filteredData });
  });

  // ── POST /payroll/staff ─── Create staff member
  app.post('/staff', { preHandler: [authenticate, requireRole('admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      user_id: z.string().uuid().optional(),
      full_name: z.string().min(2),
      nic_number: z.string().optional(),
      phone_number: z.string().optional(),
      email: z.string().email().optional(),
      designation: z.string().min(2),
      department: z.string().optional(),
      basic_salary: z.number().nonnegative(),
      transport_allow: z.number().nonnegative().default(0),
      meal_allow: z.number().nonnegative().default(0),
      commission_rate: z.number().nonnegative().max(100).default(0),
      epf_no: z.string().optional(),
      etf_no: z.string().optional(),
      joined_date: z.string().date().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    if (body.data.user_id) {
      const { data: existingStaff } = await sb.from('staff_registry').select('id').eq('user_id', body.data.user_id).single();
      if (existingStaff) return reply.status(409).send({ error: 'Selected user is already assigned to payroll staff' });

      const { data: user, error: userErr } = await sb.from('users').select('id,phone_number,role').eq('id', body.data.user_id).single();
      if (userErr || !user) return reply.status(404).send({ error: 'Registered user not found' });
    }

    const insertData = {
      ...body.data,
      user_id: body.data.user_id,
    } as Record<string, unknown>;

    const { data, error } = await sb.from('staff_registry').insert(insertData).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── PUT /payroll/staff/:id ─── Update staff member
  app.put('/staff/:id', { preHandler: [authenticate, requireRole('admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      full_name: z.string().min(2).optional(),
      designation: z.string().optional(),
      department: z.string().optional(),
      basic_salary: z.number().nonnegative().optional(),
      transport_allow: z.number().nonnegative().optional(),
      meal_allow: z.number().nonnegative().optional(),
      commission_rate: z.number().nonnegative().max(100).optional(),
      is_active: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { data, error } = await getSupabase().from('staff_registry').update(body.data).eq('id', id).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── GET /payroll/runs ─── List payroll runs
  app.get('/runs', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string; page?: string };
    const page = parseInt(q.page ?? '1'), limit = 20;
    let query = getSupabase()
      .from('payroll_runs')
      .select('*,created_by:users!created_by(phone_number)', { count: 'exact' })
      .order('run_month', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (q.year) query = query.eq('run_year', parseInt(q.year));
    const { data, count } = await query;
    return reply.send({ data, meta: { total: count, page, limit } });
  });

  // ── GET /payroll/runs/:id ─── Single run with lines
  app.get('/runs/:id', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const [runRes, linesRes] = await Promise.all([
      getSupabase().from('payroll_runs').select('*').eq('id', id).single(),
      getSupabase().from('payroll_lines').select('*,staff:staff_registry(full_name,designation,epf_no)').eq('run_id', id),
    ]);
    if (runRes.error) return reply.status(404).send({ error: 'Run not found' });
    return reply.send({ data: { ...runRes.data, lines: linesRes.data ?? [] } });
  });

  // ── POST /payroll/runs ─── Create a new draft payroll run
  app.post('/runs', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      run_month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
      notes: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const [runYearStr, runMonthStr] = body.data.run_month.split('-');
    const runYear = parseInt(runYearStr, 10);
    const monthIndex = parseInt(runMonthStr, 10);

    // Create run header
    const { data: run, error: runErr } = await sb.from('payroll_runs').insert({
      run_month: body.data.run_month,
      run_year: runYear,
      notes: body.data.notes,
      status: 'draft',
      created_by: req.user!.id,
    }).select().single();
    if (runErr) return reply.status(500).send({ error: runErr.message });

    // Fetch all active staff
    const { data: staff, error: staffErr } = await sb.from('staff_registry').select('*').eq('is_active', true);
    if (staffErr) return reply.status(500).send({ error: staffErr.message });

    // Fetch commission fees earned during the payroll month.
    const monthStart = `${body.data.run_month}-01`;
    const monthEnd = new Date(runYear, monthIndex, 0).toISOString().split('T')[0];
    const { data: commissions, error: commissionErr } = await sb.from('commissions')
      .select('sales_officer_id, amount')
      .gte('created_at', monthStart)
      .lte('created_at', `${monthEnd}T23:59:59Z`);
    if (commissionErr) return reply.status(500).send({ error: commissionErr.message });

    const salesMap: Record<string, { phonesSold: number; commissionAmount: number }> = {};
    (commissions ?? []).forEach((c: Record<string, unknown>) => {
      const officerId = c.sales_officer_id as string | undefined;
      if (!officerId) return;
      const amount = Number(c.amount ?? 0);
      const current = salesMap[officerId] ?? { phonesSold: 0, commissionAmount: 0 };
      current.phonesSold += 1;
      current.commissionAmount += amount;
      salesMap[officerId] = current;
    });

    // Generate payroll lines
    const lines = (staff ?? []).map((s: Record<string, unknown>) => {
      const staffUserId = s.user_id as string | undefined;
      const aggregated = staffUserId ? salesMap[staffUserId] ?? { phonesSold: 0, commissionAmount: 0 } : { phonesSold: 0, commissionAmount: 0 };
      const commAmt = aggregated.commissionAmount;
      const gross = Number(s.basic_salary) + Number(s.transport_allow) + Number(s.meal_allow) + commAmt;
      const epfEe = Number((gross * 0.08).toFixed(2));
      const epfEr = Number((gross * 0.12).toFixed(2));
      const etf = Number((gross * 0.03).toFixed(2));
      const net = Number((gross - epfEe).toFixed(2));
      return {
        run_id: run.id,
        staff_id: s.id,
        basic_salary: s.basic_salary,
        transport_allow: s.transport_allow,
        meal_allow: s.meal_allow,
        commission_amount: commAmt,
        phones_sold: aggregated.phonesSold,
        bonus: 0,
        deductions: 0,
        epf_ee: epfEe,
        epf_er: epfEr,
        etf: etf,
        gross_salary: gross,
        net_salary: net,
      };
    });

    if (lines.length > 0) {
      const { error: linesErr } = await sb.from('payroll_lines').insert(lines);
      if (linesErr) return reply.status(500).send({ error: linesErr.message });
    }

    // Update run totals
    const totals = lines.reduce(
      (acc, l) => ({
        total_gross: acc.total_gross + l.gross_salary,
        total_epf_ee: acc.total_epf_ee + l.epf_ee,
        total_epf_er: acc.total_epf_er + l.epf_er,
        total_etf: acc.total_etf + l.etf,
        total_net: acc.total_net + l.net_salary,
      }),
      { total_gross: 0, total_epf_ee: 0, total_epf_er: 0, total_etf: 0, total_net: 0 }
    );
    await sb.from('payroll_runs').update(totals).eq('id', run.id);

    writeAuditLog({ user_id: req.user!.id, action: AuditActions.PAYROLL_RUN_CREATED, entity_type: 'payroll_runs', entity_id: run.id });
    // Notify finance roles that a payroll draft was created
    notify({ kind: 'payroll_run_created', runMonth: body.data.run_month }).catch(() => {});
    return reply.status(201).send({ data: { ...run, ...totals, lines } });
  });

  // ── POST /payroll/runs/:id/approve
  app.post('/runs/:id/approve', { preHandler: [authenticate, requireRole('admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('payroll_runs').update({
      status: 'approved', approved_by: req.user!.id, approved_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'draft').select().single();
    if (error) return reply.status(400).send({ error: error.message });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.PAYROLL_RUN_APPROVED, entity_type: 'payroll_runs', entity_id: id });
    return reply.send({ data });
  });

  // ── POST /payroll/runs/:id/mark-paid
  app.post('/runs/:id/mark-paid', { preHandler: [authenticate, requireRole('admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('payroll_runs').update({
      status: 'paid', paid_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'approved').select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.send({ data });
  });
}
