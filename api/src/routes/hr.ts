import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

export default async function hrRoutes(app: FastifyInstance) {
  // ── ATTENDANCE ─────────────────────────────────────────────────────────────

  // POST /hr/attendance/mark
  app.post('/attendance/mark', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      staff_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      in_time: z.string().optional(),
      out_time: z.string().optional(),
      status: z.string().default('present')
    }).safeParse(req.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    const sb = getSupabase();
    
    // Check if record exists
    const { data: existing } = await sb
      .from('attendance')
      .select('id')
      .eq('staff_id', body.data.staff_id)
      .eq('date', body.data.date)
      .single();

    let result;
    if (existing) {
      const { data, error } = await sb
        .from('attendance')
        .update({
          in_time: body.data.in_time,
          out_time: body.data.out_time,
          status: body.data.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return reply.status(500).send({ error: error.message });
      result = data;
    } else {
      const { data, error } = await sb
        .from('attendance')
        .insert(body.data)
        .select()
        .single();
      if (error) return reply.status(500).send({ error: error.message });
      result = data;
    }

    // @ts-ignore
    writeAuditLog({ user_id: req.user!.id, action: 'ATTENDANCE_MARKED', entity_type: 'attendance', entity_id: result.id });
    return reply.status(200).send({ data: result });
  });

  // GET /hr/attendance/list
  app.get('/attendance/list', { preHandler: [authenticate, requireRole('system_operator', 'admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { date?: string, staff_id?: string };
    const sb = getSupabase();
    let query = sb.from('attendance').select('*, staff:staff_registry(full_name)');
    
    if (q.date) query = query.eq('date', q.date);
    if (q.staff_id) query = query.eq('staff_id', q.staff_id);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── LEAVES ─────────────────────────────────────────────────────────────────

  // POST /hr/leaves/request
  app.post('/leaves/request', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      staff_id: z.string().uuid(),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      leave_type: z.string(),
      reason: z.string().optional()
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb.from('leave_requests').insert(body.data).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    
    // @ts-ignore
    writeAuditLog({ user_id: req.user!.id, action: 'LEAVE_REQUESTED', entity_type: 'leave_requests', entity_id: data.id });
    return reply.status(201).send({ data });
  });

  // GET /hr/leaves/balances
  app.get('/leaves/balances', { preHandler: [authenticate] }, async (req: FastifyRequest, reply) => {
    const q = req.query as { staff_id?: string, year?: string };
    const sb = getSupabase();
    let query = sb.from('leave_balances').select('*');
    if (q.staff_id) query = query.eq('staff_id', q.staff_id);
    if (q.year) query = query.eq('year', parseInt(q.year));

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── PAYROLL ADVANCES & DEDUCTIONS ──────────────────────────────────────────

  // POST /hr/payroll/advance
  app.post('/payroll/advance', { preHandler: [authenticate, requireRole('system_operator', 'admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      staff_id: z.string().uuid(),
      amount: z.number().positive(),
      request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      deduction_month: z.string().regex(/^\d{4}-\d{2}$/)
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb.from('salary_advances').insert(body.data).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    
    // @ts-ignore
    writeAuditLog({ user_id: req.user!.id, action: 'SALARY_ADVANCE_REQUESTED', entity_type: 'salary_advances', entity_id: data.id });
    return reply.status(201).send({ data });
  });

  // POST /hr/payroll/deduction
  app.post('/payroll/deduction', { preHandler: [authenticate, requireRole('system_operator', 'admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      staff_id: z.string().uuid(),
      deduction_type: z.string(),
      amount: z.number().positive(),
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().optional()
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb.from('salary_deductions').insert(body.data).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    
    // @ts-ignore
    writeAuditLog({ user_id: req.user!.id, action: 'SALARY_DEDUCTION_ADDED', entity_type: 'salary_deductions', entity_id: data.id });
    return reply.status(201).send({ data });
  });
  
  // ── AUDIT LOGS FOR SYSTEM OPERATOR ──────────────────────────────────────────

  app.get('/audit-logs', { preHandler: [authenticate, requireRole('system_operator', 'admin', 'super_admin')] }, async (req: FastifyRequest, reply) => {
    const sb = getSupabase();
    const { data, error } = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

}
