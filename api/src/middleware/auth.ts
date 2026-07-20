import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyFirebaseToken } from '../config/firebase';
import { getSupabase } from '../config/supabase';
import { writeAuditLog } from '../services/audit';

export type UserRole =
  | 'customer' | 'guarantor' | 'sales_officer' | 'camp_officer'
  | 'finance_officer' | 'recovery_officer' | 'inventory_manager'
  | 'accountant' | 'admin' | 'super_admin';

export interface AuthenticatedUser {
  id: string;
  firebase_uid: string;
  phone_number: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

import { authenticateDual } from './jwtAuth';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Use our dual-mode authenticator that handles both Firebase and locally signed JWTs.
  await authenticateDual(request, reply);
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(request.user.role)) {
      writeAuditLog({
        user_id: request.user.id,
        firebase_uid: request.user.firebase_uid,
        action: 'FORBIDDEN_ACCESS_ATTEMPT',
        entity_type: 'api',
        entity_id: request.url,
        metadata: { required_roles: allowedRoles, user_role: request.user.role },
        ip_address: request.ip,
      });
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Required roles: ${allowedRoles.join(', ')}. Your role: ${request.user.role}`,
      });
    }
  };
}

export const requireStaff = requireRole(
  'sales_officer', 'camp_officer', 'finance_officer', 'recovery_officer',
  'inventory_manager', 'accountant', 'admin', 'super_admin'
);
export const requireFinance = requireRole('finance_officer', 'accountant', 'admin', 'super_admin');
export const requireAdmin   = requireRole('admin', 'super_admin');
export const requireSuperAdmin = requireRole('super_admin');

export async function checkOtpRateLimit(phoneNumber: string, reply: FastifyReply): Promise<boolean> {
  const supabase = getSupabase();
  const windowMs = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS ?? '600000', 10);
  const maxAttempts = parseInt(process.env.OTP_RATE_LIMIT_MAX ?? '3', 10);

  const { data: user } = await supabase
    .from('users').select('otp_attempts,otp_locked_until').eq('phone_number', phoneNumber).single();

  if (user?.otp_locked_until) {
    const lockedUntil = new Date(user.otp_locked_until);
    if (lockedUntil > new Date()) {
      const retryAfter = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      reply.status(429).send({ error: 'Too Many Requests', message: `Try again in ${Math.ceil(retryAfter / 60)} minutes.`, retry_after_seconds: retryAfter });
      return false;
    }
  }
  return true;
}
