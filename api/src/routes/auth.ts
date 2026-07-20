import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getSupabase } from '../config/supabase';
import { verifyFirebaseToken } from '../config/firebase';
import { writeAuditLog, AuditActions } from '../services/audit';
import { checkOtpRateLimit } from '../middleware/auth';

export default async function authRoutes(app: FastifyInstance) {

  // ── POST /auth/register ───────────────────────────────────
  // Called after Firebase OTP is verified on client.
  // Creates the user record in our database.
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      firebase_id_token:  z.string(),
      preferred_language: z.enum(['en', 'si', 'ta']).default('en'),
      fcm_token:          z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.status(400).send({ error: 'Validation Error' });

    let decoded;
    try {
      decoded = await verifyFirebaseToken(body.data.firebase_id_token);
    } catch {
      return reply.status(401).send({ error: 'Invalid Firebase token' });
    }

    if (!decoded.phone_number) {
      return reply.status(400).send({ error: 'Phone number not present in Firebase token' });
    }

    const supabase = getSupabase();

    // Check if already registered
    const { data: existing } = await supabase
      .from('users')
      .select(`
        id, role, is_active, phone_number, is_verified, preferred_language,
        staff:staff_registry(full_name)
      `)
      .eq('firebase_uid', decoded.uid)
      .single();

    if (existing) {
      if (!existing.is_active) {
        return reply.status(403).send({ error: 'Account deactivated. Contact support.' });
      }
      // Update last login and FCM token on every login
      await supabase.from('users').update({
        last_login_at: new Date().toISOString(),
        last_login_ip: request.ip,
        ...(body.data.fcm_token ? { fcm_token: body.data.fcm_token, fcm_token_updated_at: new Date().toISOString() } : {}),
      }).eq('id', existing.id);
      writeAuditLog({
        user_id: existing.id,
        firebase_uid: decoded.uid,
        action: AuditActions.LOGIN_SUCCESS,
        entity_type: 'users',
        ip_address: request.ip,
      });
      const staffArr = (existing as any)?.staff;
      const full_name = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;
      const responseData = { ...existing, staff: undefined, full_name };
      return reply.send({ data: responseData, is_new: false });
    }

    // Check phone duplicate — if phone matches, update firebase_uid (handles dev seed data / UID migration)
    const { data: phoneDup } = await supabase
      .from('users')
      .select(`
        id, role, is_active, phone_number, is_verified, preferred_language,
        staff:staff_registry(full_name)
      `)
      .eq('phone_number', decoded.phone_number)
      .single();

    if (phoneDup) {
      if (!phoneDup.is_active) {
        return reply.status(403).send({ error: 'Account deactivated. Contact support.' });
      }
      // Update firebase_uid to real UID and record login
      await supabase.from('users').update({
        firebase_uid: decoded.uid,
        last_login_at: new Date().toISOString(),
        last_login_ip: request.ip,
        ...(body.data.fcm_token ? { fcm_token: body.data.fcm_token, fcm_token_updated_at: new Date().toISOString() } : {}),
      }).eq('id', phoneDup.id);
      writeAuditLog({
        user_id: phoneDup.id,
        firebase_uid: decoded.uid,
        action: AuditActions.LOGIN_SUCCESS,
        entity_type: 'users',
        ip_address: request.ip,
        metadata: { note: 'firebase_uid updated from phone match' },
      });
      const staffArr = (phoneDup as any)?.staff;
      const full_name = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;
      const responseData = { ...phoneDup, staff: undefined, full_name };
      return reply.send({ data: responseData, is_new: false });
    }

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        firebase_uid: decoded.uid,
        phone_number: decoded.phone_number,
        role: 'customer',
        preferred_language: body.data.preferred_language,
        is_active: true,
        is_verified: false,
        last_login_at: new Date().toISOString(),
        last_login_ip: request.ip,
        ...(body.data.fcm_token ? { fcm_token: body.data.fcm_token, fcm_token_updated_at: new Date().toISOString() } : {}),
      })
      .select(`
        id, role, is_active, phone_number, is_verified, preferred_language,
        staff:staff_registry(full_name)
      `)
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    writeAuditLog({
      user_id: user.id,
      firebase_uid: decoded.uid,
      action: AuditActions.OTP_VERIFIED,
      entity_type: 'users',
      metadata: { phone: decoded.phone_number },
      ip_address: request.ip,
    });

    const staffArr = (user as any)?.staff;
    const full_name = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;
    const responseData = { ...user, staff: undefined, full_name };
    return reply.status(201).send({ data: responseData, is_new: true });
  });

  // ── GET /auth/me ──────────────────────────────────────────
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let decoded;
    try {
      decoded = await verifyFirebaseToken(authHeader.slice(7));
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select(`
        id, firebase_uid, phone_number, role, is_active, is_verified,
        preferred_language, two_fa_enabled, last_login_at,
        customer:customers(id, full_name, branch, rank, camp_id, risk_level),
        staff:staff_registry(full_name)
      `)
      .eq('firebase_uid', decoded.uid)
      .single();

    if (!user) return reply.status(404).send({ error: 'User not found' });

    const staffArr = (user as any)?.staff;
    const full_name = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;
    const responseData = { ...user, staff: undefined, full_name };

    return reply.send({ data: responseData });
  });

  // ── POST /auth/otp-request (rate-limit tracking) ──────────
  app.post('/otp-request', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({ phone_number: z.string() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid phone number' });

    const allowed = await checkOtpRateLimit(body.data.phone_number, reply);
    if (!allowed) return;

    writeAuditLog({
      action: AuditActions.OTP_REQUESTED,
      entity_type: 'auth',
      metadata: { phone_number: body.data.phone_number },
      ip_address: request.ip,
    });

    // OTP is sent via Firebase client SDK — we just log the attempt
    return reply.send({ success: true, message: 'OTP send initiated via Firebase' });
  });

  // ── POST /auth/register-email ─────────────────────────────
  // Register a new staff user with email + password (no Firebase).
  // Restrict to admin and super_admin only.
  const { authenticate, requireAdmin } = await import('../middleware/auth');
  app.post('/register-email', { preHandler: [authenticate, requireAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const bcrypt = await import('bcryptjs');

    const body = z.object({
      email:              z.string().email(),
      phone_number:       z.string().regex(/^(\+94|0)[0-9]{7,12}$/, 'Invalid phone number format').optional().or(z.literal('')),
      password:           z.string().min(8, 'Password must be at least 8 characters'),
      role:               z.enum([
        'sales_officer', 'camp_officer', 'finance_officer', 'recovery_officer',
        'inventory_manager', 'accountant', 'admin', 'super_admin',
      ]).default('sales_officer'),
      preferred_language: z.enum(['en', 'si', 'ta']).default('en'),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        details: body.error.flatten().fieldErrors,
      });
    }

    const supabase = getSupabase();

    // Check email duplicate
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.data.email)
      .single();

    if (existingEmail) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    // Check phone duplicate (if provided)
    if (body.data.phone_number) {
      const { data: existingPhone } = await supabase
        .from('users')
        .select('id')
        .eq('phone_number', body.data.phone_number)
        .single();

      if (existingPhone) {
        return reply.status(409).send({ error: 'Phone number already registered' });
      }
    }

    // Hash password
    const password_hash = await bcrypt.hash(body.data.password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email:              body.data.email,
        phone_number:       body.data.phone_number || null,
        password_hash,
        role:               body.data.role,
        preferred_language: body.data.preferred_language,
        is_active:          true,
        is_verified:        false,
        auth_method:        'email',
      })
      .select('id, email, phone_number, role, is_active, is_verified, preferred_language, auth_method')
      .single();

    if (error) return reply.status(500).send({ error: error.message });

    writeAuditLog({
      user_id: user.id,
      action: 'EMAIL_USER_REGISTERED',
      entity_type: 'users',
      metadata: { email: body.data.email, role: body.data.role },
      ip_address: request.ip,
    });

    return reply.status(201).send({ data: user, is_new: true });
  });

  // ── POST /auth/login-email ────────────────────────────────
  // Email + password login → returns AIRVOICE JWT token.
  app.post('/login-email', async (request: FastifyRequest, reply: FastifyReply) => {
    const bcrypt = await import('bcryptjs');
    const { signEmailToken } = await import('../middleware/jwtAuth');

    const body = z.object({
      email:    z.string().email(),
      password: z.string().min(1),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const supabase = getSupabase();

    // Fetch user by email
    const { data: user } = await supabase
      .from('users')
      .select(`
        id, email, password_hash, role, is_active, is_verified,
        preferred_language, auth_method,
        staff:staff_registry(full_name)
      `)
      .eq('email', body.data.email)
      .single();

    if (!user || !user.password_hash) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return reply.status(403).send({ error: 'Account deactivated. Contact support.' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(body.data.password, user.password_hash);
    if (!passwordMatch) {
      writeAuditLog({
        user_id: user.id,
        action: 'LOGIN_FAILED_WRONG_PASSWORD',
        entity_type: 'users',
        metadata: { email: body.data.email },
        ip_address: request.ip,
      });
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Check staff role
    const staffRoles = [
      'sales_officer', 'camp_officer', 'finance_officer', 'recovery_officer',
      'inventory_manager', 'accountant', 'admin', 'super_admin',
    ];
    if (!staffRoles.includes(user.role)) {
      return reply.status(403).send({
        error: 'Access denied. This portal is for staff only.',
      });
    }

    // Sign AIRVOICE JWT
    const token = signEmailToken({
      userId: user.id,
      email:  user.email,
      role:   user.role,
      authMethod: 'email',
    });

    // Update last login
    await supabase.from('users').update({
      last_login_at: new Date().toISOString(),
      last_login_ip: request.ip,
    }).eq('id', user.id);

    writeAuditLog({
      user_id: user.id,
      action: AuditActions.LOGIN_SUCCESS,
      entity_type: 'users',
      metadata: { email: body.data.email, auth_method: 'email' },
      ip_address: request.ip,
    });

    const staffArr = (user as any)?.staff;
    const full_name = Array.isArray(staffArr) ? staffArr[0]?.full_name : staffArr?.full_name;

    return reply.send({
      data: {
        id:                 user.id,
        email:              user.email,
        role:               user.role,
        is_active:          user.is_active,
        is_verified:        user.is_verified,
        preferred_language: user.preferred_language,
        auth_method:        user.auth_method,
        full_name,
      },
      token,
    });
  });
}
