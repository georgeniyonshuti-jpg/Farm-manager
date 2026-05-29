import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";
import { resolveUserCompanySlug, tenantPath } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";

export function HomeRedirect() {
  const { user } = useAuth();
  const { flockCount, teamCount, trialExpired, loading } = useOnboardingStatus();
  if (!user) return <Navigate to="/login" replace />;
  const slug = resolveUserCompanySlug(user);
  if (loading) return null;
  if (trialExpired) return <Navigate to="/billing/trial-expired" replace />;
  const isFirstLogin =
    flockCount === 0 && teamCount <= 1 && (user.role === "manager" || user.role === "superuser");
  if (isFirstLogin) return <Navigate to={tenantPath(slug, "welcome")} replace />;
  return <Navigate to={defaultHomeForUser(user.role, slug)} replace />;
}
