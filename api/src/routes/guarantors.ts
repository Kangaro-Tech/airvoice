import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireStaff } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import { getFirebaseMessaging } from '../config/firebase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';

// ── Legal liability text (versioned) ─────────────────────────
const LEGAL_TEXT_VERSION = 'v1';
export const GUARANTOR_LEGAL_TEXT = `AIRVOICE DEFENCE FINANCE — GUARANTOR LIABILITY AGREEMENT

By accepting this request, I voluntarily agree to the following:

1. AGREEMENT TO GUARANTEE
   I agree to act as guarantor for the phone instalment plan described in this request. This is a legal obligation I am accepting of my own free will.

2. LIABILITY CONDITIONS
   If the primary customer misses 3 or more consecutive monthly salary deductions, I agree to be contacted by AIRVOICE Defence Finance and to pay the outstanding instalments on their behalf within 30 days of notification.

3. JOINT RESPONSIBILITY
   My liability covers the remaining outstanding balance at the time of default, including any arrears accumulated. The maximum liability is the total remaining plan balance.

4. WITHDRAWAL
   I may only withdraw as guarantor if: (a) the customer finds an approved replacement guarantor, and (b) AIRVOICE admin approves the substitution in writing. I cannot unilaterally withdraw after acceptance.

5. CONSENT TO CONTACT
   I consent to AIRVOICE contacting me by phone, SMS, or in person at my registered camp/regiment if the primary customer defaults.

6. RECORD OF ACCEPTANCE
   My acceptance is recorded with a timestamp and device identifier. This constitutes a legally binding agreement under Sri Lankan law.

By tapping "I Accept" in the AIRVOICE mobile app, I confirm I have read, understood, and agree to all terms above.`;

// ── Send FCM push notification to guarantor ───────────────────
async function sendGuarantorFCMNotification(
  guarantorUserId: string,
  requesterName: string,
  requestId: string,
): Promise<boolean> {
  try {
    const sb = getSupabase();
    const { data: user } = await sb.from('users').select('fcm_token').eq('id', guarantorUserId).single();
    if (!user?.fcm_token) return false;
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.warn('[FCM] Firebase Messaging not initialised — push notification skipped (dev mode)');
      return false;
    }
    await messaging.send({
      token: user.fcm_token,
      notification: {
        title: 'Guarantor Request — AIRVOICE',
        body: `${requesterName} has asked you to be their phone plan guarantor. Tap to review.`,
      },
      data: {
        type: 'guarantor_request',
        request_id: requestId,
        screen: 'guarantor_inbox',
      },
      android: { priority: 'high', notification: { channelId: 'guarantor', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    return true;
  } catch (err) {
    console.error('[FCM] Failed to send guarantor notification:', err);
    return false;
  }
}
export default async function guarantorRoutes(app: FastifyInstance) {

  // ── GET / ──────────────────────────────────────────────────
  // List all guarantors
  app.get('/', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const sb = getSupabase();
    const { data, error } = await sb.from('guarantors')
      .select(`
        *,
        camp:camps(id, name),
        guarantor_requests(
          id,
          status,
          application:applications(
            id,
            ref_number,
            status,
            customer:customers(
              id,
              full_name,
              service_number,
              risk_score
            )
          )
        )
      `)
      .is('deleted_at', null);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ data });
  });

  // ── POST / ──────────────────────────────────────────────────
  // Register a customer as a guarantor
  app.post('/', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      monthly_salary: z.number().min(0).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();
    // Fetch customer details to cache
    const { data: cust } = await sb.from('customers')
      .select('full_name,nic_number,service_number,phone_number,branch,camp_id')
      .eq('id', body.data.customer_id).single();
    if (!cust) return reply.status(404).send({ error: 'Customer not found' });

    // Check if already a guarantor
    const { data: existing } = await sb.from('guarantors')
      .select('id').eq('customer_id', body.data.customer_id).is('deleted_at', null).maybeSingle();
    if (existing) return reply.status(409).send({ error: 'Customer is already registered as a guarantor' });

    const { data, error } = await sb.from('guarantors').insert({
      customer_id: body.data.customer_id,
      full_name: cust.full_name,
      nic_number: cust.nic_number,
      service_number: cust.service_number,
      phone_number: cust.phone_number,
      branch: cust.branch,
      camp_id: cust.camp_id,
      monthly_salary: body.data.monthly_salary ?? 0,
      total_liability: 0,
      affordability_checked: true,
      affordability_ok: true,
    } as any).select().single();

    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send({ data });
  });

  // ── POST /guarantors/search ───────────────────────────────
  // Search by NIC, service number, phone number, OR email/Gmail
  app.post('/search', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({ value: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });
    const v = body.data.value.trim().toLowerCase();
    const sb = getSupabase();
    const { data } = await sb.from('customers')
      .select('id,full_name,service_number,nic_number,phone_number,email,rank,branch,camp:camps(name),has_app_account')
      .or(`service_number.eq.${v},nic_number.eq.${v},phone_number.eq.${v},email.ilike.${v}`)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return reply.send({ found: false });
    // Never expose sensitive fields to the requesting customer
    const safe = {
      id: data.id,
      full_name: data.full_name,
      service_number: data.service_number,
      rank: data.rank,
      branch: data.branch,
      camp: data.camp,
      has_app_account: (data as any).has_app_account,
    };
    return reply.send({ found: true, customer: safe });
  });

  // ── POST /guarantors/request ──────────────────────────────
  // Send a guarantor request + FCM notification to the guarantor
  app.post('/request', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      application_id:        z.string().uuid(),
      guarantor_customer_id: z.string().uuid(),
      message:               z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();

    // Validate application belongs to requester
    const { data: application } = await sb.from('applications')
      .select('id,status,ref_number,customer:customers(id,full_name,user_id)')
      .eq('id', body.data.application_id).single();
    if (!application) return reply.status(404).send({ error: 'Application not found' });

    const requesterCust = (application as any).customer as any;
    if (requesterCust?.user_id !== req.user!.id) {
      return reply.status(403).send({ error: 'You can only add a guarantor to your own application' });
    }

    // Prevent self-guaranteeing
    if (body.data.guarantor_customer_id === requesterCust?.id) {
      return reply.status(400).send({ error: 'You cannot be your own guarantor' });
    }

    // Get guarantor details including their user_id for FCM
    const { data: guarantorCust } = await sb.from('customers')
      .select('id,full_name,phone_number,email,user_id')
      .eq('id', body.data.guarantor_customer_id).single();
    if (!guarantorCust) return reply.status(404).send({ error: 'Guarantor not found' });

    // Check for existing pending request for same application
    const { data: existingReq } = await sb.from('guarantor_requests')
      .select('id,status').eq('application_id', body.data.application_id)
      .in('status', ['pending', 'accepted']).maybeSingle();
    if (existingReq) {
      return reply.status(409).send({ error: 'A guarantor request already exists for this application', existing_status: (existingReq as any).status });
    }


    // Create the request
    const { data: gr, error } = await sb.from('guarantor_requests').insert({
      application_id:          body.data.application_id,
      requester_id:            requesterCust.id,
      requester_name:          requesterCust.full_name ?? 'Unknown',
      guarantor_customer_id:   body.data.guarantor_customer_id,
      guarantor_name:          guarantorCust.full_name,
      guarantor_phone:         guarantorCust.phone_number,
      guarantor_email:         guarantorCust.email,
      guarantor_search_value:  body.data.guarantor_customer_id,
      message:                 body.data.message,
      status:                  'pending',
      expires_at:              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } as any).select().single();

    if (error) return reply.status(500).send({ error: error.message });

    // Notify finance/recovery roles about pending guarantor request
    notify({ kind: 'guarantor_request_pending', requesterName: requesterCust.full_name ?? 'Unknown', applicationRef: application.ref_number ?? gr.application_id }).catch(() => {});

    // Send FCM push notification if guarantor has the app
    let fcmSent = false;
    if (guarantorCust.user_id && (guarantorCust as any).has_app_account !== false) {
      fcmSent = await sendGuarantorFCMNotification(
        guarantorCust.user_id,
        requesterCust.full_name ?? 'A fellow service member',
        gr.id
      );
    }

    // Record notification outcome
    if (fcmSent) {
      await sb.from('guarantor_requests').update({ fcm_notification_sent: true } as any).eq('id', gr.id);
    }

    // Send in-app notification to guarantor
    if (guarantorCust.user_id) {
      await sb.from('notifications').insert({
        user_id:  guarantorCust.user_id,
        title:    'Guarantor Request',
        body:     `${requesterCust.full_name} has requested you as their phone plan guarantor. Open the app to review and accept or decline.`,
        type:     'guarantor_request',
        data:     JSON.stringify({ request_id: gr.id, screen: 'guarantor_inbox' }),
      } as any).maybeSingle();
    }

    writeAuditLog({
      user_id:     req.user!.id,
      action:      AuditActions.GUARANTOR_REQUEST_SENT,
      entity_type: 'guarantor_requests',
      entity_id:   gr.id,
      new_values:  { application_id: body.data.application_id, guarantor_customer_id: body.data.guarantor_customer_id, fcm_sent: fcmSent },
    });

    return reply.status(201).send({
      data: gr,
      fcm_notification_sent: fcmSent,
      note: fcmSent
        ? 'Push notification sent to guarantor\'s device.'
        : 'Guarantor does not have the app installed. Notify them via WhatsApp or phone call.',
    });
  });

  // ── GET /guarantors/my-requests ───────────────────────────
  // Guarantor sees their incoming pending requests
  app.get('/my-requests', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const sb = getSupabase();
    const { data: cust } = await sb.from('customers').select('id').eq('user_id', req.user!.id).single();
    if (!cust) return reply.send({ data: [] });
    const { data } = await sb.from('guarantor_requests')
      .select(`
        *,
        application:applications(
          id,ref_number,monthly_amount,term_months,sale_price,
          phone_model:phone_models(brand,model,storage)
        ),
        requester:customers!requester_id(full_name,service_number,rank,branch,camp:camps(name))
      `)
      .eq('guarantor_customer_id', cust.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    return reply.send({ data: data ?? [], legal_text: GUARANTOR_LEGAL_TEXT, legal_text_version: LEGAL_TEXT_VERSION });
  });

  // ── POST /guarantors/requests/:id/respond ─────────────────
  // Guarantor accepts or rejects — legal consent recorded on accept
  app.post('/requests/:id/respond', { preHandler: [authenticate] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      action:               z.enum(['accept', 'reject']),
      legal_text_version:   z.string().optional(),
      note:                 z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const sb = getSupabase();

    // Verify this guarantor owns this request
    const { data: cust } = await sb.from('customers').select('id').eq('user_id', req.user!.id).single();
    const { data: gr } = await sb.from('guarantor_requests')
      .select('*').eq('id', id).single();
    if (!gr) return reply.status(404).send({ error: 'Request not found' });
    if (gr.guarantor_customer_id !== cust?.id) {
      return reply.status(403).send({ error: 'This request is not addressed to you' });
    }
    if (gr.status !== 'pending') {
      return reply.status(409).send({ error: `Request is already ${gr.status}` });
    }
    if (new Date(gr.expires_at) < new Date()) {
      return reply.status(410).send({ error: 'This request has expired' });
    }

    const now = new Date().toISOString();
    const updates = body.data.action === 'accept'
      ? {
          status:              'accepted',
          accepted_at:         now,
          legal_accepted:      true,
          legal_accepted_at:   now,
          legal_acceptance_ip: req.ip,
          legal_text_version:  body.data.legal_text_version ?? LEGAL_TEXT_VERSION,
        }
      : {
          status:       'rejected',
          rejected_at:  now,
        };

    const { data, error } = await sb.from('guarantor_requests')
      .update(updates as any).eq('id', id).select().single();
    if (error) return reply.status(500).send({ error: error.message });

    // Notify the original applicant
    const { data: requesterCust } = await sb.from('customers')
      .select('user_id,full_name').eq('id', gr.requester_id).single();
    if (requesterCust?.user_id) {
      const notifMsg = body.data.action === 'accept'
        ? `${gr.guarantor_name} has accepted your guarantor request for application ${gr.application_id?.slice(0, 8)}.`
        : `${gr.guarantor_name} has declined your guarantor request. You can search for another guarantor.`;
      await sb.from('notifications').insert({
        user_id: requesterCust.user_id,
        title:   body.data.action === 'accept' ? 'Guarantor Accepted ✓' : 'Guarantor Declined',
        body:    notifMsg,
        type:    'guarantor_request',
        data:    JSON.stringify({ request_id: id, action: body.data.action }),
      } as any).maybeSingle();

      // FCM to requester
      await sendGuarantorFCMNotification(requesterCust.user_id, gr.guarantor_name ?? 'Your guarantor', id);
    }

    writeAuditLog({
      user_id:     req.user!.id,
      action:      body.data.action === 'accept' ? AuditActions.GUARANTOR_ACCEPTED : AuditActions.GUARANTOR_REJECTED,
      entity_type: 'guarantor_requests',
      entity_id:   id,
      new_values:  { action: body.data.action, legal_accepted: body.data.action === 'accept' },
    });

    return reply.send({ data });
  });

  // ── GET /guarantors/legal-text ────────────────────────────
  // Mobile app fetches this before showing the consent screen
  app.get('/legal-text', { preHandler: [authenticate] },
  async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ text: GUARANTOR_LEGAL_TEXT, version: LEGAL_TEXT_VERSION });
  });

  // ── GET /guarantors/:customerId/liability ─────────────────
  // Staff view of how many plans a customer is guaranteeing
  app.get('/:customerId/liability', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const { customerId } = req.params as { customerId: string };
    const sb = getSupabase();
    const { data } = await sb.from('guarantor_requests')
      .select('id,status,created_at,application:applications(id,ref_number,monthly_amount,status,customer:customers(full_name,service_number))')
      .eq('guarantor_customer_id', customerId)
      .eq('status', 'accepted');
    const totalLiability = (data ?? []).reduce((s: number, r: Record<string, unknown>) => {
      const a = r.application as { monthly_amount: number } | null;
      return s + (a?.monthly_amount ?? 0);
    }, 0);
    return reply.send({ data, total_monthly_liability: totalLiability });
  });

  // ── POST /guarantors/pay ── Record guarantor payment for customer
  app.post('/pay', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      customer_id: z.string().uuid(),
      application_id: z.string().uuid(),
      guarantor_id: z.string().uuid(),
      installment_id: z.string().uuid().optional(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }).safeParse(req.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const sb = getSupabase();

    // Insert guarantor payment record
    const { data: payment, error: payErr } = await sb
      .from('guarantor_payments')
      .insert({
        ...body.data,
        processed_by: req.user!.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payErr) return reply.status(500).send({ error: payErr.message });

    // If linked to installment, update its deducted amount
    if (body.data.installment_id) {
      const { data: inst } = await sb
        .from('installments')
        .select('deducted_amount, expected_amount')
        .eq('id', body.data.installment_id)
        .single();

      if (inst) {
        const newDeducted = Number(inst.deducted_amount ?? 0) + body.data.amount;
        const isFullyPaid = newDeducted >= Number(inst.expected_amount);
        await sb.from('installments').update({
          deducted_amount: newDeducted,
          status: isFullyPaid ? 'deducted' : 'partial',
          updated_at: new Date().toISOString(),
        } as any).eq('id', body.data.installment_id);
      }
    }

    // Write audit log
    await writeAuditLog({
      user_id: req.user!.id,
      action: 'GUARANTOR_PAYMENT_RECORDED',
      entity_type: 'guarantor_payments',
      entity_id: payment.id,
      new_values: body.data,
    });

    return reply.status(201).send({ data: payment });
  });

  // ── GET /guarantors/payments ── List all guarantor payments
  app.get('/payments', { preHandler: [authenticate, requireStaff] },
  async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { customer_id?: string; application_id?: string };
    const sb = getSupabase();

    let query = sb
      .from('guarantor_payments')
      .select(`
        *,
        customer:customers(full_name, service_number, phone_number),
        application:applications(ref_number),
        processed_by_user:users!processed_by(phone_number)
      `)
      .order('paid_at', { ascending: false })
      .limit(100);

    if (q.customer_id) query = query.eq('customer_id', q.customer_id);
    if (q.application_id) query = query.eq('application_id', q.application_id);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ data });
  });
}

