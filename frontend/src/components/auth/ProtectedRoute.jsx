import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Gate for everything under /app. No session -> bounce to /login, remembering
 * where they were going so login can send them back.
 *
 * This is a UX guard, not the security boundary: the real enforcement is the
 * backend rejecting unauthenticated requests (401) and Postgres RLS scoping
 * every row to the caller's org.
 */
export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950"
        data-testid="auth-loading">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking your session…
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
