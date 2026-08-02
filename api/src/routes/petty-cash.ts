import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireFinance, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

export default async function pettyCashRoutes(app: FastifyInstance) {

  // ── GET /petty-cash ── List all entries with running balance
  app.get('/', {
    preHandler: [authenticate, requireFinance],
  }, async (req: FastifyRequest, reply) => {
    const q = req.query as { month?: string; page?: string };
    const sb = getSupabase();
    const page = parseInt(q.page ?? '1');
    const limit = 50;

    let query = sb
      .from('petty_cash_entries')
      .select('*,created_by_user:users!created_by(phone_number)', { count: 'exact' })
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (q.month) {
      const monthStart = `${q.month}-01`;
      const [y, m] = q.month.split('-').map(Number);
      const monthEnd = new Date(y, m, 0).toISOString().split('T')[0];
      query = query.gte('entry_date', monthStart).lte('entry_date', monthEnd);
    }

    const { data, count, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    // Calculate running balance from all entries (not just current page)
    const { data: allForBalance } = await sb
      .from('petty_cash_entries')
      .select('type, amount');

    const balance = (allForBalance ?? []).reduce((acc: number, e: any) => {
      return e.type === 'credit' ? acc + Number(e.amount) : acc - Number(e.amount);
    }, 0);

    return reply.send({ data, meta: { total: count, page, limit }, balance });
  });

  // ── POST /petty-cash ── Create entry
  app.post('/', {
    preHandler: [authenticate, requireFinance],
  }, async (req: FastifyRequest, reply) => {
    const body = z.object({
      entry_date: z.string().date(),
      description: z.string().min(2).max(500),
      amount: z.number().positive(),
      type: z.enum(['credit', 'debit']),
      category: z.string().optional(),
      reference_number: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('petty_cash_entries')
      .insert({ ...body.data, created_by: req.user!.id })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'PETTY_CASH_ENTRY_CREATED',
      entity_type: 'petty_cash_entries',
      entity_id: data.id,
      new_values: body.data,
    });

    return reply.status(201).send({ data });
  });

  // ── PUT /petty-cash/:id ── Update entry
  app.put('/:id', {
    preHandler: [authenticate, requireFinance],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      entry_date: z.string().date().optional(),
      description: z.string().min(2).max(500).optional(),
      amount: z.number().positive().optional(),
      type: z.enum(['credit', 'debit']).optional(),
      category: z.string().optional(),
      reference_number: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('petty_cash_entries')
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'PETTY_CASH_ENTRY_UPDATED',
      entity_type: 'petty_cash_entries',
      entity_id: id,
      new_values: body.data,
    });

    return reply.send({ data });
  });

  // ── DELETE /petty-cash/:id ── Delete entry
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin', 'finance_officer', 'system_operator')],
  }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    const { error } = await sb.from('petty_cash_entries').delete().eq('id', id);
    if (error) return reply.status(500).send({ error: error.message });

    await writeAuditLog({
      user_id: req.user!.id,
      action: 'PETTY_CASH_ENTRY_DELETED',
      entity_type: 'petty_cash_entries',
      entity_id: id,
      new_values: {},
    });

    return reply.send({ success: true });
  });

  // ── GET /petty-cash/summary ── Monthly summary
  app.get('/summary', {
    preHandler: [authenticate, requireFinance],
  }, async (_req: FastifyRequest, reply) => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('petty_cash_entries')
      .select('type, amount, entry_date');

    if (error) return reply.status(500).send({ error: error.message });

    // Group by month
    const monthMap: Record<string, { credits: number; debits: number }> = {};
    (data ?? []).forEach((e: any) => {
      const month = e.entry_date.substring(0, 7);
      if (!monthMap[month]) monthMap[month] = { credits: 0, debits: 0 };
      if (e.type === 'credit') monthMap[month].credits += Number(e.amount);
      else monthMap[month].debits += Number(e.amount);
    });

    const summary = Object.entries(monthMap)
      .map(([month, v]) => ({ month, ...v, net: v.credits - v.debits }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return reply.send({ data: summary });
  });
}
