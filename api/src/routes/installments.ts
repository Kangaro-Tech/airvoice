import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function installmentRoutes(app: FastifyInstance) {
  app.get('/', { preHandler:[authenticate,requireStaff] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {application_id?:string;customer_id?:string;status?:string;year?:string;month?:string};
    
    // Remove failing joins
    let query = getSupabase().from('installments').select('*').order('due_date');
    if (q.application_id) query = query.eq('application_id',q.application_id);
    if (q.customer_id)    query = query.eq('customer_id',q.customer_id);
    if (q.status)         query = query.eq('status',q.status);
    if (q.year)           query = query.eq('due_year',parseInt(q.year));
    if (q.month)          query = query.eq('due_month',parseInt(q.month));
    const { data, error } = await query.limit(200);
    
    if (error) return reply.status(500).send({ error: error.message });

    const dataWithJoins = data ? [...data] : [];
    if (dataWithJoins.length > 0) {
      const appIds = [...new Set(dataWithJoins.map(i => i.application_id).filter(Boolean))];
      const custIds = [...new Set(dataWithJoins.map(i => i.customer_id).filter(Boolean))];
      
      const [appsRes, custsRes] = await Promise.all([
        appIds.length > 0 ? getSupabase().from('applications').select('*').in('id', appIds) : Promise.resolve({ data: [] }),
        custIds.length > 0 ? getSupabase().from('customers').select('*').in('id', custIds) : Promise.resolve({ data: [] })
      ]);
      
      const campIds = [...new Set((custsRes.data || []).map(c => c.camp_id).filter(Boolean))];
      const campsRes = campIds.length > 0 ? await getSupabase().from('camps').select('*').in('id', campIds) : { data: [] };
      const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c]));
      
      const custMap = Object.fromEntries((custsRes.data || []).map(c => [c.id, {
        full_name: c.full_name,
        service_number: c.service_number,
        phone_number: c.phone_number,
        rank: c.rank,
        camp: campMap[c.camp_id] || null
      }]));
      
      const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, {
        ref_number: a.ref_number,
        monthly_amount: a.monthly_amount,
        customer: custMap[a.customer_id] || null
      }]));
      
      dataWithJoins.forEach(i => {
        i.application = appMap[i.application_id] || null;
        i.customer = custMap[i.customer_id] || null;
      });
    }

    const correctedData = dataWithJoins.map((i: any) => {
      if (i.status === 'deducted' && i.deducted_amount > 0 && i.deducted_amount < i.expected_amount) {
        i.status = 'partial';
      }
      return i;
    });
    return reply.send({data: correctedData});
  });

  app.get('/overdue', { preHandler:[authenticate,requireStaff] }, async (_req, reply) => {
    const now = new Date();
    const { data, error } = await getSupabase().from('installments')
      .select('*')
      .eq('status','not_deducted').lte('due_date',now.toISOString().split('T')[0]).order('due_date').limit(100);
      
    if (error) return reply.status(500).send({ error: error.message });

    const dataWithJoins = data ? [...data] : [];
    if (dataWithJoins.length > 0) {
      const appIds = [...new Set(dataWithJoins.map(i => i.application_id).filter(Boolean))];
      const custIds = [...new Set(dataWithJoins.map(i => i.customer_id).filter(Boolean))];
      
      const [appsRes, custsRes] = await Promise.all([
        appIds.length > 0 ? getSupabase().from('applications').select('*').in('id', appIds) : Promise.resolve({ data: [] }),
        custIds.length > 0 ? getSupabase().from('customers').select('*').in('id', custIds) : Promise.resolve({ data: [] })
      ]);
      
      const campIds = [...new Set((custsRes.data || []).map(c => c.camp_id).filter(Boolean))];
      const campsRes = campIds.length > 0 ? await getSupabase().from('camps').select('*').in('id', campIds) : { data: [] };
      const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c]));
      
      const custMap = Object.fromEntries((custsRes.data || []).map(c => [c.id, {
        full_name: c.full_name,
        service_number: c.service_number,
        phone_number: c.phone_number,
        camp: campMap[c.camp_id] || null
      }]));
      
      const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, {
        ref_number: a.ref_number
      }]));
      
      dataWithJoins.forEach(i => {
        i.application = appMap[i.application_id] || null;
        i.customer = custMap[i.customer_id] || null;
      });
    }

    return reply.send({data: dataWithJoins});
  });
}
