/**
 * Tenant-scoped company admin RBAC helpers.
 */

import { isPlatformSuperuser } from "./companyIsolation.js";

export const COMPANY_ADMIN_ROLE = "company_admin";

/** Roles assignable by platform superuser (includes company_admin). */
export const ALL_ASSIGNABLE_ROLES = [
  "laborer",
  "dispatcher",
  "procurement_officer",
  "sales_coordinator",
  "vet",
  "vet_manager",
  "investor",
  "manager",
  COMPANY_ADMIN_ROLE,
];

/** Roles assignable by company_admin within their tenant. */
export const COMPANY_ADMIN_ASSIGNABLE_ROLES = [...ALL_ASSIGNABLE_ROLES];

/**
 * @param {{ role?: string } | null | undefined} user
 */
export function isCompanyAdmin(user) {
  return user?.role === COMPANY_ADMIN_ROLE;
}

/**
 * @param {{ role?: string } | null | undefined} user
 */
export function isUserManagementAdmin(user) {
  return isPlatformSuperuser(user) || isCompanyAdmin(user);
}

/**
 * @param {{ role?: string } | null | undefined} actor
 */
export function assignableRolesForActor(actor) {
  if (isPlatformSuperuser(actor)) return [...ALL_ASSIGNABLE_ROLES, "superuser"];
  if (isCompanyAdmin(actor)) return [...COMPANY_ADMIN_ASSIGNABLE_ROLES];
  return [];
}

/**
 * @param {{ role?: string } | null | undefined} actor
 * @param {string} role
 */
export function actorCanAssignRole(actor, role) {
  const r = String(role ?? "").trim();
  if (!r) return false;
  return assignableRolesForActor(actor).includes(r);
}

/**
 * @param {{ role?: string, companyId?: string | null } | null | undefined} actor
 * @param {{ companyId?: string | null, company_id?: string | null, role?: string } | null | undefined} targetUser
 * @param {string | null | undefined} actorCompanyId
 */
export function actorCanManageUser(actor, targetUser, actorCompanyId) {
  if (!targetUser) return false;
  if (isPlatformSuperuser(actor)) return true;
  if (String(targetUser.role ?? "") === "superuser") return false;
  const actorCo = actorCompanyId ?? actor?.companyId ?? null;
  const targetCo = targetUser.companyId ?? targetUser.company_id ?? null;
  if (!actorCo || !targetCo) return false;
  return String(actorCo) === String(targetCo);
}

/**
 * @param {{ role?: string, companyId?: string | null } | null | undefined} actor
 * @param {string | null | undefined} bodyCompanyId
 * @param {string | null | undefined} actorCompanyId
 */
export function resolveAssignCompanyId(actor, bodyCompanyId, actorCompanyId) {
  if (isPlatformSuperuser(actor)) {
    const fromBody = String(bodyCompanyId ?? "").trim();
    return fromBody || actorCompanyId || null;
  }
  return actorCompanyId ?? actor?.companyId ?? null;
}
