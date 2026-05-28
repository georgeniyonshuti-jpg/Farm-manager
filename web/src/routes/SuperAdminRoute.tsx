import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AccessDeniedRedirect } from "./AccessDeniedRedirect";

export function SuperAdminRoute() {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) return null;
  if (user?.role !== "superuser") return <AccessDeniedRedirect />;
  return <Outlet />;
}
