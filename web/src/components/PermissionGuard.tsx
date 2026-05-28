import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasPermission, roleAtLeast, type PermissionKey } from "../auth/permissions";
import type { UserRole } from "../auth/types";

type PermissionGuardProps = {
  /** Minimum role required (hierarchy: laborer → … → superuser) */
  role?: UserRole;
  /** Fine-grained permission (sensitive financial, etc.) */
  permission?: PermissionKey;
  /** All listed roles may see children */
  anyRole?: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Hides sensitive UI (net profit, bank balances) from roles without clearance.
 * Prefer route-level guards too — this is defense in depth.
 */
export function PermissionGuard({
  role: minRole,
  permission,
  anyRole,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { user } = useAuth();

  if (anyRole?.length) {
    if (!user || !anyRole.includes(user.role)) return <>{fallback}</>;
  } else if (minRole && !roleAtLeast(user, minRole)) {
    return <>{fallback}</>;
  }

  if (permission && !hasPermission(user, permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
