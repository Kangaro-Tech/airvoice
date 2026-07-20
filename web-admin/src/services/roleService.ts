import { UserRole } from '@/store/authStore';

/**
 * Role Management API Calls
 */

interface RoleWithPermissions {
  name: UserRole;
  permissions: string[];
}

interface UserRoleUpdate {
  user_id: string;
  role: UserRole;
}

/**
 * Get all available roles and their permissions
 */
export async function getRoles(): Promise<RoleWithPermissions[]> {
  const response = await fetch('/api/admin/roles');
  if (!response.ok) throw new Error('Failed to fetch roles');
  return response.json();
}

/**
 * Get a specific role's permissions
 */
export async function getRolePermissions(role: UserRole): Promise<string[]> {
  const response = await fetch(`/api/admin/roles/${role}`);
  if (!response.ok) throw new Error(`Failed to fetch ${role} permissions`);
  const data = await response.json();
  return data.permissions;
}

/**
 * Update user role
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) throw new Error('Failed to update user role');
}

/**
 * Get all staff users with their roles
 */
export async function getStaffUsers(): Promise<Array<{
  id: string;
  name: string;
  email: string;
  phone_number: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
}>> {
  const response = await fetch('/api/admin/staff');
  if (!response.ok) throw new Error('Failed to fetch staff users');
  return response.json();
}

/**
 * Create a new staff user
 */
export async function createStaffUser(data: {
  phone_number: string;
  role: UserRole;
  name: string;
  email: string;
}): Promise<{ id: string; phone_number: string; role: UserRole }> {
  const response = await fetch('/api/admin/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create staff user');
  return response.json();
}

/**
 * Deactivate a user
 */
export async function deactivateUser(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
    method: 'PATCH',
  });
  if (!response.ok) throw new Error('Failed to deactivate user');
}

/**
 * Activate a user
 */
export async function activateUser(userId: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${userId}/activate`, {
    method: 'PATCH',
  });
  if (!response.ok) throw new Error('Failed to activate user');
}

/**
 * Audit log entry for role changes
 */
export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, any>;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(filters?: {
  action?: string;
  entity_type?: string;
  user_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, String(value));
    });
  }
  const response = await fetch(`/api/admin/audit-logs?${params}`);
  if (!response.ok) throw new Error('Failed to fetch audit logs');
  return response.json();
}
