import { UserRole } from '@/store/authStore';

export interface Permission {
  name: string;
  description: string;
}

export interface RoleConfig {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  color: string;
  icon: string;
}

export const ROLES: Record<UserRole, RoleConfig> = {
  super_admin: {
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access - all features and management capabilities',
    permissions: [
      'view_all',
      'create_all',
      'edit_all',
      'delete_all',
      'manage_users',
      'manage_roles',
      'view_reports',
      'manage_camps',
      'manage_finance',
      'manage_recovery',
      'manage_inventory',
      'audit_logs',
    ],
    color: 'bg-red-600',
    icon: '👑',
  },

  admin: {
    name: 'admin',
    displayName: 'Admin',
    description: 'System administrator with most features except camp setup',
    permissions: [
      'view_all',
      'create_all',
      'edit_all',
      'delete_all',
      'manage_users',
      'view_reports',
      'manage_finance',
      'manage_recovery',
      'manage_inventory',
      'audit_logs',
    ],
    color: 'bg-orange-600',
    icon: '⚙️',
  },

  finance_officer: {
    name: 'finance_officer',
    displayName: 'Finance Officer',
    description: 'Manages finance, expenses, payroll, and recovery operations',
    permissions: [
      'view_dashboard',
      'view_applications',
      'view_customers',
      'view_installments',
      'manage_finance',
      'manage_expenses',
      'manage_payroll',
      'manage_recovery',
      'view_guarantors',
      'view_cheque',
      'view_reports',
      'view_sales_officer_portal',
    ],
    color: 'bg-green-600',
    icon: '💰',
  },

  recovery_officer: {
    name: 'recovery_officer',
    displayName: 'Recovery Officer',
    description: 'Manages phone recovery and return operations',
    permissions: [
      'view_dashboard',
      'view_applications',
      'view_customers',
      'manage_recovery',
      'view_guarantors',
    ],
    color: 'bg-yellow-600',
    icon: '📱',
  },

  camp_officer: {
    name: 'camp_officer',
    displayName: 'Camp Officer',
    description: 'Manages camp portal and camp-related operations',
    permissions: [
      'view_dashboard',
      'view_notifications',
      'manage_camp_portal',
      'view_camp_operations',
    ],
    color: 'bg-blue-600',
    icon: '🏕️',
  },

  sales_officer: {
    name: 'sales_officer',
    displayName: 'Sales Officer',
    description: 'Manages applications, customers, and sales operations',
    permissions: [
      'view_dashboard',
      'view_notifications',
      'create_applications',
      'view_applications',
      'edit_applications',
      'manage_customers',
      'view_inventory',
      'manage_sales_portal',
      'view_finance',
    ],
    color: 'bg-indigo-600',
    icon: '📊',
  },

  inventory_manager: {
    name: 'inventory_manager',
    displayName: 'Inventory Manager',
    description: 'Manages phone inventory and stock',
    permissions: [
      'view_dashboard',
      'view_notifications',
      'view_inventory',
      'manage_inventory',
      'manage_stock_orders',
      'view_applications',
      'view_customers',
    ],
    color: 'bg-purple-600',
    icon: '📦',
  },

  accountant: {
    name: 'accountant',
    displayName: 'Accountant',
    description: 'Manages accounting and financial records',
    permissions: [
      'view_dashboard',
      'view_notifications',
      'view_finance',
      'manage_finance',
      'manage_expenses',
      'manage_payroll',
      'view_installments',
      'view_reports',
    ],
    color: 'bg-teal-600',
    icon: '📋',
  },

  guarantor: {
    name: 'guarantor',
    displayName: 'Guarantor',
    description: 'Limited access to guarantor-related information',
    permissions: [
      'view_own_profile',
      'view_own_applications',
    ],
    color: 'bg-gray-600',
    icon: '🤝',
  },

  customer: {
    name: 'customer',
    displayName: 'Customer',
    description: 'Limited access to customer-related information',
    permissions: [
      'view_own_profile',
      'view_own_applications',
      'view_notifications',
    ],
    color: 'bg-gray-500',
    icon: '👤',
  },

  system_operator: {
    name: 'system_operator',
    displayName: 'System Operator',
    description: 'Manages HR, Payroll, Attendance, Leave, and Audit Logs',
    permissions: [
      'view_dashboard',
      'view_notifications',
      'manage_hr',
      'manage_payroll',
      'manage_attendance',
      'manage_leaves',
      'manage_salary_advances',
      'manage_salary_deductions',
      'view_staff_profiles',
      'edit_staff_profiles',
      'audit_logs',
    ],
    color: 'bg-cyan-600',
    icon: '🖥️',
  },
};

export const PERMISSIONS: Record<string, Permission> = {
  view_all: { name: 'view_all', description: 'View all resources' },
  create_all: { name: 'create_all', description: 'Create any resource' },
  edit_all: { name: 'edit_all', description: 'Edit any resource' },
  delete_all: { name: 'delete_all', description: 'Delete any resource' },
  manage_users: { name: 'manage_users', description: 'Manage user accounts' },
  manage_roles: { name: 'manage_roles', description: 'Manage user roles' },
  view_dashboard: { name: 'view_dashboard', description: 'View dashboard' },
  view_notifications: { name: 'view_notifications', description: 'View notifications' },
  view_applications: { name: 'view_applications', description: 'View applications' },
  create_applications: { name: 'create_applications', description: 'Create applications' },
  edit_applications: { name: 'edit_applications', description: 'Edit applications' },
  view_customers: { name: 'view_customers', description: 'View customers' },
  manage_customers: { name: 'manage_customers', description: 'Manage customers' },
  view_installments: { name: 'view_installments', description: 'View installments' },
  manage_installments: { name: 'manage_installments', description: 'Manage installments' },
  view_inventory: { name: 'view_inventory', description: 'View inventory' },
  manage_inventory: { name: 'manage_inventory', description: 'Manage inventory' },
  manage_stock_orders: { name: 'manage_stock_orders', description: 'Manage stock orders' },
  view_finance: { name: 'view_finance', description: 'View finance' },
  manage_finance: { name: 'manage_finance', description: 'Manage finance' },
  manage_expenses: { name: 'manage_expenses', description: 'Manage expenses' },
  manage_payroll: { name: 'manage_payroll', description: 'Manage payroll' },
  view_guarantors: { name: 'view_guarantors', description: 'View guarantors' },
  view_cheque: { name: 'view_cheque', description: 'View cheque printer' },
  manage_recovery: { name: 'manage_recovery', description: 'Manage recovery' },
  view_reports: { name: 'view_reports', description: 'View reports' },
  manage_camps: { name: 'manage_camps', description: 'Manage camps' },
  manage_camp_portal: { name: 'manage_camp_portal', description: 'Manage camp portal' },
  view_camp_operations: { name: 'view_camp_operations', description: 'View camp operations' },
  manage_sales_portal: { name: 'manage_sales_portal', description: 'Manage sales portal' },
  view_sales_officer_portal: { name: 'view_sales_officer_portal', description: 'View sales officer portal' },
  audit_logs: { name: 'audit_logs', description: 'View audit logs' },
  view_own_profile: { name: 'view_own_profile', description: 'View own profile' },
  view_own_applications: { name: 'view_own_applications', description: 'View own applications' },
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | null, permission: string): boolean {
  if (!role || !ROLES[role]) return false;
  return ROLES[role].permissions.includes(permission);
}

/**
 * Check if a role has any of the given permissions
 */
export function hasAnyPermission(role: UserRole | null, permissions: string[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Check if a role has all of the given permissions
 */
export function hasAllPermissions(role: UserRole | null, permissions: string[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Get allowed roles for a given permission
 */
export function getRolesWithPermission(permission: string): UserRole[] {
  return Object.entries(ROLES)
    .filter(([_, config]) => config.permissions.includes(permission))
    .map(([role]) => role as UserRole);
}
