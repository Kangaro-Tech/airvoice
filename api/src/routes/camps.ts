import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireStaff, requireSuperAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

const CampSchema = z.object({
  name:      z.string().min(1),
  name_si:   z.string().optional(),
  name_ta:   z.string().optional(),
  branch:    z.enum(['army', 'navy', 'air_force']),
  district:  z.string().optional(),
  province:  z.string().optional(),
  address:   z.string().optional(),
  is_active: z.boolean().optional(),
});

const RegimentSchema = z.object({
  name:      z.string().min(1),
  name_si:   z.string().optional(),
  name_ta:   z.string().optional(),
  branch:    z.enum(['army', 'navy', 'air_force']).optional(),
  is_active: z.boolean().optional(),
});

export default async function campRoutes(app: FastifyInstance) {

  // ── GET /camps — list all camps ────────────────────────────
  app.get('/', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { branch?: string; include_inactive?: string };
    let query = getSupabase().from('camps')
      .select('*,regiments(id,name,name_si,name_ta,branch,is_active)').order('name');
    if (q.branch) query = query.eq('branch', q.branch);
    if (q.include_inactive !== 'true') query = query.eq('is_active', true);
    const { data } = await query;
    return reply.send({ data });
  });

  // ── POST /camps — create camp (super_admin only) ───────────
  app.post('/', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CampSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    const { data, error } = await getSupabase().from('camps').insert(body.data).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'camps', entity_id: data.id, new_values: body.data });
    return reply.status(201).send({ data });
  });

  // ── GET /camps/:id — single camp with regiments + officers ─
  app.get('/:id', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('camps')
      .select('*,regiments(*),camp_officer_assignments(user_id,is_active,assigned_at,user:users(id,phone_number,role,is_active))')
      .eq('id', id).single();
    if (error) return reply.status(404).send({ error: 'Camp not found' });
    return reply.send({ data });
  });

  // ── PATCH /camps/:id — update camp details (super_admin) ───
  app.patch('/:id', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = CampSchema.partial().safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    const sb = getSupabase();
    const { data: old } = await sb.from('camps').select('*').eq('id', id).single();
    const { data, error } = await sb.from('camps').update(body.data).eq('id', id).select().single();
    if (error) return reply.status(404).send({ error: 'Camp not found' });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'camps', entity_id: id, old_values: old ?? undefined, new_values: body.data });
    return reply.send({ data });
  });

  // ── DELETE /camps/:id — deactivate camp (super_admin) ──────
  app.delete('/:id', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    // Check if camp has active customers
    const { count } = await sb.from('customers').select('id', { count: 'exact', head: true })
      .eq('camp_id', id).is('deleted_at', null);
    if ((count ?? 0) > 0) {
      return reply.status(409).send({ error: `Cannot delete camp with ${count} active customers assigned to it.` });
    }
    const { data: old } = await sb.from('camps').select('*').eq('id', id).single();
    const { error } = await sb.from('camps').update({ is_active: false }).eq('id', id);
    if (error) return reply.status(404).send({ error: 'Camp not found' });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'camps', entity_id: id, old_values: old ?? undefined, new_values: { is_active: false } });
    return reply.send({ success: true });
  });

  // ── GET /camps/:id/officers — list assigned officers ───────
  app.get('/:id/officers', { preHandler: [authenticate, requireAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { data } = await getSupabase().from('camp_officer_assignments')
      .select('*,user:users(id,phone_number,role,is_active)').eq('camp_id', id).eq('is_active', true);
    return reply.send({ data });
  });

  // ── POST /camps/:id/officers — assign officer to camp ──────
  app.post('/:id/officers', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ user_id: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const sb = getSupabase();
    // Verify the user exists and can be a camp officer
    const { data: user } = await sb.from('users').select('id,role,phone_number').eq('id', body.data.user_id).single();
    if (!user) return reply.status(404).send({ error: 'User not found. The officer must log in at least once before being assigned.' });
    await sb.from('camp_officer_assignments').upsert(
      { camp_id: id, user_id: body.data.user_id, assigned_by: req.user!.id, is_active: true, assigned_at: new Date().toISOString() },
      { onConflict: 'user_id,camp_id' }
    );
    // Set their role to camp_officer if it isn't already
    if (!['camp_officer', 'admin', 'super_admin'].includes(user.role)) {
      await sb.from('users').update({ role: 'camp_officer' }).eq('id', body.data.user_id);
    }
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_ASSIGNMENT_CHANGED, entity_type: 'camp_officer_assignments', entity_id: body.data.user_id, new_values: { camp_id: id, user_phone: user.phone_number } });
    return reply.send({ success: true });
  });

  // ── DELETE /camps/:id/officers/:userId — remove officer ────
  app.delete('/:id/officers/:userId', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    await getSupabase().from('camp_officer_assignments')
      .update({ is_active: false }).eq('camp_id', id).eq('user_id', userId);
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_ASSIGNMENT_CHANGED, entity_type: 'camp_officer_assignments', entity_id: userId, new_values: { camp_id: id, action: 'removed' } });
    return reply.send({ success: true });
  });

  // ── POST /camps/:id/regiments — add regiment ────────────────
  app.post('/:id/regiments', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = RegimentSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    // Inherit branch from camp if not provided
    const { data: camp } = await getSupabase().from('camps').select('branch').eq('id', id).single();
    const { data, error } = await getSupabase().from('regiments')
      .insert({ ...body.data, camp_id: id, branch: body.data.branch ?? camp?.branch }).select().single();
    if (error) return reply.status(500).send({ error: error.message });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'regiments', entity_id: data.id, new_values: { camp_id: id, ...body.data } });
    return reply.status(201).send({ data });
  });

  // ── PATCH /camps/:id/regiments/:rid — update regiment ──────
  app.patch('/:id/regiments/:rid', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, rid } = req.params as { id: string; rid: string };
    const body = RegimentSchema.partial().safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const { data, error } = await getSupabase().from('regiments')
      .update(body.data).eq('id', rid).eq('camp_id', id).select().single();
    if (error) return reply.status(404).send({ error: 'Regiment not found' });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'regiments', entity_id: rid, new_values: body.data });
    return reply.send({ data });
  });

  // ── DELETE /camps/:id/regiments/:rid — deactivate regiment ─
  app.delete('/:id/regiments/:rid', { preHandler: [authenticate, requireSuperAdmin] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, rid } = req.params as { id: string; rid: string };
    const { error } = await getSupabase().from('regiments')
      .update({ is_active: false }).eq('id', rid).eq('camp_id', id);
    if (error) return reply.status(404).send({ error: 'Regiment not found' });
    writeAuditLog({ user_id: req.user!.id, action: AuditActions.CAMP_UPDATED, entity_type: 'regiments', entity_id: rid, new_values: { is_active: false } });
    return reply.send({ success: true });
  });
}
