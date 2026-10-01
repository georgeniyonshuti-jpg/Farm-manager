import type { SessionUser, UserRole } from "../auth/types";

/** True for coop laborers and junior vets (same field UI as laborers). */
export function isLaborerLocaleUser(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "laborer") return true;
  if (user.erpAppRole === "junior_vet") return true;
  if (user.role === "vet" && user.departmentKeys.includes("junior_vet")) return true;
  return false;
}

export function laborerLocaleFromUser(
  role: UserRole | undefined,
  departmentKeys: string[],
  erpAppRole?: string
): boolean {
  if (role === "laborer") return true;
  if (erpAppRole === "junior_vet") return true;
  if (role === "vet" && departmentKeys.includes("junior_vet")) return true;
  return false;
}
