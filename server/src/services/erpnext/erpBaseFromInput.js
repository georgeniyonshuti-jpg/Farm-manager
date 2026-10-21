/**
 * Resolve ERPNext tenant site URL from subdomain / full URL / known CIG aliases.
 */

import { resolveSubdomainToIdp } from "../resolveIdp.js";

const TENANT_BASE =
  String(process.env.CLEVA_TENANT_BASE_DOMAIN || process.env.BASE_DOMAIN || "cleva.rw")
    .trim()
    .replace(/^\.+/, "") || "cleva.rw";

/** Well-known CIG (Cleva Investments Group) site + Company name. */
export function cigErpDefaults(env = process.env) {
  const base = String(env.ERPNEXT_CIG_BASE_URL || `https://cig.${TENANT_BASE}`)
    .trim()
    .replace(/\/+$/, "");
  const company = String(env.ERPNEXT_CIG_COMPANY || "Cleva Investments Group").trim();
  const subdomain = (() => {
    try {
      return new URL(base).hostname.split(".")[0] || "cig";
    } catch {
      return "cig";
    }
  })();
  return { erpnextBaseUrl: base, erpnextCompany: company, subdomain };
}

/**
 * @param {{ erpnextBaseUrl?: string, subdomain?: string } | null | undefined} input
 * @returns {{ ok: true, erpnextBaseUrl: string, subdomain: string | null } | { ok: false, error: string }}
 */
export function resolveErpBaseFromInput(input) {
  const baseRaw = String(input?.erpnextBaseUrl || "").trim();
  const subRaw = String(input?.subdomain || "").trim();

  if (baseRaw) {
    try {
      if (/^https?:\/\//i.test(baseRaw)) {
        const u = new URL(baseRaw);
        return {
          ok: true,
          erpnextBaseUrl: u.origin.replace(/\/+$/, ""),
          subdomain: u.hostname.split(".")[0] || null,
        };
      }
    } catch {
      return { ok: false, error: "Invalid ERPNext base URL." };
    }
    // Treat non-URL base as subdomain
    const fromSub = resolveSubdomainToIdp(baseRaw);
    if (!fromSub.ok) return { ok: false, error: fromSub.error };
    return {
      ok: true,
      erpnextBaseUrl: fromSub.idp,
      subdomain: baseRaw.toLowerCase().replace(/[^a-z0-9-]/g, "") || null,
    };
  }

  if (subRaw) {
    const fromSub = resolveSubdomainToIdp(subRaw);
    if (!fromSub.ok) return { ok: false, error: fromSub.error };
    return {
      ok: true,
      erpnextBaseUrl: fromSub.idp,
      subdomain: subRaw.toLowerCase().replace(/[^a-z0-9-]/g, "") || null,
    };
  }

  const fallback = String(process.env.ERPNEXT_BASE_URL || "https://erp.clevacredit.com").replace(
    /\/+$/,
    ""
  );
  return { ok: true, erpnextBaseUrl: fallback, subdomain: null };
}
