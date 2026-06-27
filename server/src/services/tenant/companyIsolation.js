/**
 * Multi-tenant company isolation helpers (Farm Manager ↔ company UUID).
 */

export function isPlatformSuperuser(user) {
  return user?.role === "superuser";
}

/**
 * @param {{ companyId?: string | null, company_id?: string | null } | null | undefined} entity
 * @param {{ role?: string, companyId?: string | null } | null | undefined} user
 * @param {{ userCompanyId?: string | null, field?: string }} [opts]
 */
export function assertSameCompany(entity, user, opts = {}) {
  if (isPlatformSuperuser(user)) return true;
  const field = opts.field ?? "companyId";
  const userCo = user?.companyId ?? opts.userCompanyId ?? null;
  const entityCo = entity?.[field] ?? entity?.company_id ?? null;
  if (!userCo || !entityCo) return false;
  return String(entityCo) === String(userCo);
}

/**
 * @param {{ companyId?: string | null } | null | undefined} flock
 * @param {{ role?: string, companyId?: string | null } | null | undefined} user
 * @param {string | null | undefined} userCompanyId
 */
export function flockVisibleToUser(flock, user, userCompanyId) {
  if (isPlatformSuperuser(user)) return true;
  const scoped = userCompanyId ?? user?.companyId ?? null;
  if (!scoped || !flock?.companyId) return false;
  return String(flock.companyId) === String(scoped);
}

/**
 * Append strict flock company filter to SQL (no NULL bypass).
 * @param {string} sql
 * @param {unknown[]} params
 * @param {string} userCompanyId
 * @param {string} [flockAlias]
 */
export function appendSqlFlockCompanyFilter(sql, params, userCompanyId, flockAlias = "f") {
  params.push(userCompanyId);
  return `${sql} AND ${flockAlias}.company_id = $${params.length}::uuid`;
}

/**
 * Filter in-memory flock list for a user.
 * @param {Iterable<{ companyId?: string | null }>} flocks
 * @param {{ role?: string, companyId?: string | null } | null | undefined} user
 * @param {string | null | undefined} userCompanyId
 */
export function filterFlocksForUser(flocks, user, userCompanyId) {
  if (isPlatformSuperuser(user)) return [...flocks];
  const scoped = userCompanyId ?? user?.companyId ?? null;
  if (!scoped) return [];
  return [...flocks].filter((f) => String(f.companyId) === String(scoped));
}

/**
 * Check whether a flock_id in memory belongs to the user's company.
 * @param {string | null | undefined} flockId
 * @param {Map<string, { companyId?: string | null }>} flocksById
 * @param {{ role?: string, companyId?: string | null } | null | undefined} user
 * @param {string | null | undefined} userCompanyId
 */
export function memoryFlockIdVisible(flockId, flocksById, user, userCompanyId) {
  if (isPlatformSuperuser(user)) return true;
  const flock = flocksById.get(String(flockId ?? ""));
  return flockVisibleToUser(flock, user, userCompanyId);
}
