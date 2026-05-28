import { useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import type { UserRole } from "../auth/types";

export type DashboardRoleView = "laborer" | "vet" | "management";

function roleToView(role: UserRole | undefined): DashboardRoleView {
  if (role === "laborer" || role === "dispatcher") return "laborer";
  if (role === "vet" || role === "vet_manager") return "vet";
  return "management";
}

export function useRoleDashboardData() {
  const { user } = useAuth();
  const role = user?.role;
  const view = useMemo(() => roleToView(role), [role]);
  return { role, user, view };
}
