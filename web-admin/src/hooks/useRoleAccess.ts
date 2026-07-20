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

  return {
    /**
     * Check if user has a specific permission
     */
    can: (permission: string) => {
      return hasPermission(user?.role ?? null, permission);
    },

    /**
     * Check if user has any of the given permissions
     */
    canAny: (permissions: string[]) => {
      return hasAnyPermission(user?.role ?? null, permissions);
    },

    /**
     * Check if user has all of the given permissions
     */
    canAll: (permissions: string[]) => {
      return hasAllPermissions(user?.role ?? null, permissions);
    },

    /**
     * Check if user has any of the given roles
     */
    hasRole: (...roles: string[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },

    /**
     * Check if user is a super admin
     */
    isSuperAdmin: () => user?.role === 'super_admin',

    /**
     * Check if user is an admin (super_admin or admin)
     */
    isAdmin: () => user?.role === 'super_admin' || user?.role === 'admin',

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
