import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function installmentRoutes(app: FastifyInstance) {
  app.get('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {application_id?:string;customer_id?:string;status?:string;year?:string;month?:string};
    let query = getSupabase().from('installments').select('*,application:applications(ref_number,monthly_amount,customer:customers(full_name,service_number,rank,camp:camps(name)))').order('due_date');
    if (q.application_id) query = query.eq('application_id',q.application_id);
    if (q.customer_id)    query = query.eq('customer_id',q.customer_id);
    if (q.status)         query = query.eq('status',q.status);
    if (q.year)           query = query.eq('due_year',parseInt(q.year));
    if (q.month)          query = query.eq('due_month',parseInt(q.month));
    const {data} = await query.limit(200);
    return reply.send({data});
  });

  app.get('/overdue', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const now = new Date();
    const {data} = await getSupabase().from('installments')
      .select('*,customer:customers(full_name,service_number,phone_number,camp:camps(name)),application:applications(ref_number)')
      .eq('status','not_deducted').lte('due_date',now.toISOString().split('T')[0]).order('due_date').limit(100);
    return reply.send({data});
  });
}
