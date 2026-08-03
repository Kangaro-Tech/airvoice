import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireFinance, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';

export default async function payrollRoutes(app: FastifyInstance) {

  // ── GET /payroll/staff ─── List all staff members (list view – select only needed columns)
  app.get('/staff', { preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')] }, async (_req, reply) => {
    const { data, error } = await getSupabase()
      .from('staff_registry')
      .select('id,user_id,full_name,designation,department,basic_salary,transport_allow,meal_allow,attendance_allowance,performance_allowance,allowance_01,allowance_02,commission_rate,epf_no,is_active,phone_number,profile_photo_url,joined_date')
      .order('full_name');
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── GET /payroll/staff/users ─── List registered staff users for payroll linking
  app.get('/staff/users', { preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')] }, async (_req, reply) => {
    const validStaffRoles = ['admin', 'super_admin', 'finance_officer', 'accountant', 'recovery_officer', 'camp_officer', 'sales_officer', 'inventory_manager', 'system_operator'];
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
      .select('id,phone_number,role,is_active,email')
      .in('role', validStaffRoles)
      .eq('is_active', true)
      .order('phone_number', { ascending: true });

    if (error) return reply.status(500).send({ error: error.message });

    const filteredData = (data ?? []).filter(user => !assignedIds.includes(user.id));
    return reply.send({ data: filteredData });
  });

  // ── GET /payroll/staff/:id ─── Single staff member full profile
  app.get('/staff/:id', { preHandler: [authenticate, requireRole('finance_officer', 'accountant', 'admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase()
      .from('staff_registry')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return reply.status(404).send({ error: 'Staff member not found' });
    return reply.send({ data });
  });

  // ── POST /payroll/staff ─── Create staff member
  app.post('/staff', { preHandler: [authenticate, requireRole('admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      user_id: z.string().uuid().optional(),
      full_name: z.string().min(2),
      nic_number: z.string().optional(),
      phone_number: z.string().optional(),
      email: z.string().email().optional(),
      designation: z.string().min(2),
      department: z.string().optional(),
      address: z.string().optional(),
      date_of_birth: z.string().optional(),
      emergency_contact_name: z.string().optional(),
      emergency_contact_phone: z.string().optional(),
      bank_name: z.string().optional(),
      bank_account_no: z.string().optional(),
      bank_branch: z.string().optional(),
      basic_salary: z.number().nonnegative(),
      transport_allow: z.number().nonnegative().default(0),
      meal_allow: z.number().nonnegative().default(0),
      attendance_allowance: z.number().nonnegative().default(0),
      performance_allowance: z.number().nonnegative().default(0),
      allowance_01: z.number().nonnegative().default(0),
      allowance_02: z.number().nonnegative().default(0),
      commission_rate: z.number().nonnegative().max(100).default(0),
      epf_no: z.string().optional(),
      etf_no: z.string().optional(),
      joined_date: z.string().optional(),
      profile_photo_url: z.string().optional(),
      create_user_account: z.boolean().optional(),
      password: z.string().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    let linkedUserId = body.data.user_id;

    if (body.data.create_user_account && !linkedUserId) {
      if (!body.data.phone_number || !body.data.designation) {
        return reply.status(400).send({ error: 'Phone number and designation required to create user account' });
      }

      const roleMapping: Record<string, string> = {
        'Finance Officer': 'finance_officer',
        'Sales Officer': 'sales_officer',
        'Recovery Officer': 'recovery_officer',
        'Camp Officer': 'camp_officer',
        'Inventory Manager': 'inventory_manager',
        'Accountant': 'accountant'
      };
      
      const roleToUse = roleMapping[body.data.designation] || 'customer';
      let firebase_uid = `staff_created_${body.data.phone_number.replace(/\D/g, '')}_${Date.now()}`;
      
      if (body.data.email && body.data.password) {
        const auth = require('../config/firebase').getFirebaseAuth();
        if (auth) {
          try {
            const userRecord = await auth.createUser({
              email: body.data.email,
              password: body.data.password,
              phoneNumber: body.data.phone_number.startsWith('+') ? body.data.phone_number : `+94${body.data.phone_number.replace(/^0/, '')}`,
            });
            firebase_uid = userRecord.uid;
          } catch (err: any) {
            console.error('Firebase Auth creation error:', err);
            return reply.status(400).send({ error: 'Failed to create Firebase user: ' + err.message });
          }
        }
      }
      
      const { data: newUser, error: newUserErr } = await sb.from('users').insert([{
        firebase_uid,
        phone_number: body.data.phone_number,
        email: body.data.email || null,
        role: roleToUse,
        is_active: true,
        is_verified: false,
      }]).select('id').single();

      if (newUserErr || !newUser) {
        return reply.status(500).send({ error: 'Failed to create system user account: ' + (newUserErr?.message || 'Unknown error') });
      }
      linkedUserId = newUser.id;
    } else if (linkedUserId) {
      const { data: existingStaff } = await sb.from('staff_registry').select('id').eq('user_id', linkedUserId).single();
      if (existingStaff) return reply.status(409).send({ error: 'Selected user is already assigned to payroll staff' });

      const { data: user, error: userErr } = await sb.from('users').select('id,phone_number,role').eq('id', linkedUserId).single();
      if (userErr || !user) return reply.status(404).send({ error: 'Registered user not found' });
    }

    const { create_user_account, password, ...insertDataInput } = body.data;

    const insertData = {
      ...insertDataInput,
      user_id: linkedUserId,
      is_active: true,
    } as Record<string, unknown>;

    const { data, error } = await sb.from('staff_registry').insert(insertData).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── PUT /payroll/staff/:id ─── Update staff member (full profile)
  app.put('/staff/:id', { preHandler: [authenticate, requireRole('admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      full_name: z.string().min(2).optional(),
      nic_number: z.string().optional(),
      phone_number: z.string().optional(),
      email: z.string().email().optional(),
      designation: z.string().optional(),
      department: z.string().optional(),
      address: z.string().optional(),
      date_of_birth: z.string().optional(),
      emergency_contact_name: z.string().optional(),
      emergency_contact_phone: z.string().optional(),
      bank_name: z.string().optional(),
      bank_account_no: z.string().optional(),
      bank_branch: z.string().optional(),
      basic_salary: z.number().nonnegative().optional(),
      transport_allow: z.number().nonnegative().optional(),
      meal_allow: z.number().nonnegative().optional(),
      attendance_allowance: z.number().nonnegative().optional(),
      performance_allowance: z.number().nonnegative().optional(),
      allowance_01: z.number().nonnegative().optional(),
      allowance_02: z.number().nonnegative().optional(),
      commission_rate: z.number().nonnegative().max(100).optional(),
      epf_no: z.string().optional(),
      etf_no: z.string().optional(),
      joined_date: z.string().optional(),
      profile_photo_url: z.string().optional(),
      is_active: z.boolean().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { data, error } = await getSupabase().from('staff_registry').update(body.data).eq('id', id).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── POST /payroll/staff/:id/upload-photo ─── Upload staff profile photo
  app.post('/staff/:id/upload-photo', { preHandler: [authenticate, requireRole('admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();

    // Verify staff exists
    const { data: staff, error: staffErr } = await sb.from('staff_registry').select('id,full_name').eq('id', id).single();
    if (staffErr || !staff) return reply.status(404).send({ error: 'Staff member not found' });

    let file: any;
    try {
      file = await (req as any).file();
    } catch {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!file) return reply.status(400).send({ error: 'No file uploaded' });

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({ error: 'File too large. Maximum 5MB allowed.' });
    }

    const ext = file.mimetype === 'image/webp' ? 'webp' : file.mimetype === 'image/png' ? 'png' : 'jpg';
    const fileName = `staff-${id}-${Date.now()}.${ext}`;
    const filePath = `profiles/${fileName}`;

    let photoUrl: string;

    const { error: uploadError } = await sb.storage
      .from('staff-photos')
      .upload(filePath, buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      return reply.status(500).send({ error: `Storage upload failed: ${uploadError.message}` });
    }
    
    const { data: publicUrlData } = sb.storage.from('staff-photos').getPublicUrl(filePath);
    photoUrl = publicUrlData?.publicUrl ?? filePath;

    const { data: updated, error: updateErr } = await sb
      .from('staff_registry')
      .update({ profile_photo_url: photoUrl })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return reply.status(500).send({ error: updateErr.message });
    return reply.send({ data: updated, photo_url: photoUrl });
  });

  // ── GET /payroll/runs ─── List payroll runs (summary only)
  app.get('/runs', { preHandler: [authenticate, requireFinance] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { year?: string; page?: string };
    const page = parseInt(q.page ?? '1'), limit = 20;
    let query = getSupabase()
      .from('payroll_runs')
      .select('id,run_month,run_year,status,total_gross,total_net,total_epf_ee,total_epf_er,total_etf,created_at,notes,created_by:users!created_by(phone_number)', { count: 'exact' })
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

    // Fetch salary advances for this month
    const { data: advances, error: advErr } = await sb.from('salary_advances')
      .select('staff_id, amount')
      .eq('deduction_month', body.data.run_month)
      .eq('status', 'approved');
    if (advErr) return reply.status(500).send({ error: advErr.message });

    const advanceMap: Record<string, number> = {};
    (advances ?? []).forEach((a: Record<string, unknown>) => {
      const staffId = a.staff_id as string;
      const amount = Number(a.amount ?? 0);
      advanceMap[staffId] = (advanceMap[staffId] ?? 0) + amount;
    });

    // Fetch active salary deductions
    const { data: deductions, error: dedErr } = await sb.from('salary_deductions')
      .select('staff_id, amount, deduction_type')
      .eq('is_active', true)
      .lte('effective_date', `${monthEnd}`);
    if (dedErr) return reply.status(500).send({ error: dedErr.message });

    const deductionMap: Record<string, number> = {};
    (deductions ?? []).forEach((d: Record<string, unknown>) => {
      // For now, combining all deductions other than EPF/ETF which are calculated
      if (d.deduction_type !== 'epf' && d.deduction_type !== 'etf') {
        const staffId = d.staff_id as string;
        const amount = Number(d.amount ?? 0);
        deductionMap[staffId] = (deductionMap[staffId] ?? 0) + amount;
      }
    });

    // Generate payroll lines
    const lines = (staff ?? []).map((s: Record<string, unknown>) => {
      const staffUserId = s.user_id as string | undefined;
      const aggregated = staffUserId ? salesMap[staffUserId] ?? { phonesSold: 0, commissionAmount: 0 } : { phonesSold: 0, commissionAmount: 0 };
      const commAmt = aggregated.commissionAmount;
      
      const attendanceAllow = Number(s.attendance_allowance ?? 0);
      const performanceAllow = Number(s.performance_allowance ?? 0);
      const allow01 = Number(s.allowance_01 ?? 0);
      const allow02 = Number(s.allowance_02 ?? 0);
      
      // Assume 20 working days by default for the month, can be edited later
      const workingDays = 20;
      const leaveDays = 0;
      const noPayDays = 0;
      const noPayDeduction = 0;

      const gross = Number(s.basic_salary) + attendanceAllow + performanceAllow + allow01 + allow02 + commAmt;
      const epfEe = Number((gross * 0.08).toFixed(2));
      const epfEr = Number((gross * 0.12).toFixed(2));
      const etf = Number((gross * 0.03).toFixed(2));
      
      const staffId = s.id as string;
      const advanceDeduction = advanceMap[staffId] ?? 0;
      const otherDeductions = deductionMap[staffId] ?? 0;
      const totalDeductions = epfEe + advanceDeduction + otherDeductions;
      
      const net = Number((gross - totalDeductions).toFixed(2));
      return {
        run_id: run.id,
        staff_id: staffId,
        basic_salary: s.basic_salary,
        transport_allow: s.transport_allow,
        meal_allow: s.meal_allow,
        attendance_allowance: attendanceAllow,
        performance_allowance: performanceAllow,
        allowance_01: allow01,
        allowance_02: allow02,
        commission_amount: commAmt,
        phones_sold: aggregated.phonesSold,
        working_days: workingDays,
        leave_days: leaveDays,
        no_pay_days: noPayDays,
        no_pay_deduction: noPayDeduction,
        bonus: 0,
        loans: advanceDeduction,
        deductions: otherDeductions,
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
  app.post('/runs/:id/approve', { preHandler: [authenticate, requireRole('admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('payroll_runs').update({
      status: 'approved', approved_by: req.user!.id, approved_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'draft').select().single();
    if (error) return reply.status(400).send({ error: error.message });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.PAYROLL_RUN_APPROVED, entity_type: 'payroll_runs', entity_id: id });
    return reply.send({ data });
  });

  // ── POST /payroll/runs/:id/mark-paid
  app.post('/runs/:id/mark-paid', { preHandler: [authenticate, requireRole('admin', 'super_admin', 'system_operator')] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('payroll_runs').update({
      status: 'paid', paid_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'approved').select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.send({ data });
  });
}
