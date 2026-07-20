/**
 * notify.ts — Central notification dispatch service
 *
 * Call `notify(event)` anywhere in the backend to fan-out
 * in-app notifications to the right users.
 * All calls are fire-and-forget (no await needed in the caller).
 */
import { getSupabase } from '../config/supabase';

// In-memory registry of active SSE connections mapping user_id -> Set of FastifyReplies
export const sseClients = new Map<string, Set<any>>();

export function registerSseClient(userId: string, reply: any) {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId)!.add(reply);
}

export function unregisterSseClient(userId: string, reply: any) {
  const clients = sseClients.get(userId);
  if (clients) {
    clients.delete(reply);
    if (clients.size === 0) {
      sseClients.delete(userId);
    }
  }
}

// ── Types ────────────────────────────────────────────────────
export type NotifyEvent =
  | { kind: 'application_submitted';  ref: string; appId: string; customerId: string; salesOfficerId?: string }
  | { kind: 'application_approved';   ref: string; appId: string; stage: string;      triggeredBy: string }
  | { kind: 'application_rejected';   ref: string; appId: string; reason?: string;    triggeredBy: string }
  | { kind: 'application_pending_review'; ref: string; appId: string; stage: string } // needs review
  | { kind: 'stock_added';           modelName: string; imei: string; qty?: number;   addedBy: string }
  | { kind: 'stock_order_placed';    modelName: string; qty: number;                  orderedBy: string }
  | { kind: 'stock_low';             modelName: string; remaining: number }
  | { kind: 'inventory_updated';     modelName: string; field: string;                updatedBy: string }
  | { kind: 'audit_alert';           action: string;    entityType: string;            entityId?: string; userId?: string }
  | { kind: 'deduction_processed';   ref: string; status: string; amount?: number; customerName?: string; installmentId: string }
  | { kind: 'customer_added';        customerName: string; nic: string }
  | { kind: 'expense_pending';       amount: number; categoryName: string }
  | { kind: 'payroll_run_created';   runMonth: string }
  | { kind: 'guarantor_request_pending'; requesterName: string; applicationRef: string }
  | { kind: 'inventory_issue';       message: string }
  | { kind: 'nic_mismatch';          customerName: string; nic: string; message: string }
  | { kind: 'application_drafted';   ref: string; appId: string }
  | { kind: 'special_approval_request'; customerName: string; requestId: string; salesOfficerName: string; reason: string }
  | { kind: 'special_approval_resolved'; customerName: string; requestId: string; granted: boolean; salesOfficerId: string }
  | { kind: 'legacy_import_completed'; totalRows: number; importedRows: number; duplicateRows: number; newCustomers: number; newCamps: number; batchId: string }
  | { kind: 'camp_added'; campName: string }
  | { kind: 'camp_deductions_imported'; campName: string; batchId: string };

// Role → which roles get this notification
const ROLE_TARGETS: Record<NotifyEvent['kind'], string[]> = {
  application_submitted:      ['admin', 'super_admin', 'sales_officer'],
  application_approved:       ['admin', 'super_admin'],
  application_rejected:       ['admin', 'super_admin'],
  application_pending_review: ['admin', 'super_admin', 'finance_officer', 'camp_officer'],
  stock_added:                ['admin', 'super_admin', 'inventory_manager'],
  stock_order_placed:         ['admin', 'super_admin', 'inventory_manager'],
  stock_low:                  ['admin', 'super_admin', 'inventory_manager'],
  inventory_updated:          ['admin', 'super_admin', 'inventory_manager'],
  audit_alert:                ['admin', 'super_admin'],
  deduction_processed:        ['finance_officer', 'accountant', 'admin', 'super_admin'],
  customer_added:             ['admin', 'super_admin'],
  expense_pending:            ['finance_officer', 'accountant', 'admin', 'super_admin'],
  payroll_run_created:        ['finance_officer', 'accountant', 'admin', 'super_admin'],
  guarantor_request_pending:  ['finance_officer', 'recovery_officer', 'admin', 'super_admin'],
  inventory_issue:            ['admin', 'super_admin', 'inventory_manager'],
  nic_mismatch:               ['admin', 'super_admin'],
  application_drafted:        ['admin', 'super_admin', 'sales_officer'],
  special_approval_request:   ['admin', 'super_admin'],
  special_approval_resolved:  ['sales_officer'],
  legacy_import_completed:    ['admin', 'super_admin', 'finance_officer'],
  camp_added:                 ['admin', 'super_admin'],
  camp_deductions_imported:   ['camp_officer'],
};

// ── Build the notification payload for each event ────────────
function buildPayload(event: NotifyEvent): { type: string; title: string; body: string; action_url: string | null } {
  switch (event.kind) {
    case 'application_submitted':
      return {
        type: 'application_status',
        title: `📋 New Application Submitted`,
        body: `Application ${event.ref} has been submitted and is waiting for Sales Review.`,
        action_url: `/applications/${event.appId}`,
      };
    case 'application_approved':
      return {
        type: 'application_status',
        title: `✅ Application Approved`,
        body: `Application ${event.ref} passed ${event.stage.replace('_', ' ')} and moved to the next stage.`,
        action_url: `/applications/${event.appId}`,
      };
    case 'application_rejected':
      return {
        type: 'application_status',
        title: `❌ Application Rejected`,
        body: `Application ${event.ref} was rejected.${event.reason ? ` Reason: ${event.reason}` : ''}`,
        action_url: `/applications/${event.appId}`,
      };
    case 'application_pending_review':
      return {
        type: 'application_status',
        title: `⏳ Application Needs Review`,
        body: `Application ${event.ref} is waiting for ${event.stage.replace('_', ' ')}.`,
        action_url: `/applications/${event.appId}`,
      };
    case 'stock_added':
      return {
        type: 'inventory_update',
        title: `📦 New Stock Added`,
        body: `${event.modelName} (IMEI: ${event.imei}) has been added to inventory.`,
        action_url: `/inventory`,
      };
    case 'stock_order_placed':
      return {
        type: 'inventory_update',
        title: `🚚 Stock Order Placed`,
        body: `A new order for ${event.qty}x ${event.modelName} has been placed.`,
        action_url: `/stock-orders`,
      };
    case 'stock_low':
      return {
        type: 'inventory_alert',
        title: `⚠️ Low Stock Alert`,
        body: `${event.modelName} has only ${event.remaining} unit(s) remaining in stock.`,
        action_url: `/inventory`,
      };
    case 'inventory_updated':
      return {
        type: 'inventory_update',
        title: `✏️ Inventory Updated`,
        body: `${event.modelName} ${event.field} was updated.`,
        action_url: `/inventory`,
      };
    case 'audit_alert':
      return {
        type: 'audit_alert',
        title: `🔍 Audit: ${event.action.replace(/_/g, ' ')}`,
        body: `${event.entityType} record ${event.entityId ?? ''} was affected.`,
        action_url: null,
      };
    case 'deduction_processed':
      return {
        type: 'finance_update',
        title: `💵 Deduction ${event.status.replace(/_/g, ' ')}`,
        body: `Installment ${event.ref} updated to ${event.status.replace(/_/g, ' ')}${event.amount ? ` for LKR ${event.amount.toLocaleString()}` : ''}.`,
        action_url: `/installments`,
      };
    case 'customer_added':
      return {
        type: 'customer_update',
        title: `👤 New Customer Registered`,
        body: `Customer ${event.customerName} (NIC: ${event.nic}) has been registered in the system.`,
        action_url: `/customers`,
      };
    case 'expense_pending':
      return {
        type: 'finance_update',
        title: `🧾 Expense Awaiting Approval`,
        body: `A new expense in ${event.categoryName} for LKR ${event.amount.toLocaleString()} needs review.`,
        action_url: `/expenses`,
      };
    case 'payroll_run_created':
      return {
        type: 'finance_update',
        title: `🗓 Payroll Draft Created`,
        body: `A new payroll run for ${event.runMonth} is ready for review.`,
        action_url: `/payroll`,
      };
    case 'guarantor_request_pending':
      return {
        type: 'guarantor_update',
        title: `📝 Guarantor Request Pending`,
        body: `${event.requesterName} submitted ${event.applicationRef} and awaits guarantor approval.`,
        action_url: `/guarantors`,
      };
    case 'inventory_issue':
      return {
        type: 'inventory_alert',
        title: `🚨 Inventory Issue Detected`,
        body: event.message,
        action_url: `/inventory`,
      };
    case 'nic_mismatch':
      return {
        type: 'document_alert',
        title: `⚠️ NIC Document Mismatch`,
        body: `NIC check failed for ${event.customerName} (${event.nic}): ${event.message}`,
        action_url: `/customers`,
      };
    case 'application_drafted':
      return {
        type: 'application_status',
        title: `📝 Application Drafted`,
        body: `Application ${event.ref} has been created as draft.`,
        action_url: `/applications/${event.appId}`,
      };
    case 'special_approval_request':
      return {
        type: 'special_approval',
        title: `🔔 Special Approval Requested`,
        body: `${event.salesOfficerName} requested special approval for ${event.customerName}. Reason: ${event.reason}`,
        action_url: `/applications?special_approval=pending`,
      };
    case 'special_approval_resolved':
      return {
        type: 'special_approval',
        title: event.granted ? `✅ Special Approval Granted` : `❌ Special Approval Rejected`,
        body: `Your special approval request for ${event.customerName} has been ${event.granted ? 'approved' : 'rejected'} by an admin.`,
        action_url: `/applications`,
      };
    case 'legacy_import_completed':
      return {
        type: 'legacy_import',
        title: `📥 Legacy Import Completed`,
        body: `Import finished: ${event.totalRows} rows processed — ${event.importedRows} imported, ${event.duplicateRows} duplicates, ${event.newCustomers} new customers added, ${event.newCamps} new camps added.`,
        action_url: `/legacy-import/${event.batchId}`,
      };
    case 'camp_added':
      return {
        type: 'system',
        title: `🏕️ New Camp/Regiment Added`,
        body: `Camp "${event.campName}" was automatically added to the system during a legacy import.`,
        action_url: `/admin/camps`,
      };
    case 'camp_deductions_imported':
      return {
        type: 'finance_update',
        title: `💵 Deductions Imported`,
        body: `New deductions have been imported for soldiers in ${event.campName}.`,
        action_url: `/customers`,
      };
  }
}

function getNotificationType(type: string): string {
  switch (type) {
    case 'application_status':
    case 'special_approval':
      return 'application_update';
    case 'finance_update':
      return 'payment_confirmed';
    case 'inventory_update':
    case 'inventory_alert':
    case 'audit_alert':
    case 'customer_update':
    case 'document_alert':
      return 'system';
    case 'guarantor_update':
    case 'guarantor_request':
    case 'guarantor_response':
      return 'guarantor_request';
    default:
      return 'system';
  }
}

// ── Fan-out to target users ──────────────────────────────────
export async function notify(event: NotifyEvent, targetUserId?: string): Promise<void> {
  const sb = getSupabase();
  const { kind } = event;
  const roles = ROLE_TARGETS[kind] ?? ['admin', 'super_admin'];

  let users: { id: string }[];
  if (targetUserId) {
    // Direct notification to a specific user
    users = [{ id: targetUserId }];
  } else {
    // Fan-out by role
    const { data } = await sb
      .from('users')
      .select('id')
      .in('role', roles)
      .is('deleted_at', null);
    users = data ?? [];
  }

  if (!users || users.length === 0) {
    console.log(`[NOTIFY] No users found for event kind: ${kind}`);
    return;
  }

  const payload = buildPayload(event);
  const now = new Date().toISOString();

  const rows = users.map((u: { id: string }) => ({
    user_id:     u.id,
    type:        getNotificationType(payload.type),
    title:       payload.title,
    body:        payload.body,
    action_url:  payload.action_url,
    entity_type: kind,
    read_at:     null,
    fcm_sent:    false,
    sms_sent:    false,
    created_at:  now,
  }));

  console.log(`[NOTIFY] Creating ${rows.length} notification(s) for event: ${kind}`, {
    users: users.map(u => u.id),
    type: payload.type,
    title: payload.title,
  });

  const { error, data } = await sb.from('notifications').insert(rows).select();
  if (error) {
    console.error(`[NOTIFY] ❌ Failed to insert notifications for ${kind}:`, error.message, error.details);
    return;
  }

  console.log(`[NOTIFY] ✅ Successfully created ${data?.length ?? rows.length} notification(s) for ${kind}`);

  // Push SSE real-time broadcast
  for (const user of users) {
    const clients = sseClients.get(user.id);
    if (clients && clients.size > 0) {
      const message = JSON.stringify({
        type: 'notification',
        data: {
          type: payload.type,
          title: payload.title,
          body: payload.body,
          action_url: payload.action_url,
        }
      });
      for (const client of clients) {
        try {
          client.raw.write(`data: ${message}\n\n`);
        } catch (err) {
          console.error('[SSE] Failed to write to client:', err);
        }
      }
    }
  }
}
