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

const CIG_HOST_SLUGS = new Set(["default-farm", "cleva-tech", "cleva-technologies"]);

/**
 * A Farm company that belongs to Cleva Investments Group.
 * These are internal companies: no free-trial clock and no plan limit.
 * @param {{ erpnextCompany?: string, erpnext_company?: string, erpnextBaseUrl?: string, erpnext_base_url?: string, slug?: string } | null | undefined} link
 */
export function isCigCompanyLink(link, env = process.env) {
  const cig = cigErpDefaults(env);
  const company = String(link?.erpnextCompany || link?.erpnext_company || "")
    .trim()
    .toLowerCase();
  const cigName = cig.erpnextCompany.trim().toLowerCase();
  if (company && cigName && company === cigName) return true;

  const raw = String(link?.erpnextBaseUrl || link?.erpnext_base_url || "").trim();
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    host = raw.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  }
  let cigHost = "";
  try {
    cigHost = new URL(cig.erpnextBaseUrl).hostname.toLowerCase();
  } catch {
    cigHost = "";
  }
  if (cigHost && host === cigHost) return true;
  const sub = String(cig.subdomain || "").trim().toLowerCase();
  if (sub && (host === sub || host.startsWith(`${sub}.`))) return true;

  const slug = String(link?.slug || "").trim().toLowerCase();
  return CIG_HOST_SLUGS.has(slug);
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
