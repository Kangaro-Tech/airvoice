import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { getSupabase } from '../config/supabase';

const SECRET = process.env.JWT_SECRET;
if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET env var is REQUIRED in production');
}
const JWT_SECRET = SECRET || 'DEV-ONLY-SECRET-CHANGE-IN-PRODUCTION';

export interface EmailAuthPayload {
  userId: string;
  email: string;
  role: string;
  authMethod: 'email';
}

/**
 * Signs a JWT for email-authenticated users.
 * Expires in 7 days (configurable via JWT_EXPIRES_IN env var).
 */
export function signEmailToken(payload: EmailAuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '1h') as jwt.SignOptions['expiresIn'],
    issuer: 'airvoice-api',
  });
}

/**
 * Dual-mode authenticate middleware.
 * Accepts EITHER:
 *  - Firebase ID token  (phone/OTP login)   → validated via Firebase Admin SDK
 *  - AIRVOICE JWT token (email/password login) → validated via jsonwebtoken
 *
 * Sets request.user on success.
 */
export async function authenticateDual(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Bearer token required' });
  }

  const token = authHeader.slice(7);

  // ── Try AIRVOICE JWT first (cheap, local verify) ──────────
  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'airvoice-api' }) as EmailAuthPayload;
    if (payload.authMethod === 'email') {
      const supabase = getSupabase();
      const { data: user } = await supabase
        .from('users')
        .select('id, firebase_uid, phone_number, email, role, is_active, is_verified, auth_method, custom_modules')
        .eq('id', payload.userId)
        .single();

      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' });
      }
      if (!user.is_active) {
        return reply.status(403).send({ error: 'Forbidden', message: 'Account deactivated. Contact support.' });
      }

      request.user = {
        id: user.id,
        firebase_uid: user.firebase_uid ?? '',
        phone_number: user.phone_number ?? '',
        role: user.role,
        is_active: user.is_active,
        is_verified: user.is_verified,
        custom_modules: user.custom_modules as string[] | undefined,
      };
      return;
    }
  } catch {
    // Not a valid AIRVOICE JWT — fall through to Firebase check
  }

  // ── Firebase ID token path (phone/OTP users) ──────────────
  try {
    const { verifyFirebaseToken } = await import('../config/firebase');
    const decoded = await verifyFirebaseToken(token);

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id, firebase_uid, phone_number, email, role, is_active, is_verified, custom_modules')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not registered. Please complete registration via /auth/register first.',
      });
    }
    if (!user.is_active) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Account deactivated. Contact support.' });
    }

    request.user = {
      id: user.id,
      firebase_uid: user.firebase_uid ?? '',
      phone_number: user.phone_number ?? '',
      role: user.role,
      is_active: user.is_active,
      is_verified: user.is_verified,
      custom_modules: user.custom_modules as string[] | undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    return reply.status(401).send({ error: 'Unauthorized', message });
  }
}
