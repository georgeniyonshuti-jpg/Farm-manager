import type { UserRole } from "../auth/types";

export function canEditFlockScheduleRole(role: UserRole): boolean {
  return ["superuser", "manager", "vet_manager"].includes(role);
}
