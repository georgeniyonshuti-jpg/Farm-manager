import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLoadingScreen } from "../components/AppLoadingScreen";
import { tenantPath } from "../lib/tenancy";

/** Redirects legacy paths (/farm/..., /dashboard/...) to /app/:slug/... */
export function LegacyTenantRedirect() {
  const { user, bootstrapped } = useAuth();
  const location = useLocation();

  if (!bootstrapped) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const slug = user.companySlug;
  if (!slug) return <Navigate to="/login" replace />;

  const dest = `${tenantPath(slug, location.pathname)}${location.search}${location.hash}`;
  return <Navigate to={dest} replace />;
}
