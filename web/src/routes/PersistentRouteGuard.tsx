import { useAuth } from "../auth/AuthContext";
import { isSuperuser, roleAtLeast } from "../auth/permissions";
import type { UserRole } from "../auth/types";

type Props = {
  roles?: UserRole[];
  superuserOnly?: boolean;
  minimumRole?: UserRole;
  children: React.ReactNode;
};

/**
 * RBAC guard for persistently mounted pages — returns null when denied (no redirect).
 * Use on routes wrapped in PersistentPageSlot so hidden pages do not hijack navigation.
 */
export function PersistentRouteGuard({ roles, superuserOnly, minimumRole, children }: Props) {
  const { user } = useAuth();
  if (!user) return null;
  if (superuserOnly && !isSuperuser(user)) return null;
  if (roles?.length && !isSuperuser(user) && !roles.includes(user.role)) return null;
  if (minimumRole && !roleAtLeast(user, minimumRole) && !isSuperuser(user)) return null;
  return <>{children}</>;
}
