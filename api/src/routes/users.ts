import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { writeAuditLog, AuditActions } from '../services/audit';

export default async function userRoutes(app: FastifyInstance) {
  // List users
  app.get('/', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const q = req.query as {role?:string;page?:string;limit?:string};
    const sb = getSupabase();
    const page=parseInt(q.page??'1'), limit=parseInt(q.limit??'50');
    let query = sb.from('users')
      .select('id,firebase_uid,phone_number,role,is_active,is_verified,two_fa_enabled,last_login_at,created_at,custom_modules',{count:'exact'})
      .is('deleted_at',null).order('created_at',{ascending:false})
      .range((page-1)*limit,page*limit-1);
    
    // Hide system_operator from admins/super_admins
    if (req.user!.role !== 'system_operator') {
      query = query.neq('role', 'system_operator');
    }

    if (q.role) query = query.eq('role',q.role);
    const {data,count} = await query;
    return reply.send({data,meta:{total:count,page,limit}});
  });

  // Get single user
  app.get('/:id', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const {data,error} = await getSupabase().from('users').select('*').eq('id',id).single();
    if (error) return reply.status(404).send({error:'User not found'});
    return reply.send({data});
  });

  // Change role (super_admin only)
  app.patch('/:id/role', { preHandler:[authenticate,requireSuperAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({role:z.enum(['sales_officer','camp_officer','finance_officer','recovery_officer','inventory_manager','accountant','admin','super_admin','system_operator'])}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Invalid role'});
    const sb=getSupabase();
    const {data:old} = await sb.from('users').select('role').eq('id',id).single();
    await sb.from('users').update({role:body.data.role} as any).eq('id',id);
    writeAuditLog({user_id:req.user!.id,action:AuditActions.USER_ROLE_CHANGED,entity_type:'users',entity_id:id,old_values:{role:old?.role as any},new_values:{role:body.data.role}});
    return reply.send({success:true});
  });

  // Deactivate
  app.patch('/:id/deactivate', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    await getSupabase().from('users').update({is_active:false} as any).eq('id',id);
    writeAuditLog({user_id:req.user!.id,action:AuditActions.USER_DEACTIVATED,entity_type:'users',entity_id:id});
    return reply.send({success:true});
  });

  // Change custom modules
  app.patch('/:id/modules', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({custom_modules: z.array(z.string()).nullable()}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Invalid custom_modules'});
    const sb = getSupabase();
    await sb.from('users').update({custom_modules:body.data.custom_modules} as any).eq('id',id);
    writeAuditLog({user_id:req.user!.id,action:AuditActions.USER_UPDATED,entity_type:'users',entity_id:id,new_values:{custom_modules:body.data.custom_modules}});
    return reply.send({success:true});
  });

  // Camp assignments for a user
  app.get('/:id/camp-assignments', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const {data: assignments} = await getSupabase().from('camp_officer_assignments')
      .select('*').eq('user_id',id).eq('is_active',true);
    const list = assignments || [];
    if (list.length > 0) {
      const campIds = list.map((a: any) => a.camp_id).filter(Boolean);
      const {data: camps} = await getSupabase().from('camps').select('id, name, branch').in('id', campIds);
      const campMap = Object.fromEntries((camps || []).map(c => [c.id, c]));
      list.forEach((a: any) => { a.camp = campMap[a.camp_id] || null; });
    }
    return reply.send({data: list});
  });

  // Assign camp to officer
  app.post('/:id/camp-assignments', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply:FastifyReply) => {
    const {id} = req.params as {id:string};
    const body = z.object({camp_id:z.string().uuid()}).safeParse(req.body);
    if (!body.success) return reply.status(400).send({error:'Validation Error'});
    await getSupabase().from('camp_officer_assignments').upsert({
      user_id:id,camp_id:body.data.camp_id,assigned_by:req.user!.id,is_active:true,
    } as any,{onConflict:'user_id,camp_id'});
    writeAuditLog({user_id:req.user!.id,action:AuditActions.CAMP_ASSIGNMENT_CHANGED,entity_type:'camp_officer_assignments',entity_id:id,new_values:{camp_id:body.data.camp_id}});
    return reply.send({success:true});
  });
}
