import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { verifyFirebaseToken } from '../config/firebase';
import { registerSseClient, unregisterSseClient } from '../services/notify';

export default async function notificationRoutes(app: FastifyInstance) {
  // SSE stream endpoint
  app.get('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { token?: string };
    const authHeader = req.headers.authorization;
    let idToken = query.token || '';
    if (!idToken && authHeader && authHeader.startsWith('Bearer ')) {
      idToken = authHeader.slice(7);
    }

    if (!idToken) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Token required' });
    }

    let user;
    try {
      const decoded = await verifyFirebaseToken(idToken);
      const sb = getSupabase();
      const { data } = await sb
        .from('users')
        .select('id,firebase_uid,phone_number,role,is_active,is_verified')
        .eq('firebase_uid', decoded.uid)
        .single();
      if (!data || !data.is_active) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      user = data;
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }

    // Set headers for SSE stream
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Write initial space check
    reply.raw.write(':ok\n\n');

    // Register active SSE client
    const userId = user.id;
    registerSseClient(userId, reply);

    // Heartbeat ping interval to keep connection alive
    const interval = setInterval(() => {
      try {
        reply.raw.write(':ping\n\n');
      } catch (err) {
        // connection lost
      }
    }, 25000);

    req.raw.on('close', () => {
      clearInterval(interval);
      unregisterSseClient(userId, reply);
    });
  });

  app.get('/', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const {data} = await getSupabase().from('notifications')
      .select('*').eq('user_id',req.user!.id).order('created_at',{ascending:false}).limit(50);
    return reply.send({data});
  });

  // ── Live badge counts for sidebar ─────────────────────────
  app.get('/counts', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const sb = getSupabase();
    const role = req.user!.role;

    // Pending applications to review (role-aware)
    const REVIEW_STAGES: Record<string, string[]> = {
      sales_officer:    ['submitted'],
      camp_officer:     ['camp_review'],
      finance_officer:  ['finance_review'],
      accountant:       ['finance_review'],
      admin:            ['submitted','camp_review','finance_review','admin_review'],
      super_admin:      ['submitted','camp_review','finance_review','admin_review'],
    };
    const stages = REVIEW_STAGES[role] ?? [];
    const { count: pendingApps } = stages.length > 0
      ? await sb.from('applications').select('id',{count:'exact',head:true}).in('status',stages).is('deleted_at',null)
      : { count: 0 };

    // Low stock items (< 5 in stock) — only for inventory-facing roles
    const INV_ROLES = ['inventory_manager','admin','super_admin'];
    let lowStock = 0;
    if (INV_ROLES.includes(role)) {
      const {data:models} = await sb.from('phone_models').select('id').eq('is_active',true);
      for (const m of (models??[])) {
        const {count} = await sb.from('phones').select('id',{count:'exact',head:true}).eq('model_id',(m as any).id).eq('status','in_stock');
        if ((count??0) < 5) lowStock++;
      }
    }

    // Unread notifications for this user
    const { count: unread } = await sb.from('notifications')
      .select('id',{count:'exact',head:true})
      .eq('user_id',req.user!.id)
      .is('read_at',null);

    const { count: stockOrdersPending } = await sb.from('stock_orders')
      .select('id',{count:'exact',head:true})
      .eq('status','pending')
      .is('deleted_at',null);

    const { count: pendingInstallments } = await sb.from('installments')
      .select('id',{count:'exact',head:true})
      .eq('status','pending')
      .is('deleted_at',null);

    const { count: expensesPending } = await sb.from('expenses')
      .select('id',{count:'exact',head:true})
      .eq('status','pending')
      .is('deleted_at',null);

    const { count: payrollDrafts } = await sb.from('payroll_runs')
      .select('id',{count:'exact',head:true})
      .eq('status','draft');

    const today = new Date().toISOString().split('T')[0];
    const { count: recoveryOverdue } = await sb.from('installments')
      .select('id',{count:'exact',head:true})
      .eq('status','not_deducted')
      .lte('due_date',today)
      .is('deleted_at',null);

    const { count: guarantorRequestsPending } = await sb.from('guarantor_requests')
      .select('id',{count:'exact',head:true})
      .eq('status','pending')
      .gt('expires_at', new Date().toISOString());

    const { count: newCustomersToday } = await sb.from('customers')
      .select('id',{count:'exact',head:true})
      .gte('created_at', `${new Date().toISOString().split('T')[0]}T00:00:00Z`)
      .is('deleted_at',null);

    // Pending special approval requests for admin/super_admin
    let pendingSpecialApprovals = 0;
    if (['admin', 'super_admin'].includes(role)) {
      const { count } = await sb.from('special_approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingSpecialApprovals = count ?? 0;
    }

    const financeTasks = (pendingInstallments ?? 0) + (expensesPending ?? 0) + (payrollDrafts ?? 0);

    return reply.send({
      pending_applications: pendingApps ?? 0,
      low_stock: lowStock,
      unread_notifications: unread ?? 0,
      stock_orders_pending: stockOrdersPending ?? 0,
      pending_installments: pendingInstallments ?? 0,
      expenses_pending: expensesPending ?? 0,
      payroll_drafts: payrollDrafts ?? 0,
      recovery_overdue: recoveryOverdue ?? 0,
      guarantor_requests_pending: guarantorRequestsPending ?? 0,
      new_customers_today: newCustomersToday ?? 0,
      finance_tasks: financeTasks,
      pending_special_approvals: pendingSpecialApprovals,
    });
  });

  app.post('/:id/read', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const {id} = req.params as {id:string};
    await getSupabase().from('notifications').update({read_at:new Date().toISOString()} as any).eq('id',id).eq('user_id',req.user!.id);
    return reply.send({success:true});
  });

  app.post('/read-all', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    await getSupabase().from('notifications').update({read_at:new Date().toISOString()} as any).eq('user_id',req.user!.id).is('read_at',null);
    return reply.send({success:true});
  });

  // ── DELETE /:id — remove a single notification ─────────────────────
  app.delete('/:id', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const { id } = req.params as { id: string };
    const { error } = await getSupabase()
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id);
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  // ── DELETE / — clear all read notifications for this user ──────────
  app.delete('/', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    const { error } = await getSupabase()
      .from('notifications')
      .delete()
      .eq('user_id', req.user!.id)
      .not('read_at', 'is', null);
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  // ── POST /test-seed — Generate demo notifications based on user role ───────
  // DEV ONLY: This endpoint generates sample notifications for testing/demo.
  // Each call creates new notifications for the current user's role(s).
  app.post('/test-seed', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    // Security: Only allow in dev/test environments
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Endpoint disabled in production' });
    }

    const userId = req.user!.id;
    const userRole = req.user!.role;
    const sb = getSupabase();
    const now = new Date();

    interface TestNotif {
      user_id: string;
      type: string;
      title: string;
      body: string;
      action_url: string | null;
      entity_type: string;
      read_at: null;
      fcm_sent: boolean;
      sms_sent: boolean;
      created_at: Date;
    }

    const notifs: TestNotif[] = [];

    // Admin/Super Admin get the most variety
    if (['admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'application_status',
          title: '📋 New Application Submitted',
          body: 'Application AV-2024-TEST-001 has been submitted and is waiting for review.',
          action_url: '/applications',
          entity_type: 'application_submitted',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 60000), // 1 min ago
        },
        {
          user_id: userId,
          type: 'special_approval',
          title: '🔔 Special Approval Requested',
          body: 'Sales Officer requested special approval for a customer with exemplary service record.',
          action_url: '/applications?special_approval=pending',
          entity_type: 'special_approval_request',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 300000), // 5 min ago
        },
        {
          user_id: userId,
          type: 'recovery_alert',
          title: '🚨 Recovery Alert',
          body: 'High-risk customer has 3 consecutive months of missed deductions. Immediate follow-up required.',
          action_url: '/recovery',
          entity_type: 'recovery_alert',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 1800000), // 30 min ago
        }
      );
    }

    // Finance Officer / Accountant notifications
    if (['finance_officer', 'accountant', 'admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'finance_update',
          title: '💵 Deduction pending',
          body: 'Installment due for customer - AV-2024-001 for LKR 6,667.',
          action_url: '/installments',
          entity_type: 'deduction_processed',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 900000), // 15 min ago
        },
        {
          user_id: userId,
          type: 'finance_update',
          title: '🧾 Expense Awaiting Approval',
          body: 'A new expense in Office Supplies for LKR 8,500 needs review.',
          action_url: '/expenses',
          entity_type: 'expense_pending',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 1200000), // 20 min ago
        },
        {
          user_id: userId,
          type: 'finance_update',
          title: '🗓 Payroll Draft Created',
          body: 'A new payroll run for January 2025 is ready for review.',
          action_url: '/payroll',
          entity_type: 'payroll_run_created',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 2400000), // 40 min ago
        }
      );
    }

    // Camp Officer notifications
    if (['camp_officer', 'admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'application_status',
          title: '⏳ Application Needs Review',
          body: 'Application AV-2024-TEST-002 is waiting for camp review.',
          action_url: '/applications',
          entity_type: 'application_pending_review',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 3600000), // 1 hour ago
        }
      );
    }

    // Inventory Manager notifications
    if (['inventory_manager', 'admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'inventory_alert',
          title: '📦 New Stock Added',
          body: 'AIRVOICE Model X7 (IMEI: TEST-123456789) has been added to inventory.',
          action_url: '/inventory',
          entity_type: 'stock_added',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 1800000), // 30 min ago
        },
        {
          user_id: userId,
          type: 'inventory_alert',
          title: '⚠️ Low Stock Alert',
          body: 'Samsung Galaxy A25 has only 2 unit(s) remaining in stock.',
          action_url: '/inventory',
          entity_type: 'stock_low',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 2700000), // 45 min ago
        }
      );
    }

    // Recovery Officer notifications
    if (['recovery_officer', 'admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'recovery_alert',
          title: '🚨 Recovery Alert',
          body: 'Customer has 2 months of outstanding arrears. Contact required.',
          action_url: '/recovery',
          entity_type: 'recovery_alert',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 1500000), // 25 min ago
        }
      );
    }

    // Sales Officer notifications
    if (['sales_officer', 'admin', 'super_admin'].includes(userRole)) {
      notifs.push(
        {
          user_id: userId,
          type: 'special_approval',
          title: '✅ Special Approval Granted',
          body: 'Your special approval request for a customer has been approved by an admin.',
          action_url: '/applications',
          entity_type: 'special_approval_resolved',
          read_at: null,
          fcm_sent: false,
          sms_sent: false,
          created_at: new Date(now.getTime() - 600000), // 10 min ago
        }
      );
    }

    if (notifs.length === 0) {
      return reply.send({
        success: true,
        message: `No test notifications generated for role: ${userRole}`,
        created: 0,
      });
    }

    const { data, error } = await sb.from('notifications').insert(notifs);
    if (error) {
      console.error('[TEST SEED] Failed to insert test notifications:', error.message);
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({
      success: true,
      message: `Created ${notifs.length} test notification(s) for role: ${userRole}`,
      created: notifs.length,
      notifications: data,
    });
  });

  // ── POST /trigger-real — Trigger REAL notifications via actual event ──────────
  // DEV ONLY: Creates a real application and triggers real notifications
  app.post('/trigger-real', { preHandler:[authenticate] }, async (req:FastifyRequest, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Endpoint disabled in production' });
    }

    const sb = getSupabase();
    const { notify } = await import('../services/notify');

    // Simulate creating an application (this will trigger real notifications)
    const { data: app } = await sb
      .from('applications')
      .insert({
        ref_number: `AV-REAL-${Date.now()}`,
        customer_id: 'cu100000-0000-0000-0000-000000000001', // Use test customer
        phone_model_id: 'pm000000-0000-0000-0000-000000000002',
        sale_price: 89900,
        down_payment: 9900,
        monthly_amount: 6667,
        term_months: 12,
        status: 'draft',
        sales_officer_id: req.user!.id,
      })
      .select()
      .single();

    if (!app) {
      return reply.status(500).send({ error: 'Failed to create test application' });
    }

    // Now submit it - this will trigger REAL notifications
    await sb
      .from('applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', app.id);

    // Trigger the real notification event
    await notify({
      kind: 'application_submitted',
      ref: app.ref_number,
      appId: app.id,
      customerId: app.customer_id,
      salesOfficerId: req.user!.id,
    });

    console.log(`[TRIGGER REAL] Created real application ${app.ref_number} and triggered notifications`);

    return reply.send({
      success: true,
      message: 'Real application created and notifications triggered',
      application: {
        id: app.id,
        ref_number: app.ref_number,
        status: 'submitted',
      },
      details: 'Check the notifications tab - you should see new notifications appearing for admin/super_admin roles',
    });
  });
}
