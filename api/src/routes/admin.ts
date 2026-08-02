import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';

export default async function adminRoutes(app: FastifyInstance) {
  // Audit logs
  app.get('/audit-logs', { preHandler:[authenticate,requireAdmin] }, async (req:FastifyRequest, reply) => {
    const q = req.query as {entity_type?:string;action?:string;user_id?:string;page?:string};
    const page=parseInt(q.page??'1'), limit=50;
    let query = getSupabase().from('audit_logs')
      .select('*,user:users(phone_number,role)',{count:'exact'})
      .order('created_at',{ascending:false}).range((page-1)*limit,page*limit-1);
    if (q.entity_type) query = query.eq('entity_type',q.entity_type);
    if (q.action)      query = query.eq('action',q.action);
    if (q.user_id)     query = query.eq('user_id',q.user_id);
    const {data,count} = await query;
    return reply.send({data,meta:{total:count,page,limit}});
  });

  // System summary for dashboard
  app.get('/dashboard-stats', { preHandler:[authenticate,requireAdmin] }, async (_req, reply) => {
    const sb = getSupabase();
    const [
      {count:totalCustomers},{count:activeApps},{count:pendingApps},
      {count:highRisk},{count:totalUsers}
    ] = await Promise.all([
      sb.from('customers').select('id',{count:'exact',head:true}).is('deleted_at',null),
      sb.from('applications').select('id',{count:'exact',head:true}).eq('status','active'),
      sb.from('applications').select('id',{count:'exact',head:true}).in('status',['submitted','sales_review','camp_review','finance_review','admin_review']),
      sb.from('customers').select('id',{count:'exact',head:true}).in('risk_level',['high','critical']).is('deleted_at',null),
      sb.from('users').select('id',{count:'exact',head:true}).is('deleted_at',null),
    ]);
    return reply.send({total_customers:totalCustomers??0,active_applications:activeApps??0,pending_applications:pendingApps??0,high_risk_customers:highRisk??0,total_users:totalUsers??0});
  });

  // ─── ROLE MANAGEMENT ───────────────────────────────────────

  // Get all available roles with descriptions
  app.get('/roles', { preHandler: [authenticate, requireAdmin] }, async (_req, reply) => {
    const roles = [
      { name: 'super_admin', displayName: 'Super Admin', description: 'Full system access' },
      { name: 'admin', displayName: 'Admin', description: 'High-level system access' },
      { name: 'finance_officer', displayName: 'Finance Officer', description: 'Finance & recovery operations' },
      { name: 'recovery_officer', displayName: 'Recovery Officer', description: 'Phone recovery management' },
      { name: 'camp_officer', displayName: 'Camp Officer', description: 'Camp operations' },
      { name: 'sales_officer', displayName: 'Sales Officer', description: 'Sales & customer management' },
      { name: 'inventory_manager', displayName: 'Inventory Manager', description: 'Inventory management' },
      { name: 'accountant', displayName: 'Accountant', description: 'Financial record management' },
      { name: 'guarantor', displayName: 'Guarantor', description: 'Limited guarantor access' },
      { name: 'customer', displayName: 'Customer', description: 'Limited customer access' },
    ];
    return reply.send({ data: roles });
  });

  // Get all staff users (non-customer/guarantor)
  app.get('/staff', { preHandler: [authenticate, requireAdmin] }, async (_req, reply) => {
    const sb = getSupabase();
    let query = sb
      .from('users')
      .select('id,phone_number,email,role,is_active,is_verified,created_at,last_login_at,custom_modules,staff_registry(full_name)')
      .not('role', 'in', '("customer","guarantor")')
      .order('created_at', { ascending: false });

    if (_req.user!.role !== 'system_operator') {
      query = query.neq('role', 'system_operator');
    }

    const { data, error } = await query;
    
    if (error) return reply.status(500).send({ error: 'Failed to fetch staff' });
    return reply.send({ data: data || [] });
  });

  // Get staff user by ID
  app.get('/staff/:id', { preHandler: [authenticate, requireAdmin] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    const { data, error } = await sb
      .from('users')
      .select('id,phone_number,role,is_active,is_verified,created_at,last_login_at')
      .eq('id', id)
      .single();
    
    if (error || !data) return reply.status(404).send({ error: 'User not found' });
    return reply.send({ data });
  });

  // Create new staff user
  app.post('/staff', { preHandler: [authenticate, requireAdmin] }, async (req: FastifyRequest, reply) => {
    const { phone_number, role, email, password } = req.body as { phone_number: string; role: string; name?: string; email?: string; password?: string };
    
    if (!phone_number || !role) {
      return reply.status(400).send({ error: 'phone_number and role required' });
    }

    const validRoles = ['admin', 'super_admin', 'finance_officer', 'recovery_officer', 'camp_officer', 'sales_officer', 'inventory_manager', 'accountant', 'system_operator'];
    if (!validRoles.includes(role)) {
      return reply.status(400).send({ error: 'Invalid role' });
    }

    const sb = getSupabase();
    
    // Check if user already exists
    const { data: existing } = await sb.from('users').select('id').eq('phone_number', phone_number).single();
    if (existing) {
      return reply.status(409).send({ error: 'User already exists with this phone number' });
    }

    // Create user - note: firebase_uid is required, so we'll generate a placeholder
    // The user will be linked to Firebase when they actually log in (or created here if email/password provided)
    let firebase_uid = `admin_created_${phone_number.replace(/\\D/g, '')}_${Date.now()}`;
    
    if (email && password) {
      const auth = require('../config/firebase').getFirebaseAuth();
      if (auth) {
        try {
          const userRecord = await auth.createUser({
            email,
            password,
            phoneNumber: phone_number.startsWith('+') ? phone_number : `+94${phone_number.replace(/^0/, '')}`,
          });
          firebase_uid = userRecord.uid;
        } catch (err: any) {
          console.error('Firebase Auth creation error:', err);
          return reply.status(400).send({ error: 'Failed to create Firebase user: ' + err.message });
        }
      }
    }
    
    const { data, error } = await sb
      .from('users')
      .insert([{
        firebase_uid,
        phone_number,
        email: email || null,
        role,
        is_active: true,
        is_verified: false,
      }])
      .select('id,phone_number,email,role,is_active,is_verified,created_at')
      .single();

    if (error) {
      console.error('Staff creation error:', error);
      return reply.status(500).send({ error: error.message || 'Failed to create staff user' });
    }
    
    return reply.status(201).send({ data });
  });

  // Update user role
  app.patch('/users/:id/role', { preHandler: [authenticate, requireAdmin] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { role } = req.body as { role: string };

    if (!role) return reply.status(400).send({ error: 'role required' });

    // Only super_admin can change to/from super_admin
    if ((role === 'super_admin' || req.user?.role !== 'super_admin') && req.user?.role !== 'super_admin') {
      return reply.status(403).send({ error: 'Only super admin can manage super admin roles' });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('users')
      .update({ role })
      .eq('id', id)
      .select('id,phone_number,role')
      .single();

    if (error || !data) return reply.status(500).send({ error: 'Failed to update role' });
    
    // Audit log
    return reply.send({ data });
  });

  // Activate user
  app.patch('/users/:id/activate', { preHandler: [authenticate, requireAdmin] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    
    const { data, error } = await sb
      .from('users')
      .update({ is_active: true })
      .eq('id', id)
      .select('id,is_active')
      .single();

    if (error || !data) return reply.status(500).send({ error: 'Failed to activate user' });
    return reply.send({ data });
  });

  // Deactivate user
  app.patch('/users/:id/deactivate', { preHandler: [authenticate, requireAdmin] }, async (req: FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const sb = getSupabase();
    
    const { data, error } = await sb
      .from('users')
      .update({ is_active: false })
      .eq('id', id)
      .select('id,is_active')
      .single();

    if (error || !data) return reply.status(500).send({ error: 'Failed to deactivate user' });
    return reply.send({ data });
  });

  // Get role statistics (count of users by role)
  app.get('/role-stats', { preHandler: [authenticate, requireAdmin] }, async (_req, reply) => {
    const sb = getSupabase();
    const { data, error } = await sb.from('users').select('role');
    
    if (error) return reply.status(500).send({ error: 'Failed to fetch role stats' });
    
    const stats: Record<string, number> = {};
    (data || []).forEach((user: any) => {
      stats[user.role] = (stats[user.role] || 0) + 1;
    });
    
    return reply.send({ data: stats });
  });
}
