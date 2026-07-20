import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function districtRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { data, error } = await getSupabase().from('districts')
      .select('id,name,province')
      .order('name', { ascending: true });
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });
}
