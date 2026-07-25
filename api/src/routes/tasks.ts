import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function tasksRoutes(app: FastifyInstance) {
  // Get all tasks for the logged-in user
  app.get('/', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user;
    if (!user || !user.id) return reply.status(401).send({ error: 'Unauthorized' });

    const { data, error } = await getSupabase().from('task_notes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // Create a new task
  app.post('/', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user;
    if (!user || !user.id) return reply.status(401).send({ error: 'Unauthorized' });

    const { text, deadline, notified, archived, created_at } = req.body as any;

    const { data, error } = await getSupabase().from('task_notes')
      .insert([{
        user_id: user.id,
        text,
        deadline,
        notified: notified ?? false,
        archived: archived ?? false,
        created_at: created_at ?? Date.now()
      }])
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // Update a task (e.g. mark as notified/archived)
  app.patch('/:id', { preHandler: [authenticate] },
  async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = req.user;
    if (!user || !user.id) return reply.status(401).send({ error: 'Unauthorized' });

    const updates = req.body as any;

    const { data, error } = await getSupabase().from('task_notes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // Delete a task
  app.delete('/:id', { preHandler: [authenticate] },
  async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = req.user;
    if (!user || !user.id) return reply.status(401).send({ error: 'Unauthorized' });

    const { error } = await getSupabase().from('task_notes')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true });
  });
}
