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

async function fetchAll(table: string, columns: string, apply?: (q: any) => any): Promise<any[]> {
  const sb = getSupabase();
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  for (;;) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchInChunks<T>(
  fn: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  keys: string[],
  chunkSize = 200
): Promise<T[]> {
  if (keys.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const res = await fn(chunk);
    if (res.error) throw res.error;
    if (res.data) results.push(...res.data);
  }
  return results;
}

export default async function guarantorRoutes(app: FastifyInstance) {

  // ── GET / ──────────────────────────────────────────────────
  // List guarantors with high-performance Promise.all parallel queries & URI safety
  app.get('/', { preHandler: [authenticate, requireStaff] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const sb = getSupabase();
        const { limit = '1000', page = '1', search, branch } = req.query as { limit?: string; page?: string; search?: string; branch?: string };

        const limitNum = Math.min(5000, Math.max(1, parseInt(limit) || 1000));
        const pageNum = Math.max(1, parseInt(page) || 1);
        const offset = (pageNum - 1) * limitNum;

        // 1. Build base guarantors & count query
        let countQuery = sb.from('guarantors').select('id', { count: 'exact', head: true }).is('deleted_at', null);
        let gQuery = sb.from('guarantors')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (branch && branch !== 'all') {
          countQuery = countQuery.eq('branch', branch);
          gQuery = gQuery.eq('branch', branch);
        }

        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          countQuery = countQuery.or(`full_name.ilike.${s},service_number.ilike.${s},nic_number.ilike.${s}`);
          gQuery = gQuery.or(`full_name.ilike.${s},service_number.ilike.${s},nic_number.ilike.${s}`);
        }

        gQuery = gQuery.range(offset, offset + limitNum - 1);

        // Run count and guarantors query IN PARALLEL
        const [{ count: totalCount }, { data: guarantors, error: gError }] = await Promise.all([
          countQuery,
          gQuery,
        ]);

        if (gError) return reply.status(500).send({ error: gError.message });
        if (!guarantors || guarantors.length === 0) {
          return reply.send({ data: [], total_count: totalCount ?? 0, page: pageNum, limit: limitNum });
        }

        // 2. Fetch requests, legacy apps, and camps for THESE guarantors in parallel with URI chunk safety
        const guarantorIds = guarantors.map((g: any) => g.id);
        const guarantorCustIds = guarantors.map((g: any) => g.customer_id).filter(Boolean);
        const campIds = [...new Set(guarantors.map((g: any) => g.camp_id).filter(Boolean))];

        const [reqsByGId, reqsByCustId, legacyApps, campsData] = await Promise.all([
          fetchInChunks(
            (chunk) => sb.from('guarantor_requests')
              .select('id, status, application_id, guarantor_id, guarantor_customer_id, requester_id, requester_name')
              .in('guarantor_id', chunk),
            guarantorIds
          ),
          fetchInChunks(
            (chunk) => sb.from('guarantor_requests')
              .select('id, status, application_id, guarantor_id, guarantor_customer_id, requester_id, requester_name')
              .in('guarantor_customer_id', chunk),
            guarantorCustIds
          ),
          fetchInChunks(
            (chunk) => sb.from('applications')
              .select('id, ref_number, status, customer_id, guarantor_id')
              .in('guarantor_id', chunk),
            guarantorIds
          ),
          fetchInChunks(
            (chunk) => sb.from('camps')
              .select('id, name')
              .in('id', chunk),
            campIds
          ),
        ]);

        const campMap = Object.fromEntries((campsData || []).map((c: any) => [c.id, c]));
        const allReqs = (reqsByGId || []).concat(reqsByCustId || []);
        const appIds = [...new Set(allReqs.map((r: any) => r.application_id).concat((legacyApps || []).map((a: any) => a.id)).filter(Boolean))];

        // 3. Fetch applications and customers in parallel
        let appMap: Record<string, any> = {};
        let customerMap: Record<string, any> = {};

        if (appIds.length > 0) {
          const appsData = await fetchInChunks(
            (chunk) => sb.from('applications')
              .select('id, ref_number, status, customer_id')
              .in('id', chunk),
            appIds
          );

          if (appsData && appsData.length > 0) {
            appMap = Object.fromEntries(appsData.map((a: any) => [a.id, a]));
            const customerIds = [...new Set(
              appsData.map((a: any) => a.customer_id)
                .concat(allReqs.map((r: any) => r.requester_id))
                .filter(Boolean)
            )];
            if (customerIds.length > 0) {
              const custsData = await fetchInChunks(
                (chunk) => sb.from('customers')
                  .select('id, full_name, service_number, risk_score')
                  .in('id', chunk),
                customerIds
              );
              if (custsData) {
                customerMap = Object.fromEntries(custsData.map((c: any) => [c.id, c]));
              }
            }
          }
        }

        // Build mappings in memory
        const reqsByGIdMap: Record<string, any[]> = {};
        const reqsByCustIdMap: Record<string, any[]> = {};

        allReqs.forEach((r: any) => {
          const app = appMap[r.application_id];
          const cust = app ? customerMap[app.customer_id] : (r.requester_id ? customerMap[r.requester_id] : null);
          const custName = cust?.full_name || r.requester_name || 'Customer';

          const mappedReq = {
            id: r.id,
            status: r.status,
            requester_name: custName,
            application: app ? {
              id: app.id,
              ref_number: app.ref_number,
              status: app.status,
              customer: cust || (custName ? { full_name: custName } : null),
            } : (custName ? { customer: { full_name: custName } } : null),
          };

          if (r.guarantor_id) {
            reqsByGIdMap[r.guarantor_id] = reqsByGIdMap[r.guarantor_id] || [];
            reqsByGIdMap[r.guarantor_id].push(mappedReq);
          }
          if (r.guarantor_customer_id) {
            reqsByCustIdMap[r.guarantor_customer_id] = reqsByCustIdMap[r.guarantor_customer_id] || [];
            reqsByCustIdMap[r.guarantor_customer_id].push(mappedReq);
          }
        });

        (legacyApps || []).forEach((app: any) => {
          const cust = customerMap[app.customer_id];
          const mappedReq = {
            id: `legacy-${app.id}`,
            status: 'accepted',
            requester_name: cust?.full_name || 'Customer',
            application: {
              id: app.id,
              ref_number: app.ref_number,
              status: app.status,
              customer: cust || null,
            },
          };
          reqsByGIdMap[app.guarantor_id] = reqsByGIdMap[app.guarantor_id] || [];
          if (!reqsByGIdMap[app.guarantor_id].some((r: any) => r.application?.id === app.id)) {
            reqsByGIdMap[app.guarantor_id].push(mappedReq);
          }
        });

        guarantors.forEach((g: any) => {
          g.camp = campMap[g.camp_id] || null;
          const byId = reqsByGIdMap[g.id] || [];
          const byCustId = g.customer_id ? (reqsByCustIdMap[g.customer_id] || []) : [];
          const combinedMap = new Map<string, any>();
          byId.concat(byCustId).forEach((r: any) => combinedMap.set(r.id, r));
          g.guarantor_requests = Array.from(combinedMap.values());
        });

        return reply.send({
          data: guarantors,
          total_count: totalCount ?? guarantors.length,
          page: pageNum,
          limit: limitNum,
        });
      } catch (err: any) {
        req.log.error(`GET /guarantors error: ${err.message}`);
        return reply.status(500).send({ error: err.message });
      }
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
      const { data: custRaw } = await sb.from('customers')
        .select('id,full_name,service_number,nic_number,phone_number,email,rank,branch,camp_id,has_app_account')
        .or(`service_number.eq.${v},nic_number.eq.${v},phone_number.eq.${v},email.ilike.${v}`)
        .is('deleted_at', null)
        .maybeSingle();
      if (!custRaw) return reply.send({ found: false });
      // Fetch camp manually
      let campData: any = null;
      if ((custRaw as any).camp_id) {
        const { data: cd } = await sb.from('camps').select('name').eq('id', (custRaw as any).camp_id).single();
        campData = cd;
      }
      // Never expose sensitive fields to the requesting customer
      const safe = {
        id: custRaw.id,
        full_name: custRaw.full_name,
        service_number: custRaw.service_number,
        rank: custRaw.rank,
        branch: custRaw.branch,
        camp: campData,
        has_app_account: (custRaw as any).has_app_account,
      };
      return reply.send({ found: true, customer: safe });
    });

  // ── POST /guarantors/request ──────────────────────────────
  // Send a guarantor request + FCM notification to the guarantor
  app.post('/request', { preHandler: [authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = z.object({
        application_id: z.string().uuid(),
        guarantor_customer_id: z.string().uuid(),
        message: z.string().max(500).optional(),
      }).safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

      const sb = getSupabase();

      // Validate application belongs to requester (manual join for customer)
      const { data: appRaw } = await sb.from('applications')
        .select('id,status,ref_number,customer_id')
        .eq('id', body.data.application_id).single();
      if (!appRaw) return reply.status(404).send({ error: 'Application not found' });
      const { data: requesterCust } = await sb.from('customers').select('id,full_name,user_id').eq('id', appRaw.customer_id).single();
      const application = { ...appRaw, customer: requesterCust };
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


      // Look up existing guarantor row ID if registered
      const { data: gRow } = await sb.from('guarantors')
        .select('id').eq('customer_id', body.data.guarantor_customer_id)
        .is('deleted_at', null).maybeSingle();

      // Create the request
      const { data: gr, error } = await sb.from('guarantor_requests').insert({
        application_id: body.data.application_id,
        requester_id: requesterCust.id,
        requester_name: requesterCust.full_name ?? 'Unknown',
        guarantor_customer_id: body.data.guarantor_customer_id,
        guarantor_id: gRow?.id ?? null,
        guarantor_name: guarantorCust.full_name,
        guarantor_phone: guarantorCust.phone_number,
        guarantor_email: guarantorCust.email,
        guarantor_search_value: body.data.guarantor_customer_id,
        message: body.data.message,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any).select().single();

      if (error) return reply.status(500).send({ error: error.message });

      // Notify finance/recovery roles about pending guarantor request
      notify({ kind: 'guarantor_request_pending', requesterName: requesterCust.full_name ?? 'Unknown', applicationRef: application.ref_number ?? gr.application_id }).catch(() => { });

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
          user_id: guarantorCust.user_id,
          title: 'Guarantor Request',
          body: `${requesterCust.full_name} has requested you as their phone plan guarantor. Open the app to review and accept or decline.`,
          type: 'guarantor_request',
          data: JSON.stringify({ request_id: gr.id, screen: 'guarantor_inbox' }),
        } as any).maybeSingle();
      }

      writeAuditLog({
        user_id: req.user!.id,
        action: AuditActions.GUARANTOR_REQUEST_SENT,
        entity_type: 'guarantor_requests',
        entity_id: gr.id,
        new_values: { application_id: body.data.application_id, guarantor_customer_id: body.data.guarantor_customer_id, fcm_sent: fcmSent },
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
      const { data: rawReqs } = await sb.from('guarantor_requests')
        .select('*, application_id, requester_id')
        .eq('guarantor_customer_id', cust.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      const reqs = rawReqs || [];
      if (reqs.length > 0) {
        const appIds = [...new Set(reqs.map((r: any) => r.application_id).filter(Boolean))];
        const requesterIds = [...new Set(reqs.map((r: any) => r.requester_id).filter(Boolean))];

        const [appsRes, requestersRes] = await Promise.all([
          appIds.length > 0 ? sb.from('applications').select('id, ref_number, monthly_amount, term_months, sale_price, phone_model_id').in('id', appIds) : Promise.resolve({ data: [] }),
          requesterIds.length > 0 ? sb.from('customers').select('id, full_name, service_number, rank, branch, camp_id').in('id', requesterIds) : Promise.resolve({ data: [] }),
        ]);

        const modelIds = [...new Set((appsRes.data || []).map(a => a.phone_model_id).filter(Boolean))];
        const rCampIds = [...new Set((requestersRes.data || []).map((c: any) => c.camp_id).filter(Boolean))];
        const [modelsRes, rCampsRes] = await Promise.all([
          modelIds.length > 0 ? sb.from('phone_models').select('id, brand, model, storage').in('id', modelIds) : Promise.resolve({ data: [] }),
          rCampIds.length > 0 ? sb.from('camps').select('id, name').in('id', rCampIds) : Promise.resolve({ data: [] }),
        ]);

        const modelMap = Object.fromEntries((modelsRes.data || []).map(m => [m.id, m]));
        const rCampMap = Object.fromEntries((rCampsRes.data || []).map(c => [c.id, { name: c.name }]));
        const appMap = Object.fromEntries((appsRes.data || []).map(a => [a.id, { ...a, phone_model: modelMap[a.phone_model_id] || null }]));
        const requesterMap = Object.fromEntries((requestersRes.data || []).map(c => [c.id, { ...c, camp: rCampMap[(c as any).camp_id] || null }]));

        reqs.forEach((r: any) => {
          r.application = appMap[r.application_id] || null;
          r.requester = requesterMap[r.requester_id] || null;
        });
      }

      return reply.send({ data: reqs, legal_text: GUARANTOR_LEGAL_TEXT, legal_text_version: LEGAL_TEXT_VERSION });
    });

  // ── POST /guarantors/requests/:id/respond ─────────────────
  // Guarantor accepts or rejects — legal consent recorded on accept
  app.post('/requests/:id/respond', { preHandler: [authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const body = z.object({
        action: z.enum(['accept', 'reject']),
        legal_text_version: z.string().optional(),
        note: z.string().max(500).optional(),
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
          status: 'accepted',
          accepted_at: now,
          legal_accepted: true,
          legal_accepted_at: now,
          legal_acceptance_ip: req.ip,
          legal_text_version: body.data.legal_text_version ?? LEGAL_TEXT_VERSION,
        }
        : {
          status: 'rejected',
          rejected_at: now,
        };

      const { data, error } = await sb.from('guarantor_requests')
        .update(updates as any).eq('id', id).select().single();
      if (error) return reply.status(500).send({ error: error.message });

      if (body.data.action === 'accept') {
        let { data: gRow } = await sb.from('guarantors')
          .select('id').eq('customer_id', gr.guarantor_customer_id)
          .is('deleted_at', null).maybeSingle();

        if (!gRow) {
          const { data: gc } = await sb.from('customers')
            .select('full_name,nic_number,service_number,phone_number,branch,camp_id')
            .eq('id', gr.guarantor_customer_id).single();
          if (gc) {
            const ins = await sb.from('guarantors').insert({
              customer_id: gr.guarantor_customer_id,
              full_name: gc.full_name,
              nic_number: gc.nic_number,
              service_number: gc.service_number,
              phone_number: gc.phone_number,
              branch: gc.branch,
              camp_id: gc.camp_id,
              affordability_checked: true,
              affordability_ok: true,
            } as any).select('id').single();
            gRow = ins.data;
          }
        }

        if (gRow?.id) {
          await sb.from('guarantor_requests')
            .update({ guarantor_id: gRow.id } as any).eq('id', id);
        }
      }

      // Notify the original applicant
      const { data: requesterCust } = await sb.from('customers')
        .select('user_id,full_name').eq('id', gr.requester_id).single();
      if (requesterCust?.user_id) {
        const notifMsg = body.data.action === 'accept'
          ? `${gr.guarantor_name} has accepted your guarantor request for application ${gr.application_id?.slice(0, 8)}.`
          : `${gr.guarantor_name} has declined your guarantor request. You can search for another guarantor.`;
        await sb.from('notifications').insert({
          user_id: requesterCust.user_id,
          title: body.data.action === 'accept' ? 'Guarantor Accepted ✓' : 'Guarantor Declined',
          body: notifMsg,
          type: 'guarantor_request',
          data: JSON.stringify({ request_id: id, action: body.data.action }),
        } as any).maybeSingle();

        // FCM to requester
        await sendGuarantorFCMNotification(requesterCust.user_id, gr.guarantor_name ?? 'Your guarantor', id);
      }

      writeAuditLog({
        user_id: req.user!.id,
        action: body.data.action === 'accept' ? AuditActions.GUARANTOR_ACCEPTED : AuditActions.GUARANTOR_REJECTED,
        entity_type: 'guarantor_requests',
        entity_id: id,
        new_values: { action: body.data.action, legal_accepted: body.data.action === 'accept' },
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

