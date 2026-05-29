import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  canAccessPathByPageVisibility,
  canAccessRouteLaborerBlock,
  canAccessWorkspace,
  isSuperuser,
  roleAtLeast,
} from "../auth/permissions";
import type { ActiveWorkspace, UserRole } from "../auth/types";
import { stripTenantPrefix, tenantPath } from "../lib/tenancy";
import { AppLoadingScreen } from "../components/AppLoadingScreen";
import { AccessDeniedRedirect } from "./AccessDeniedRedirect";

function SessionLoadingScreen() {
  return <AppLoadingScreen />;
}

type ProtectedRouteProps = {
  requireAuth?: boolean;
  minimumRole?: UserRole;
  roles?: UserRole[];
  superuserOnly?: boolean;
  children?: React.ReactNode;
};

export function ProtectedRoute({
  requireAuth = true,
  minimumRole,
  roles,
  superuserOnly,
  children,
}: ProtectedRouteProps) {
  const { user, bootstrapped } = useAuth();
  const location = useLocation();

  if (!bootstrapped) {
    return <SessionLoadingScreen />;
  }

  if (requireAuth && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const appPath = stripTenantPrefix(location.pathname);

  if (
    user &&
    !isSuperuser(user) &&
    !canAccessRouteLaborerBlock(user, appPath)
  ) {
    return <AccessDeniedRedirect />;
  }

  if (user && !canAccessPathByPageVisibility(user, appPath)) {
    return <AccessDeniedRedirect />;
  }

  if (superuserOnly && !isSuperuser(user)) {
    return <AccessDeniedRedirect />;
  }

  if (user && roles?.length && !isSuperuser(user) && !roles.includes(user.role)) {
    return <AccessDeniedRedirect />;
  }

  if (user && minimumRole && !roleAtLeast(user, minimumRole)) {
    return <AccessDeniedRedirect />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/** Block routes when user lacks business-unit access (URL hacking). */
export function WorkspaceGate({
  workspace,
  children,
}: {
  workspace: ActiveWorkspace;
  children: React.ReactNode;
}) {
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return <SessionLoadingScreen />;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!canAccessWorkspace(user, workspace) && !isSuperuser(user)) {
    return <AccessDeniedRedirect />;
  }

  return <>{children}</>;
}

export function defaultHomePathForRole(role: UserRole): string {
  switch (role) {
    case "laborer":
    case "dispatcher":
      return "/dashboard/laborer";
    case "vet":
    case "vet_manager":
      return "/dashboard/vet";
    case "investor":
      return "/cleva/portfolio";
    default:
      return "/dashboard/management";
  }
}

export function defaultHomeForUser(role: UserRole, companySlug?: string): string {
  const path = defaultHomePathForRole(role);
  if (!companySlug) return path;
  return tenantPath(companySlug, path);
}
