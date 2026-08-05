import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireStaff, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog } from '../services/audit';

export default async function scheduleRoutes(app: FastifyInstance) {

  // ── GET /schedule ── List events for current user or all staff
  app.get('/', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { month?: string; status?: string; all?: string };
    const sb = getSupabase();

    const now = new Date();
    const month = q.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const monthEnd = new Date(y, m, 0).toISOString().split('T')[0];

    try {
      let query = sb
        .from('schedule_events')
        .select('*')
        .gte('event_date', monthStart)
        .lte('event_date', monthEnd)
        .order('event_date', { ascending: true });

      const isAdmin = ['admin', 'super_admin', 'system_operator'].includes(req.user!.role);
      if (!isAdmin || q.all !== 'true') {
        query = query.or(`created_by.eq.${req.user!.id}`);
      }

      if (q.status) query = query.eq('status', q.status);

      const { data: rawData, error } = await query;
      if (error) {
        req.log.warn(`schedule_events query notice: ${error.message}`);
        return reply.send({ data: [], month });
      }

      const events = rawData || [];
      if (events.length === 0) return reply.send({ data: [], month });

      const custIds = [...new Set(events.map((e: any) => e.customer_id).filter(Boolean))];
      const appIds = [...new Set(events.map((e: any) => e.application_id).filter(Boolean))];

      const [custRes, appsRes] = await Promise.all([
        custIds.length > 0 ? sb.from('customers').select('id, full_name, service_number, phone_number').in('id', custIds) : Promise.resolve({ data: [] }),
        appIds.length > 0 ? sb.from('applications').select('id, ref_number').in('id', appIds) : Promise.resolve({ data: [] }),
      ]);

      const custMap = Object.fromEntries((custRes.data || []).map(c => [c.id, c]));
      const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, a]));

      const data = events.map((e: any) => ({
        ...e,
        customer: custMap[e.customer_id] || null,
        application: appMap[e.application_id] || null,
      }));

      return reply.send({ data, month });
    } catch (err: any) {
      req.log.error(err);
      return reply.send({ data: [], month });
    }
  });

  // ── POST /schedule ── Create event
  app.post('/', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      title: z.string().min(2).max(200),
      description: z.string().optional(),
      event_date: z.string().date(),
      event_time: z.string().optional(),
      event_type: z.enum(['reminder', 'meeting', 'payment', 'visit', 'call', 'other']).default('other'),
      customer_id: z.string().uuid().optional(),
      application_id: z.string().uuid().optional(),
      assigned_to: z.array(z.string().uuid()).default([]),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('schedule_events')
      .insert({
        ...body.data,
        created_by: req.user!.id,
        status: 'pending',
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    return reply.status(201).send({ data });
  });

  // ── PUT /schedule/:id ── Update event
  app.put('/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      title: z.string().min(2).max(200).optional(),
      description: z.string().optional(),
      event_date: z.string().date().optional(),
      event_time: z.string().optional(),
      event_type: z.enum(['reminder', 'meeting', 'payment', 'visit', 'call', 'other']).optional(),
      customer_id: z.string().uuid().nullable().optional(),
      application_id: z.string().uuid().nullable().optional(),
      assigned_to: z.array(z.string().uuid()).optional(),
      status: z.enum(['pending', 'done', 'cancelled']).optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('schedule_events')
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ data });
  });

  // ── DELETE /schedule/:id ── Delete event
  app.delete('/:id', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    const { error } = await sb.from('schedule_events').delete().eq('id', id);
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  // ── GET /schedule/upcoming ── Next 7 days events for current user
  app.get('/upcoming', {
    preHandler: [authenticate, requireStaff],
  }, async (req: FastifyRequest, reply) => {
    const sb = getSupabase();
    const today = new Date().toISOString().split('T')[0];
    const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await sb
      .from('schedule_events')
      .select('*,customer:customers(full_name, phone_number)')
      .gte('event_date', today)
      .lte('event_date', next7)
      .eq('status', 'pending')
      .or(`created_by.eq.${req.user!.id},assigned_to.cs.{${req.user!.id}}`)
      .order('event_date', { ascending: true });

    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ data });
  });
}
