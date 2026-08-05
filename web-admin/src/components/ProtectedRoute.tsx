import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore, UserRole } from '@/store/authStore';

interface ProtectedRouteProps {
  roles?: UserRole[];
}

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, isInitializing, loginTimestamp, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (loginTimestamp) {
      const isExpired = Date.now() - loginTimestamp > 60 * 60 * 1000; // 1 hour
      if (isExpired) {
        logout();
      }
    }
  }, [loginTimestamp, logout, location.pathname]);

  // ── Wait for Firebase to restore session before making any routing decision.
  // Without this, a hard refresh sends the user to /login even when they are
  // still authenticated, because Zustand hydrates synchronously but Firebase's
  // onAuthStateChanged is always async.
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          {/* Spinner */}
          <div className="h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-base-muted text-sm font-medium tracking-wide">Loading AIRVOICE…</p>
        </div>
      </div>
    );
  }

  // Not authenticated → go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ── system_operator = root developer account — bypasses ALL role restrictions
  if (user.role === 'system_operator') {
    return <Outlet />;
  }

  // If user has custom modules explicitly assigned, allow access if the path matches
  if (user.custom_modules && Array.isArray(user.custom_modules)) {
    const allowedPaths = [...user.custom_modules, '/', '/dashboard', '/notifications', '/profile'];
    const isAllowed = allowedPaths.some(p => location.pathname === p || location.pathname.startsWith(`${p === '/' ? '/#prevent-match' : p}/`));
    
    // If they have custom modules, we rely on custom modules ONLY.
    if (isAllowed) {
      return <Outlet />;
    } else {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
            <p className="mt-2 text-gray-600">
              You do not have explicit custom module access to this section.
            </p>
          </div>
        </div>
      );
    }
  }

  // Authenticated but wrong role (default role-based access)
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2 text-gray-600">
            Your role ({user.role}) does not have access to this section.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
