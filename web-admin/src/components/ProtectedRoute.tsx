import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore, UserRole } from '@/store/authStore';

interface ProtectedRouteProps {
  roles?: UserRole[];
}

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, isInitializing } = useAuthStore();

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

  // Authenticated but wrong role
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
