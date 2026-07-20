import { ReactNode } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';

interface RoleBasedAccessProps {
  roles?: string[];
  permissions?: string[];
  require?: 'any' | 'all'; // whether to require any or all roles/permissions
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Component to conditionally render content based on user role or permissions
 * Usage:
 *   <RoleBasedAccess roles={['finance_officer', 'admin']}>
 *     <FinancePanel />
 *   </RoleBasedAccess>
 *
 *   <RoleBasedAccess permissions={['manage_finance']} fallback={<div>No access</div>}>
 *     <FinancePanel />
 *   </RoleBasedAccess>
 */
export function RoleBasedAccess({
  roles,
  permissions,
  require = 'any',
  fallback,
  children,
}: RoleBasedAccessProps) {
  const { hasRole, canAny, canAll } = useRoleAccess();

  let hasAccess = false;

  if (roles) {
    hasAccess = hasRole(...roles);
  } else if (permissions) {
    hasAccess = require === 'all' ? canAll(permissions) : canAny(permissions);
  }

  if (!hasAccess) {
    return fallback ?? null;
  }

  return <>{children}</>;
}

export default RoleBasedAccess;
