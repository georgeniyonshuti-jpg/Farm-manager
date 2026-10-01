/**
 * Cleva Farm shared login (ERPNext OAuth Authorization Code).
 *
 * Tenant ERPNext users become company_admin only — never platform superuser —
 * except the market-operator allowlist (default george@clevagroup.africa).
 */

import crypto from "crypto";
import { exchangeOAuthToken } from "./erpnext/erpnext.client.js";
import {
  ensureFarmCompanyForErp,
  getErpnextCompanyLinks,
} from "./erpnext/erpnext.config.js";
import { loadMarketHostCompany } from "./pipeline/marketHostCompany.js";

const ERPNEXT_BASE_URL = (process.env.ERPNEXT_BASE_URL || "https://erp.clevacredit.com").replace(
  /\/+$/,
  ""
);

/** Sole market-operator platform superuser emails (override via env). */
export const DEFAULT_PLATFORM_SUPERUSER_EMAILS = ["george@clevagroup.africa"];
/** Legacy seed that must be demoted away from platform superuser. */
export const LEGACY_PLATFORM_SUPERUSER_EMAILS = ["george@clevacredit.com"];

export function platformSuperuserEmails(env = process.env) {
  const raw = String(env.CLEVA_PLATFORM_SUPERUSER_EMAILS || "").trim();
  if (!raw) return [...DEFAULT_PLATFORM_SUPERUSER_EMAILS];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function isPlatformSuperuserIdentity(identity, env = process.env) {
  if (identity?.is_platform_superuser) return true;
  const email = String(identity?.email || "").trim().toLowerCase();
  return Boolean(email && platformSuperuserEmails(env).includes(email));
}

const BLOCKED_IDP_LABELS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "pos",
  "farm",
  "farmapi",
  "bi",
  "meta",
  "insights",
  "crm",
  "helpdesk",
  "builder",
  "studio",
  "portal",
  "billing",
  "login",
  "auth",
  "oauth",
  "sso",
  "signup",
  "mail",
  "smtp",
  "traefik",
]);

export function isClevaSsoEnabled() {
  return String(process.env.CLEVA_SSO_ENABLED ?? "false").toLowerCase() === "true";
}

export function clevaOauthClientId() {
  return String(process.env.CLEVA_OAUTH_CLIENT_ID || "").trim();
}

export function clevaOauthClientSecret() {
  return String(process.env.CLEVA_OAUTH_CLIENT_SECRET || "").trim();
}

export function clevaOauthScope() {
  return String(process.env.CLEVA_OAUTH_SCOPE || "all").trim() || "all";
}

export function defaultIdpOrigin() {
  try {
    if (process.env.CLEVA_OAUTH_AUTHORIZE_URL) {
      return new URL(process.env.CLEVA_OAUTH_AUTHORIZE_URL).origin;
    }
  } catch {
    /* fall through */
  }
  return ERPNEXT_BASE_URL;
}

export function normalizeIdpOrigin(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    if (isProd && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedIdpOrigin(origin) {
  const normalized = normalizeIdpOrigin(origin);
  if (!normalized) return false;
  if (normalized === defaultIdpOrigin()) return true;
  let hostname;
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const labels = hostname.split(".").filter(Boolean);
  let slug = null;
  if (hostname.endsWith(".cleva.rw") && labels.length === 3) slug = labels[0];
  else if (hostname.endsWith(".clevacredit.com") && labels.length === 3) slug = labels[0];
  if (!slug) return false;
  if (slug === "erp") return true;
  return !BLOCKED_IDP_LABELS.has(slug);
}

export function resolveIdpOrigin(raw) {
  if (raw == null || String(raw).trim() === "") return defaultIdpOrigin();
  const normalized = normalizeIdpOrigin(raw);
  if (!normalized || !isAllowedIdpOrigin(normalized)) {
    throw new Error("Invalid or disallowed IdP URL");
  }
  return normalized;
}

export function clevaOauthAuthorizeUrl(idpOrigin) {
  const origin = resolveIdpOrigin(idpOrigin);
  if (process.env.CLEVA_OAUTH_AUTHORIZE_URL && origin === defaultIdpOrigin()) {
    return process.env.CLEVA_OAUTH_AUTHORIZE_URL;
  }
  return `${origin}/api/method/frappe.integrations.oauth2.authorize`;
}

function clevaOauthUserinfoUrl(idpOrigin) {
  const origin = resolveIdpOrigin(idpOrigin);
  if (process.env.CLEVA_OAUTH_USERINFO_URL && origin === defaultIdpOrigin()) {
    return process.env.CLEVA_OAUTH_USERINFO_URL;
  }
  return `${origin}/api/method/clevafarm_integration.api.farm_sso.userinfo`;
}

function unwrapMessage(value) {
  if (value && typeof value === "object" && value.message) return value.message;
  return value;
}

/** Merge ERP farm_bootstrap role into department keys (additive; preserves admin edits). */
export function departmentKeysFromIdentity(identity, existingKeys = []) {
  const keys = new Set(Array.isArray(existingKeys) ? existingKeys : []);
  const erpRole = String(identity?.farm_bootstrap?.role || "").trim().toLowerCase();
  if (erpRole === "junior_vet") keys.add("junior_vet");
  return [...keys];
}

/** Map ERP farm_bootstrap app role → Farm PWA UserRole. */
export function mapErpAppRoleToPwaRole(erpRole) {
  const role = String(erpRole || "").trim().toLowerCase();
  switch (role) {
    case "laborer":
      return "laborer";
    case "junior_vet":
      return "vet";
    case "vet_manager":
      return "vet_manager";
    case "admin":
      return "company_admin";
    default:
      return null;
  }
}

export function resolvePwaRoleFromIdentity(identity, env = process.env) {
  if (isPlatformSuperuserIdentity(identity, env)) return "superuser";
  const bootstrap = identity?.farm_bootstrap;
  const fromBootstrap = mapErpAppRoleToPwaRole(bootstrap?.role);
  if (fromBootstrap) return fromBootstrap;
  if (identity?.is_admin) return "company_admin";
  return "company_admin";
}

function linkableCompanyNames(identity) {
  const rows = Array.isArray(identity?.linkable_companies) ? identity.linkable_companies : [];
  return [
    ...new Set(
      rows
        .map((row) => (typeof row === "string" ? row : row?.name))
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    ),
  ];
}

async function enableFarmModuleForCompany(origin, accessToken, company) {
  const url = `${origin}/api/method/clevafarm_integration.api.farm_sso.enable_farm_module_for_company`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ company }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      raw?.message || raw?.exc_type || `Enable Farm Manager failed (${res.status})`
    );
  }
}

/**
 * Map ERPNext Company names → Farm company rows linked in erpnext_config
 * for the same IdP base URL.
 */
export async function mapErpCompaniesToFarmLinks(erpCompanies, idpUrl) {
  const wanted = new Set((erpCompanies || []).map((c) => String(c).trim()).filter(Boolean));
  if (!wanted.size) return [];
  const idp = String(idpUrl || defaultIdpOrigin()).replace(/\/+$/, "");
  const links = await getErpnextCompanyLinks();
  return links.filter((l) => {
    if (!wanted.has(String(l.erpnextCompany || "").trim())) return false;
    const base = String(l.erpnextBaseUrl || "").replace(/\/+$/, "");
    // Legacy rows without base URL only match the default IdP.
    if (!base) return idp === defaultIdpOrigin();
    return base === idp;
  });
}

export async function ensureCompaniesFromErp(erpCompanies, opts = {}) {
  const idpUrl = String(opts.idpUrl || defaultIdpOrigin()).replace(/\/+$/, "");
  const tenantSubdomain = String(opts.tenantSubdomain || "")
    .trim()
    .toLowerCase();
  const names = [...new Set((erpCompanies || []).map((c) => String(c).trim()).filter(Boolean))];
  const out = [];
  for (const erpName of names) {
    const slug =
      tenantSubdomain && names.length === 1 ? tenantSubdomain : undefined;
    const row = await ensureFarmCompanyForErp(erpName, { idpUrl, slug });
    if (row) out.push(row);
  }
  return out;
}

export async function fetchClevaUserExists(email, idpOrigin) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) return false;
  const origin = resolveIdpOrigin(idpOrigin);
  const url = `${origin}/api/method/clevafarm_integration.api.farm_sso.cleva_user_exists?email=${encodeURIComponent(emailNorm)}`;
  const key = process.env.ERPNEXT_API_KEY || "";
  const secret = process.env.ERPNEXT_API_SECRET || "";
  if (!key || !secret) return false;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `token ${key}:${secret}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return false;
  const message = unwrapMessage(body);
  return Boolean(message?.exists);
}

/**
 * @param {{ code: string, redirectUri: string, idpUrl?: string }} input
 */
export async function exchangeClevaIdentity({ code, redirectUri, idpUrl }) {
  const clientId = clevaOauthClientId();
  const clientSecret = clevaOauthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Cleva OAuth is not configured on the Farm API.");
  }
  const origin = resolveIdpOrigin(idpUrl);

  const tokenPayload = await exchangeOAuthToken({
    code,
    redirectUri,
    clientId,
    clientSecret,
    baseUrl: origin,
  });
  const accessToken = tokenPayload?.access_token;
  if (!accessToken) {
    throw new Error("Cleva OAuth token response missing access_token.");
  }

  const userinfoRes = await fetch(clevaOauthUserinfoUrl(origin), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await userinfoRes.json().catch(() => ({}));
  if (!userinfoRes.ok) {
    throw new Error(
      raw?.message || raw?.error || `Cleva userinfo failed (${userinfoRes.status})`
    );
  }
  const identity = unwrapMessage(raw);
  const email = String(identity?.email || "").trim().toLowerCase();
  const name = String(identity?.name || email || "").trim();
  if (!email || !name) {
    throw new Error("Cleva userinfo missing email or name.");
  }
  let erpCompanies = Array.isArray(identity.erp_companies)
    ? identity.erp_companies.map(String)
    : [];
  const linkable = linkableCompanyNames(identity);
  const dedicatedTenant = Boolean(identity.dedicated_tenant);
  // Dedicated-tenant admins logging into Farm: enable Farm Manager when the
  // desk module is not on yet (same first-run idea as POS, without a setup page).
  if (!erpCompanies.length && identity.is_admin && dedicatedTenant && linkable.length) {
    for (const company of linkable) {
      await enableFarmModuleForCompany(origin, accessToken, company);
    }
    erpCompanies = linkable;
  }
  const farmBootstrap =
    identity?.farm_bootstrap && typeof identity.farm_bootstrap === "object"
      ? identity.farm_bootstrap
      : null;

  return {
    sub: String(identity.sub || email),
    email,
    name,
    is_admin: Boolean(identity.is_admin),
    is_platform_superuser: Boolean(identity.is_platform_superuser) || isPlatformSuperuserIdentity({ email }),
    erp_companies: erpCompanies,
    tenant_subdomain: identity.tenant_subdomain ? String(identity.tenant_subdomain) : null,
    idp_url: identity.idp_url ? String(identity.idp_url) : origin,
    idpOrigin: origin,
    farm_bootstrap: farmBootstrap,
  };
}

/**
 * Upsert Farm user from Cleva IdP.
 * Platform superuser only for the market-operator allowlist; all other SSO
 * users are company-scoped (company_admin or field roles).
 */
export async function syncClevaUserFromIdentity(identity, deps) {
  const {
    upsertUser,
    persistUserToDb,
    hashPassword,
    usersByEmail,
    usersById,
    getCompanyById,
    dbQuery,
  } = deps;

  const email = String(identity.email || "").trim().toLowerCase();
  const existingId = usersByEmail.get(email);
  const existing = existingId ? usersById.get(existingId) : null;
  const idpUrl = identity.idpOrigin || identity.idp_url || defaultIdpOrigin();
  const platformSuper = isPlatformSuperuserIdentity(identity);

  await ensureCompaniesFromErp(identity.erp_companies, {
    idpUrl,
    tenantSubdomain: identity.tenant_subdomain,
  });

  let links = await mapErpCompaniesToFarmLinks(identity.erp_companies, idpUrl);
  let company = null;

  if (links.length) {
    const preferred =
      existing?.companyId && links.some((l) => String(l.companyId) === String(existing.companyId))
        ? links.find((l) => String(l.companyId) === String(existing.companyId))
        : links[0];
    company = preferred ? await getCompanyById(preferred.companyId) : null;
  }

  if (!company && platformSuper && typeof dbQuery === "function") {
    const host = await loadMarketHostCompany(dbQuery);
    if (host.ok && host.company) {
      company = await getCompanyById(host.company.id);
    }
  }

  if (!company) {
    return { user: null, code: "no_companies" };
  }

  const pwaRole = resolvePwaRoleFromIdentity(identity);
  // Allowlist wins; never keep a stale superuser for other Cleva SSO accounts.
  const resolvedRole = platformSuper ? "superuser" : pwaRole === "superuser" ? "company_admin" : pwaRole;
  const fieldRoles = new Set(["laborer", "vet", "vet_manager", "dispatcher"]);
  const isFieldRole = fieldRoles.has(resolvedRole);
  const pageAccess =
    resolvedRole === "company_admin" || resolvedRole === "superuser"
      ? null
      : existing?.pageAccess ?? null;

  const row = {
    id: existing?.id || crypto.randomUUID(),
    email,
    displayName: identity.name,
    passwordHash: existing?.passwordHash || hashPassword(crypto.randomBytes(32).toString("hex")),
    role: resolvedRole,
    businessUnitAccess: isFieldRole ? "farm" : existing?.businessUnitAccess || "both",
    canViewSensitiveFinancial: !isFieldRole,
    departmentKeys: departmentKeysFromIdentity(identity, existing?.departmentKeys),
    pageAccess,
    companyId: company.id,
    companySlug: company.slug,
    companyName: company.name,
    authSource: "cleva",
  };
  upsertUser(row);
  await persistUserToDb(row);
  return { user: row, code: null, farmBootstrap: identity.farm_bootstrap ?? null };
}
