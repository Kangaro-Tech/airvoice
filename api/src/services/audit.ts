import { getSupabase } from '../config/supabase';

interface AuditLogEntry {
  user_id?: string;
  firebase_uid?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit log entry.
 * This function should NEVER be awaited in the critical path — call without await
 * for non-blocking logging, or await when the audit is critical.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('audit_logs').insert({
    user_id: entry.user_id,
    firebase_uid: entry.firebase_uid,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    old_values: entry.old_values as any,
    new_values: entry.new_values as any,
    ip_address: entry.ip_address,
    user_agent: entry.user_agent,
    metadata: entry.metadata as any,
  });

  if (error) {
    // Log to console but don't throw — audit failure should not break the request
    console.error('[AUDIT] Failed to write audit log:', error.message, entry);
  }
}

/**
 * Common audit action constants
 */
export const AuditActions = {
  // Auth
  OTP_REQUESTED: 'OTP_REQUESTED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN_ACCESS_ATTEMPT: 'FORBIDDEN_ACCESS_ATTEMPT',

  // Customer
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_BLOCKED: 'CUSTOMER_BLOCKED',
  CUSTOMER_DOCUMENTS_UPLOADED: 'CUSTOMER_DOCUMENTS_UPLOADED',
  CUSTOMER_VERIFIED: 'CUSTOMER_VERIFIED',
  CUSTOMER_APP_LINKED: 'CUSTOMER_APP_LINKED',
  NIC_DUPLICATE_BLOCKED: 'NIC_DUPLICATE_BLOCKED',

  // Application
  APPLICATION_CREATED: 'APPLICATION_CREATED',
  APPLICATION_UPDATED: 'APPLICATION_UPDATED',
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  APPLICATION_STAGE_ADVANCED: 'APPLICATION_STAGE_ADVANCED',
  APPLICATION_APPROVED: 'APPLICATION_APPROVED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  APPLICATION_CANCELLED: 'APPLICATION_CANCELLED',
  SPECIAL_APPROVAL_REQUESTED: 'SPECIAL_APPROVAL_REQUESTED',
  SPECIAL_APPROVAL_GRANTED: 'SPECIAL_APPROVAL_GRANTED',
  PHONE_HANDOVER: 'PHONE_HANDOVER',
  AGREEMENT_GENERATED: 'AGREEMENT_GENERATED',
  AGREEMENT_SIGNED: 'AGREEMENT_SIGNED',

  // Deductions
  DEDUCTION_SUBMITTED: 'DEDUCTION_SUBMITTED',
  DEDUCTION_BATCH_SUBMITTED: 'DEDUCTION_BATCH_SUBMITTED',
  DEDUCTION_BATCH_VERIFIED: 'DEDUCTION_BATCH_VERIFIED',

  // Commission
  COMMISSION_RELEASED: 'COMMISSION_RELEASED',
  COMMISSION_PAID: 'COMMISSION_PAID',
  COMMISSION_FORFEITED: 'COMMISSION_FORFEITED',

  // Guarantor
  GUARANTOR_REQUEST_SENT: 'GUARANTOR_REQUEST_SENT',
  GUARANTOR_ACCEPTED: 'GUARANTOR_ACCEPTED',
  GUARANTOR_REJECTED: 'GUARANTOR_REJECTED',
  GUARANTOR_TRANSFER_INITIATED: 'GUARANTOR_TRANSFER_INITIATED',

  // Legacy import
  LEGACY_IMPORT_UPLOADED: 'LEGACY_IMPORT_UPLOADED',
  LEGACY_IMPORT_MAPPING_SAVED: 'LEGACY_IMPORT_MAPPING_SAVED',
  LEGACY_IMPORT_STARTED: 'LEGACY_IMPORT_STARTED',
  LEGACY_IMPORT_COMPLETED: 'LEGACY_IMPORT_COMPLETED',
  LEGACY_CUSTOMER_LINKED: 'LEGACY_CUSTOMER_LINKED',

  // Admin
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  CAMP_ASSIGNMENT_CHANGED: 'CAMP_ASSIGNMENT_CHANGED',
  CAMP_UPDATED: 'CAMP_UPDATED',
  REGIMENT_UPDATED: 'REGIMENT_UPDATED',

  // Payroll
  PAYROLL_RUN_CREATED: 'PAYROLL_RUN_CREATED',
  PAYROLL_RUN_APPROVED: 'PAYROLL_RUN_APPROVED',
  PAYROLL_RUN_PAID: 'PAYROLL_RUN_PAID',

  // Sales / Free Phones
  FREE_PHONE_REQUESTED: 'FREE_PHONE_REQUESTED',
  FREE_PHONE_APPROVED: 'FREE_PHONE_APPROVED',
  FREE_PHONE_REJECTED: 'FREE_PHONE_REJECTED',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];
