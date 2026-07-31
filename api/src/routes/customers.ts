import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole, requireStaff, requireAdmin } from '../middleware/auth';
import { getSupabase } from '../config/supabase';
import {
  checkCustomerDuplicates,
  checkPhoneEligibility,
  linkLegacyRecord,
  refreshCustomerRisk,
} from '../services/customers';
import { writeAuditLog, AuditActions } from '../services/audit';
import { notify } from '../services/notify';

// ── Validation schemas ────────────────────────────────────────

const CreateCustomerSchema = z.object({
  full_name: z.string().min(2).max(200),
  full_name_si: z.string().optional(),
  full_name_ta: z.string().optional(),
  nic_number: z.string().regex(/^[0-9]{9}[VvXx]$|^[0-9]{12}$/, 'Invalid NIC format').optional(),
  date_of_birth: z.string().date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  branch: z.enum(['army', 'navy', 'air_force']),
  service_number: z.string().max(50).optional(),
  military_id_number: z.string().max(50).optional(),
  rank: z.string().min(1).max(100),
  regiment_id: z.string().uuid().optional(),
  camp_id: z.string().uuid().optional(),
  retirement_date: z.string().date().optional(),
  phone_number: z.string().regex(/^\+94[0-9]{9}$/, 'Phone must be in +94XXXXXXXXX format').optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
});

const SearchSchema = z.object({
  q: z.string().min(1).optional(),
  nic: z.string().optional(),
  service_number: z.string().optional(),
  branch: z.enum(['army', 'navy', 'air_force']).optional(),
  camp_id: z.string().uuid().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function customerRoutes(app: FastifyInstance) {

  // ── Search / List customers ─────────────────────────────────
  app.get('/', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const params = SearchSchema.parse(request.query);
    const supabase = getSupabase();
    const offset = (params.page - 1) * params.limit;

    let query = supabase
      .from('customers')
      .select(`
        id, full_name, nic_number, service_number, branch, rank,
        phone_number, risk_level, risk_score, is_active,
        has_app_account, retirement_date, camp_id,
        regiment:regiments(id, name)
      `, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + params.limit - 1);

    if (params.q) {
      query = query.or(
        `full_name.ilike.%${params.q}%,nic_number.ilike.%${params.q}%,service_number.ilike.%${params.q}%,phone_number.ilike.%${params.q}%`
      );
    }
    if (params.nic) query = query.eq('nic_number', params.nic);
    if (params.service_number) query = query.eq('service_number', params.service_number);
    if (params.branch) query = query.eq('branch', params.branch);
    if (params.camp_id) query = query.eq('camp_id', params.camp_id);
    if (params.risk_level) query = query.eq('risk_level', params.risk_level);

    const { data, error, count } = await query;

    if (error) return reply.status(500).send({ error: error.message });

    // Manually join camps and applications due to missing FK constraints
    const dataWithJoins = data ? [...data] : [];
    if (dataWithJoins.length > 0) {
      const campIds = [...new Set(dataWithJoins.map(c => c.camp_id).filter(Boolean))];
      const customerIds = dataWithJoins.map(c => c.id);

      const [campsRes, appsRes] = await Promise.all([
        campIds.length > 0 ? supabase.from('camps').select('id, name').in('id', campIds) : Promise.resolve({ data: [] }),
        customerIds.length > 0 ? supabase.from('applications').select('id, status, customer_id').in('customer_id', customerIds) : Promise.resolve({ data: [] })
      ]);

      const campMap = Object.fromEntries((campsRes.data || []).map(c => [c.id, c]));
      const appsMap = (appsRes.data || []).reduce((acc: any, app: any) => {
        acc[app.customer_id] = acc[app.customer_id] || [];
        acc[app.customer_id].push({ id: app.id, status: app.status });
        return acc;
      }, {});

      dataWithJoins.forEach((c: any) => {
        c.camp = campMap[c.camp_id] || null;
        c.applications = appsMap[c.id] || [];
      });
    }

    return reply.send({
      data: dataWithJoins,
      meta: {
        total: count ?? 0,
        page: params.page,
        limit: params.limit,
        pages: Math.ceil((count ?? 0) / params.limit),
      },
    });
  });

  // ── Check for duplicate before creating ────────────────────
  app.post('/check-duplicate', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      nic_number?: string;
      service_number?: string;
      military_id_number?: string;
      phone_number?: string;
    };

    const result = await checkCustomerDuplicates(body);
    return reply.send(result);
  });

  // ── Create customer (staff-initiated) ──────────────────────
  app.post('/', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = CreateCustomerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    // Check duplicates first
    const dupCheck = await checkCustomerDuplicates({
      nic_number: body.data.nic_number,
      service_number: body.data.service_number,
      military_id_number: body.data.military_id_number,
      phone_number: body.data.phone_number,
    });

    if (dupCheck.has_duplicate) {
      writeAuditLog({
        user_id: request.user!.id,
        action: AuditActions.NIC_DUPLICATE_BLOCKED,
        entity_type: 'customers',
        metadata: { duplicates: dupCheck.duplicates },
        ip_address: request.ip,
      });

      return reply.status(409).send({
        error: 'Duplicate Customer',
        message: 'A customer with these details already exists.',
        duplicates: dupCheck.duplicates,
      });
    }

    const supabase = getSupabase();
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        ...body.data,
        created_by: request.user!.id,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Try to link to legacy record
    const linkResult = await linkLegacyRecord(
      customer.id,
      body.data.nic_number,
      body.data.service_number,
      body.data.phone_number,
      request.user!.id
    );

    writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.CUSTOMER_CREATED,
      entity_type: 'customers',
      entity_id: customer.id,
      new_values: body.data,
      ip_address: request.ip,
      metadata: { legacy_linked: linkResult.linked },
    });

    // Notify interested roles about the new customer
    notify({ kind: 'customer_added', customerName: customer.full_name ?? 'Unknown', nic: customer.nic_number ?? '' }).catch(() => {});

    return reply.status(201).send({
      data: customer,
      legacy_linked: linkResult.linked,
    });
  });

  // ── Get customer profile ────────────────────────────────────
  app.get('/:id', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;

    // Customers can only view their own profile
    if (user.role === 'customer') {
      const supabase = getSupabase();
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!cust || cust.id !== id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    }

    const supabase = getSupabase();
    const { data: custRaw, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      request.log.error(error);
      return reply.status(404).send({ error: 'Customer not found', details: error.message });
    }

    // Manually fetch related data (FK constraints missing in DB)
    const [campRes, regimentRes, appsRes, legacyRes] = await Promise.all([
      custRaw.camp_id ? supabase.from('camps').select('id, name, branch, district').eq('id', custRaw.camp_id).single() : Promise.resolve({ data: null }),
      custRaw.regiment_id ? supabase.from('regiments').select('id, name').eq('id', custRaw.regiment_id).single() : Promise.resolve({ data: null }),
      supabase.from('applications').select('id, ref_number, status, monthly_amount, term_months, plan_end_date, sale_price, created_at, phone_model_id, phone_id').eq('customer_id', id),
      supabase.from('legacy_customer_links').select('legacy_row_id, linked_by, confidence').eq('customer_id', id),
    ]);

    // Fetch phone models and phones for applications
    const apps = appsRes.data || [];
    const modelIds = [...new Set(apps.map(a => a.phone_model_id).filter(Boolean))];
    const phoneIds = [...new Set(apps.map(a => a.phone_id).filter(Boolean))];
    const [modelsRes, phonesRes] = await Promise.all([
      modelIds.length > 0 ? supabase.from('phone_models').select('id, brand, model, storage').in('id', modelIds) : Promise.resolve({ data: [] }),
      phoneIds.length > 0 ? supabase.from('phones').select('id, imei_1, imei_2').in('id', phoneIds) : Promise.resolve({ data: [] }),
    ]);
    const modelMap = Object.fromEntries((modelsRes.data || []).map(m => [m.id, m]));
    const phoneMap = Object.fromEntries((phonesRes.data || []).map(p => [p.id, p]));
    const appsWithJoins = apps.map(a => ({
      ...a,
      phone_model: modelMap[a.phone_model_id] || null,
      phone: phoneMap[a.phone_id] || null,
    }));

    // Fetch legacy row data
    const legacyLinks = legacyRes.data || [];
    const legacyRowIds = legacyLinks.map(l => l.legacy_row_id).filter(Boolean);
    const legacyRowsRes = legacyRowIds.length > 0 ? await supabase.from('legacy_import_rows').select('id, service_number, customer_name, monthly_amount, total_expected, total_deducted, arrears, is_settled').in('id', legacyRowIds) : { data: [] };
    const legacyRowMap = Object.fromEntries((legacyRowsRes.data || []).map(r => [r.id, r]));
    const legacyWithJoins = legacyLinks.map(l => ({ ...l, legacy_row: legacyRowMap[l.legacy_row_id] || null }));

    const data = {
      ...custRaw,
      camp: campRes.data || null,
      regiment: regimentRes.data || null,
      applications: appsWithJoins,
      legacy_link: legacyWithJoins,
    };

    return reply.send({ data });
  });

  // ── Check phone eligibility ─────────────────────────────────
  app.get('/:id/phone-eligibility', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await checkPhoneEligibility(id);
    return reply.send(result);
  });

  // ── Update customer ─────────────────────────────────────────
  app.patch('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      full_name:           z.string().min(1).optional(),
      full_name_si:        z.string().optional().nullable(),
      full_name_ta:        z.string().optional().nullable(),
      nic_number:          z.string().optional().nullable(),
      service_number:      z.string().optional().nullable(),
      military_id_number:  z.string().optional().nullable(),
      rank:                z.string().optional(),
      branch:              z.enum(['army', 'navy', 'air_force']).optional(),
      camp_id:             z.string().uuid().optional().nullable(),
      regiment_id:         z.string().uuid().optional().nullable(),
      phone_number:        z.string().optional().nullable(),
      email:               z.string().email().optional().nullable(),
      address:             z.string().optional().nullable(),
      date_of_birth:       z.string().date().optional().nullable(),
      gender:              z.string().optional().nullable(),
      retirement_date:     z.string().date().optional().nullable(),
      is_active:           z.boolean().optional(),
      is_blocked:          z.boolean().optional(),
      block_reason:        z.string().optional().nullable(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    const supabase = getSupabase();

    // If NIC is being changed, verify it is not already used by another customer
    if (body.data.nic_number) {
      const { data: dup } = await supabase.from('customers')
        .select('id').eq('nic_number', body.data.nic_number)
        .neq('id', id).is('deleted_at', null).maybeSingle();
      if (dup) {
        return reply.status(409).send({ error: 'NIC number is already registered to another customer' });
      }
    }

    // Same dedup for service number
    if (body.data.service_number) {
      const { data: dup } = await supabase.from('customers')
        .select('id').eq('service_number', body.data.service_number)
        .neq('id', id).is('deleted_at', null).maybeSingle();
      if (dup) {
        return reply.status(409).send({ error: 'Service number is already registered to another customer' });
      }
    }

    const { data: oldCustomer } = await supabase.from('customers').select('*').eq('id', id).single();
    if (!oldCustomer) return reply.status(404).send({ error: 'Customer not found' });

    const { data, error } = await supabase.from('customers')
      .update({ ...body.data, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();

    if (error) return reply.status(500).send({ error: error.message });

    writeAuditLog({
      user_id:     request.user!.id,
      action:      body.data.is_blocked === true ? AuditActions.CUSTOMER_BLOCKED : AuditActions.CUSTOMER_UPDATED,
      entity_type: 'customers',
      entity_id:   id,
      old_values:  oldCustomer,
      new_values:  body.data,
      ip_address:  request.ip,
    });

    return reply.send({ data });
  });

  // ── Delete customer (soft delete) ──────────────────────────
  app.delete('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();

    // Prevent deletion if customer has active applications
    const { data: activeApps } = await supabase.from('applications')
      .select('id').eq('customer_id', id).in('status', ['active', 'approved', 'pending_handover']).limit(1);
    if (activeApps && activeApps.length > 0) {
      return reply.status(409).send({ error: 'Cannot delete customer with active applications. Close or cancel applications first.' });
    }

    const { data: old } = await supabase.from('customers').select('full_name').eq('id', id).single();
    const { error } = await supabase.from('customers')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (error) return reply.status(500).send({ error: error.message });

    writeAuditLog({
      user_id:     request.user!.id,
      action:      AuditActions.CUSTOMER_UPDATED,
      entity_type: 'customers',
      entity_id:   id,
      old_values:  old ?? undefined,
      new_values:  { deleted: true },
      ip_address:  request.ip,
    });

    return reply.send({ success: true });
  });

  // ── Refresh risk score ──────────────────────────────────────
  app.post('/:id/refresh-risk', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await refreshCustomerRisk(id);
    return reply.send(result);
  });

  // ── Customer self-registration (from mobile app) ────────────
  // Called AFTER Firebase OTP verification
  app.post('/self-register', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    // Check if this user already has a customer record
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return reply.status(409).send({
        error: 'Already registered',
        message: 'You already have a customer account.',
        customer_id: existing.id,
      });
    }

    const body = CreateCustomerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    }

    // Duplicate check
    const dupCheck = await checkCustomerDuplicates({
      nic_number: body.data.nic_number,
      service_number: body.data.service_number,
      military_id_number: body.data.military_id_number,
    });

    if (dupCheck.has_duplicate) {
      return reply.status(409).send({
        error: 'Duplicate Customer',
        message: 'An account with these details already exists. Please contact support.',
        duplicates: dupCheck.duplicates,
      });
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        ...body.data,
        user_id: user.id,
        phone_number: user.phone_number,
        has_app_account: true,
        app_linked_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    // Link to legacy records
    const linkResult = await linkLegacyRecord(
      customer.id,
      body.data.nic_number,
      body.data.service_number,
      user.phone_number,
      user.id
    );

    // Update users table
    await supabase
      .from('users')
      .update({ nic_number: body.data.nic_number })
      .eq('id', user.id);

    writeAuditLog({
      user_id: user.id,
      action: AuditActions.CUSTOMER_CREATED,
      entity_type: 'customers',
      entity_id: customer.id,
      new_values: { source: 'self_register', ...body.data },
      metadata: { legacy_linked: linkResult.linked },
    });

    return reply.status(201).send({
      data: customer,
      legacy_linked: linkResult.linked,
      legacy_details: linkResult,
    });
  });

  // ── PUT /customers/:id/service-number ── Edit customer service number
  app.put('/:id/service-number', {
    preHandler: [authenticate, requireRole('admin', 'super_admin', 'finance_officer', 'accountant', 'camp_officer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      service_number: z.string().min(1).max(50),
      reason: z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });

    const supabase = getSupabase();

    // Fetch old value for audit
    const { data: existing } = await supabase
      .from('customers')
      .select('service_number')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('customers')
      .update({ service_number: body.data.service_number, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, service_number, full_name')
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    await writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.CUSTOMER_UPDATED,
      entity_type: 'customers',
      entity_id: id,
      old_values: { service_number: existing?.service_number },
      new_values: { service_number: body.data.service_number, reason: body.data.reason },
    });

    return reply.send({ data });
  });

  // ── GET /customers/:id/agreement-photo ── Get agreement photo URL
  app.get('/:id/agreement-photo', {
    preHandler: [authenticate, requireStaff],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const supabase = getSupabase();

    const { data } = await supabase
      .from('customers')
      .select('agreement_photo_url, full_name')
      .eq('id', id)
      .single();

    return reply.send({
      agreement_photo_url: (data as any)?.agreement_photo_url ?? null,
      customer_name: (data as any)?.full_name ?? '',
    });
  });

  // ── POST /customers/:id/agreement-photo ── Upload agreement photo (base64)
  app.post('/:id/agreement-photo', {
    preHandler: [authenticate, requireRole('admin', 'super_admin', 'finance_officer', 'accountant', 'camp_officer')],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      photo_url: z.string().url(),  // Caller uploads to storage and passes URL
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('customers')
      .update({ agreement_photo_url: body.data.photo_url, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
      .select('id, agreement_photo_url')
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    await writeAuditLog({
      user_id: request.user!.id,
      action: AuditActions.CUSTOMER_UPDATED,
      entity_type: 'customers',
      entity_id: id,
      new_values: { agreement_photo_url: body.data.photo_url },
    });

    return reply.send({ data });
  });
}

