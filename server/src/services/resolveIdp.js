/**
 * Resolve Cleva ERP IdP origin from subdomain or email for signup/login.
 * Email path: optional saas adminEmail (tenant desk only; never control-plane).
 * Never returns a tenant list to the client.
 */

import {
  defaultIdpOrigin,
  isAllowedIdpOrigin,
  normalizeIdpOrigin,
  resolveIdpOrigin,
} from "./clevaSso.js";

const TENANT_BASE =
  String(process.env.CLEVA_TENANT_BASE_DOMAIN || process.env.BASE_DOMAIN || "cleva.rw")
    .trim()
    .replace(/^\.+/, "") || "cleva.rw";

const resolveAttempts = new Map();
const RESOLVE_WINDOW_MS = 15 * 60 * 1000;
const RESOLVE_MAX = 20;

export function rateLimitResolve(key) {
  const now = Date.now();
  let entry = resolveAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RESOLVE_WINDOW_MS };
    resolveAttempts.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= RESOLVE_MAX;
}

/**
 * Turn "test2" or "https://test2.cleva.rw" into an allowed IdP origin.
 * @returns {{ ok: true, idp: string } | { ok: false, error: string }}
 */
export function resolveSubdomainToIdp(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return { ok: false, error: "Enter your company subdomain (e.g. test2)." };
  }
  try {
    if (/^https?:\/\//i.test(value) || value.includes(".")) {
      const idp = resolveIdpOrigin(value);
      return { ok: true, idp };
    }
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug.length < 2) {
      return { ok: false, error: "Invalid subdomain." };
    }
    const idp = resolveIdpOrigin(`https://${slug}.${TENANT_BASE}`);
    return { ok: true, idp };
  } catch {
    return {
      ok: false,
      error: "That site is not a valid Cleva ERP address. Check the subdomain from your desk URL.",
    };
  }
}

/** Operator / control-plane hosts must never be chosen from an email lookup. */
export function isControlPlaneIdp(origin) {
  const normalized = normalizeIdpOrigin(origin);
  if (!normalized) return true;
  if (normalized === defaultIdpOrigin()) return true;
  try {
    return new URL(normalized).hostname.toLowerCase().split(".")[0] === "erp";
  } catch {
    return true;
  }
}

export function tenantDeskIdp(origin) {
  const normalized = normalizeIdpOrigin(origin);
  if (!normalized || !isAllowedIdpOrigin(normalized) || isControlPlaneIdp(normalized)) {
    return null;
  }
  return normalized;
}

async function lookupSaasTenantByAdminEmail(email) {
  const lookupUrl = String(process.env.CLEVA_SAAS_LOOKUP_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.CLEVA_SAAS_LOOKUP_SECRET || "").trim();
  if (lookupUrl && secret) {
    try {
      const res = await fetch(`${lookupUrl}/api/internal/lookup-idp`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(8_000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.found && body?.idp) {
        return tenantDeskIdp(body.idp);
      }
    } catch {
      /* fall through */
    }
  }

  const dbUrl = String(process.env.CLEVA_SAAS_DATABASE_URL || "").trim();
  if (!dbUrl) return null;
  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: dbUrl, max: 1 });
    try {
      const r = await pool.query(
        `SELECT site_url, subdomain
         FROM tenants
         WHERE lower(admin_email) = lower($1)
           AND status IN ('active', 'grace')
           AND site_url IS NOT NULL AND site_url <> ''
         ORDER BY created_at DESC NULLS LAST
         LIMIT 1`,
        [email]
      );
      const row = r.rows[0];
      if (!row) return null;
      if (row.site_url) {
        return tenantDeskIdp(row.site_url);
      }
      if (row.subdomain) {
        const built = resolveSubdomainToIdp(row.subdomain);
        if (built.ok) return tenantDeskIdp(built.idp);
      }
    } finally {
      await pool.end().catch(() => {});
    }
  } catch (e) {
    console.error("[cleva-sso] saas db lookup:", e instanceof Error ? e.message : e);
  }
  return null;
}

/**
 * Resolve IdP from work email. Same response shape whether found or not
 * (found false → client asks for subdomain again).
 * @returns {Promise<{ found: boolean, idp: string | null }>}
 */
export async function resolveIdpFromEmail(email) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) {
    return { found: false, idp: null };
  }

  const fromSaas = tenantDeskIdp(await lookupSaasTenantByAdminEmail(emailNorm));
  if (fromSaas) {
    return { found: true, idp: fromSaas };
  }

  return { found: false, idp: null };
}
