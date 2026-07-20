import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireFinance, requireRole } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

export default async function commissionRoutes(app: FastifyInstance) {
  app.get('/', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {status?:string;officer_id?:string;page?:string};
    const page=parseInt(q.page??'1'), limit=30;
    let query = getSupabase().from('commissions')
      .select('*,application:applications(ref_number,status),customer:customers(full_name),officer:users!sales_officer_id(phone_number)',{count:'exact'})
      .order('created_at',{ascending:false}).range((page-1)*limit,page*limit-1);
    if (q.status) query = query.eq('status',q.status);
    // Sales officers see only their own
    if (req.user!.role==='sales_officer') query = query.eq('sales_officer_id',req.user!.id);
    else if (q.officer_id) query = query.eq('sales_officer_id',q.officer_id);
    const {data,count} = await query;
    return reply.send({data,meta:{total:count,page,limit}});
  });

  app.post('/:id/mark-paid', { preHandler:[authenticate,requireFinance] }, async (req:FastifyRequest, reply) => {
    const {id} = req.params as {id:string};
    const body = z.object({payment_reference:z.string().optional()}).safeParse(req.body);
    const {data,error} = await getSupabase().from('commissions').update({
      status:'paid', paid_at:new Date().toISOString(), paid_by:req.user!.id,
      payment_reference:(body.data as Record<string,string>)?.payment_reference,
    }).eq('id',id).select().single();
    if (error) return reply.status(500).send({error:error.message});
    writeAuditLog({user_id:req.user!.id,action:AuditActions.COMMISSION_PAID,entity_type:'commissions',entity_id:id});
    return reply.send({data});
  });

  app.get('/summary', { preHandler:[authenticate,requireFinance] }, async (_req, reply) => {
    const sb = getSupabase();
    const [{count:pending},{count:payable},{count:paid}] = await Promise.all([
      sb.from('commissions').select('id',{count:'exact',head:true}).eq('status','pending'),
      sb.from('commissions').select('id',{count:'exact',head:true}).eq('status','payable'),
      sb.from('commissions').select('id',{count:'exact',head:true}).eq('status','paid'),
    ]);
    return reply.send({pending:pending??0,payable:payable??0,paid:paid??0,per_phone:250});
  });
}
