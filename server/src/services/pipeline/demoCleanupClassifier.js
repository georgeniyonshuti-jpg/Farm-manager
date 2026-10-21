/**
 * Classify demo vs real rows for prod cleanup under the CIG host.
 * Never deletes the host company or default-farm.
 */

export const PROTECTED_SLUGS = new Set(["cleva-tech", "default-farm", "cleva-technologies"]);
export const DEFAULT_FARM_ID = "00000000-0000-4000-8000-000000000001";

const DEMO_EMAIL_RE =
  /@(demo\.com|example\.com|mailinator\.com|test\.com)$/i;
const DEMO_EMAIL_LOCAL_RE = /^(demo|test|fake|sample)([.+_-]|$)/i;
const DEMO_NAME_RE =
  /\b(cleva\s*tech\s*farm|demo\s*farm|test\s*farm|sample\s*farm)\b/i;
const DEMO_SEED_NAMES = new Set([
  "cleva tech farm",
  "demo farm",
  "test farm",
  "sample farm",
  "default farm",
]);

/**
 * @param {string | null | undefined} email
 */
export function isDemoEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (DEMO_EMAIL_RE.test(e)) return true;
  const local = e.split("@")[0] || "";
  return DEMO_EMAIL_LOCAL_RE.test(local);
}

/**
 * @param {string | null | undefined} name
 */
export function isDemoName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return false;
  if (DEMO_SEED_NAMES.has(n)) return true;
  return DEMO_NAME_RE.test(n);
}

/**
 * @param {{
 *   email?: string|null,
 *   fullName?: string|null,
 *   role?: string|null,
 *   companySlug?: string|null,
 *   companyId?: string|null,
 *   hasMarketOnboarding?: boolean,
 *   keepIds?: Set<string>,
 *   id?: string|null,
 * }} row
 */
export function classifyUserForCleanup(row) {
  const id = String(row.id || "");
  if (row.keepIds?.has(id)) {
    return { action: "keep", reason: "keep_list" };
  }
  if (row.role === "superuser") {
    return { action: "keep", reason: "superuser" };
  }
  if (row.companyId === DEFAULT_FARM_ID || row.companySlug === "default-farm") {
    if (isDemoEmail(row.email) || isDemoName(row.fullName)) {
      return { action: "delete", reason: "default_farm_demo" };
    }
  }
  if (isDemoEmail(row.email)) {
    if (row.hasMarketOnboarding && !isDemoEmail(row.email)) {
      return { action: "keep", reason: "market_signup" };
    }
    // Demo emails always delete even if somehow onboarding exists.
    return { action: "delete", reason: "demo_email" };
  }
  if (row.hasMarketOnboarding) {
    return { action: "keep", reason: "market_signup" };
  }
  if (isDemoName(row.fullName)) {
    return { action: "delete", reason: "demo_name" };
  }
  return { action: "keep", reason: "real_or_unknown" };
}

/**
 * @param {{
 *   id?: string|null,
 *   displayName?: string|null,
 *   companySlug?: string|null,
 *   ownerEmail?: string|null,
 *   keepIds?: Set<string>,
 * }} row
 */
export function classifyFarmProfileForCleanup(row) {
  const id = String(row.id || "");
  if (row.keepIds?.has(id)) {
    return { action: "keep", reason: "keep_list" };
  }
  if (PROTECTED_SLUGS.has(String(row.companySlug || ""))) {
    if (isDemoName(row.displayName) || isDemoEmail(row.ownerEmail)) {
      return { action: "delete", reason: "demo_profile_on_host" };
    }
    return { action: "keep", reason: "host_real_profile" };
  }
  if (isDemoName(row.displayName) || isDemoEmail(row.ownerEmail)) {
    return { action: "delete", reason: "demo_profile" };
  }
  return { action: "keep", reason: "real_profile" };
}

/**
 * @param {{ slug?: string|null, name?: string|null, id?: string|null, keepIds?: Set<string> }} row
 */
export function classifyCompanyForCleanup(row) {
  const id = String(row.id || "");
  if (row.keepIds?.has(id)) return { action: "keep", reason: "keep_list" };
  if (id === DEFAULT_FARM_ID) return { action: "keep", reason: "default_farm_protected" };
  const slug = String(row.slug || "");
  if (PROTECTED_SLUGS.has(slug)) return { action: "keep", reason: "host_protected" };
  if (isDemoName(row.name) || /demo|test|sample/i.test(slug)) {
    return { action: "delete", reason: "demo_company" };
  }
  return { action: "keep", reason: "real_company" };
}
