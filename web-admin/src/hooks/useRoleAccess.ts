import { useAuthStore } from '@/store/authStore';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@/config/roles';

/**
 * Hook to check role-based access and permissions
 * Usage:
 *   const { can, hasRole } = useRoleAccess();
 *   if (can('manage_finance')) { ... }
 *   if (hasRole('finance_officer', 'admin')) { ... }
 */
export function useRoleAccess() {
  const { user } = useAuthStore();

  // system_operator is the root developer account — always grants full access
  const isSystemOperator = user?.role === 'system_operator';

  return {
    /**
     * Check if user has a specific permission
     */
    can: (permission: string) => {
      if (isSystemOperator) return true;
      return hasPermission(user?.role ?? null, permission);
    },

    /**
     * Check if user has any of the given permissions
     */
    canAny: (permissions: string[]) => {
      if (isSystemOperator) return true;
      return hasAnyPermission(user?.role ?? null, permissions);
    },

    /**
     * Check if user has all of the given permissions
     */
    canAll: (permissions: string[]) => {
      if (isSystemOperator) return true;
      return hasAllPermissions(user?.role ?? null, permissions);
    },

    /**
     * Check if user has any of the given roles.
     * system_operator matches admin/super_admin checks but NOT specific lower roles
     * (so they get the admin dashboard, not the finance_officer dashboard).
     */
    hasRole: (...roles: string[]) => {
      if (!user) return false;
      // system_operator acts as super_admin for dashboard routing
      if (isSystemOperator) {
        return roles.some(r => ['super_admin', 'admin', 'system_operator'].includes(r));
      }
      return roles.includes(user.role);
    },

    /**
     * Check if user is a super admin
     */
    isSuperAdmin: () => user?.role === 'super_admin' || isSystemOperator,

    /**
     * Check if user is an admin (super_admin or admin)
     */
    isAdmin: () => user?.role === 'super_admin' || user?.role === 'admin' || isSystemOperator,

    /**
     * Check if user is a staff member (not customer or guarantor)
     */
    isStaff: () => {
      return user?.role && !['customer', 'guarantor'].includes(user.role);
    },

    /**
     * Get current user role
     */
    role: user?.role ?? null,

    /**
     * Get current user
     */
    user: user,
  };
}
