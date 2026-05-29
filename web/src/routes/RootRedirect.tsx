import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLoadingScreen } from "../components/AppLoadingScreen";
import { tenantPath } from "../lib/tenancy";

export function RootRedirect() {
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped) return <AppLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  const slug = user.companySlug;
  if (!slug) return <Navigate to="/login" replace />;

  return <Navigate to={tenantPath(slug, "")} replace />;
}
