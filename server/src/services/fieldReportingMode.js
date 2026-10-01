/** Company field reporting mode: who submits house-round data in the field. */

export const FIELD_REPORTING_MODES = ["laborer_rounds", "vet_only", "both", "none"];

/**
 * @param {string | null | undefined} mode
 * @returns {'laborer_rounds' | 'vet_only' | 'both' | 'none'}
 */
export function normalizeFieldReportingMode(mode) {
  const m = String(mode ?? "").trim().toLowerCase();
  if (m === "laborer_rounds" || m === "both" || m === "none") return m;
  return "vet_only";
}

export function isJuniorVetUser(user) {
  if (!user) return false;
  return user.role === "vet" && Array.isArray(user.departmentKeys) && user.departmentKeys.includes("junior_vet");
}

export function canUseLaborerTranslate(user) {
  if (!user) return false;
  if (user.role === "laborer" || user.role === "dispatcher") return true;
  return isJuniorVetUser(user);
}

/**
 * @param {{ role?: string, departmentKeys?: string[] } | null | undefined} user
 * @param {string | null | undefined} mode
 */
export function shouldShowLaborerRoundCheckin(user, mode) {
  if (!user) return false;
  if (isJuniorVetUser(user)) return false;
  const m = normalizeFieldReportingMode(mode);
  if (m === "vet_only" || m === "none") return false;
  return user.role === "laborer" || user.role === "dispatcher";
}

/**
 * @param {{ role?: string, departmentKeys?: string[] } | null | undefined} user
 */
export function shouldUseVetVisitSchedule(user) {
  if (!user) return false;
  if (isJuniorVetUser(user)) return true;
  return user.role === "vet";
}
