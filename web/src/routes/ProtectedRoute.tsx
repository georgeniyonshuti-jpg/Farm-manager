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
import { AppLoadingScreen } from "../components/AppLoadingScreen";

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

  // FIX: RBAC — laborer/dispatcher blocked paths → /unauthorized (not silent redirect home)
  if (
    user &&
    !isSuperuser(user) &&
    !canAccessRouteLaborerBlock(user, location.pathname)
  ) {
    return <Navigate to="/unauthorized" replace state={{ from: location }} />;
  }

  if (user && !canAccessPathByPageVisibility(user, location.pathname)) {
    return <Navigate to="/unauthorized" replace state={{ from: location }} />;
  }

  // FIX: RBAC — role-only routes reject non–superusers without access
  if (superuserOnly && !isSuperuser(user)) {
    return <Navigate to="/unauthorized" replace state={{ from: location }} />;
  }

  // FIX: RBAC — superuser may access every route; others must match allowed roles
  if (user && roles?.length && !isSuperuser(user) && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace state={{ from: location }} />;
  }

  // FIX: RBAC — minimum role hierarchy (superuser already passes roleAtLeast)
  if (user && minimumRole && !roleAtLeast(user, minimumRole)) {
    return <Navigate to="/unauthorized" replace state={{ from: location }} />;
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

  // FIX: RBAC — wrong workspace URL → /unauthorized; superuser may use both workspaces
  if (!canAccessWorkspace(user, workspace) && !isSuperuser(user)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export function defaultHomeForUser(role: UserRole): string {
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
