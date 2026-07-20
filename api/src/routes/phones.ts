import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { notify } from '../services/notify';

export default async function phoneRoutes(app: FastifyInstance) {
  app.get('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const q = req.query as {status?:string;model_id?:string;page?:string};
    const page=parseInt(q.page??'1'), limit=30;
    let query = getSupabase().from('phones')
      .select('*,model:phone_models(brand,model,storage),customer:customers(full_name,service_number)',{count:'exact'})
      .is('deleted_at',null).order('created_at',{ascending:false}).range((page-1)*limit,page*limit-1);
    if (q.status) query = query.eq('status',q.status);
    if (q.model_id) query = query.eq('model_id',q.model_id);
    const {data,count} = await query;
    return reply.send({data,meta:{total:count,page,limit}});
  });

  app.post('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const body = z.object({
      model_id:z.string().uuid(), imei_1:z.string().min(14).max(16),
      imei_2:z.string().optional(), serial_number:z.string().optional(),
      purchase_cost:z.number().optional(), purchase_date:z.string().optional(),
      stock_location:z.string().optional(), supplier_id:z.string().uuid().optional(),
      warranty_months:z.number().optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error',details:body.error.flatten()});
    const {data,error} = await getSupabase().from('phones').insert({...body.data,received_by:req.user!.id} as any).select('*,model:phone_models(brand,model,storage)').single();
    if (error) {
      if (error.code==='23505') return reply.status(409).send({error:'IMEI already registered'});
      return reply.status(500).send({error:error.message});
    }
    const modelName = `${(data as any).model?.brand ?? ''} ${(data as any).model?.model ?? ''}`.trim();
    notify({ kind: 'stock_added', modelName: modelName || 'Unknown Model', imei: body.data.imei_1, addedBy: req.user!.id });
    // Check stock level and fire low-stock alert if needed
    const {count} = await getSupabase().from('phones').select('id',{count:'exact',head:true}).eq('model_id',body.data.model_id).eq('status','in_stock');
    if ((count ?? 0) < 5) notify({ kind: 'stock_low', modelName: modelName || 'Unknown Model', remaining: count ?? 0 });
    return reply.status(201).send({data});
  });

  app.get('/check-imei/:imei', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {imei} = req.params as {imei:string};
    const {data} = await getSupabase().from('phones')
      .select('id,imei_1,status,customer:customers(full_name)').eq('imei_1',imei).maybeSingle();
    return reply.send({exists:!!data, phone:data as any});
  });

  app.patch('/:id', { preHandler:[authenticate,requireRole('inventory_manager','admin','super_admin')] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({status:z.enum(['in_stock','allocated','sold','returned','written_off']).optional(),stock_location:z.string().optional(),notes:z.string().optional()}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    const {data,error} = await getSupabase().from('phones').update(body.data as any).eq('id',id).select().single();
    if (error) return reply.status(500).send({error:error.message});
    return reply.send({data});
  });
}
