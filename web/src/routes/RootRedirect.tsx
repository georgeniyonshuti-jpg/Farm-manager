import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { captureIdpFromLocation } from "../auth/ClevaOAuth";
import { AppLoadingScreen } from "../components/AppLoadingScreen";
import { resolveUserCompanySlug, tenantPath } from "../lib/tenancy";

export function RootRedirect() {
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped) return <AppLoadingScreen />;
  if (!user) {
    // Desk Connect opens /?idp=https://tenant… — keep idp across redirect to /login.
    captureIdpFromLocation();
    const search = typeof window !== "undefined" ? window.location.search : "";
    return <Navigate to={`/login${search}`} replace />;
  }

  return <Navigate to={tenantPath(resolveUserCompanySlug(user), "")} replace />;
}
