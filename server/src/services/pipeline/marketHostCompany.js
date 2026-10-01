/** Legacy single-tenant anchor — never a marketplace home. See docs/tenant-policy.md. */
export const DEFAULT_FARM_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_FARM_SLUG = "default-farm";
export const DEFAULT_MARKET_HOST_SLUG = "cleva-technologies";

/**
 * Resolve how to look up the Cleva Technologies host tenant.
 * Missing or default-farm config is a hard fail — do not invent a company.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function marketHostLookup(env = process.env) {
  const id = String(env.MARKET_HOST_COMPANY_ID || "").trim();
  const slug = String(env.MARKET_HOST_COMPANY_SLUG || DEFAULT_MARKET_HOST_SLUG).trim();
  if (id) {
    if (id === DEFAULT_FARM_COMPANY_ID) {
      return { ok: false, error: "Market host cannot be the default farm." };
    }
    return { ok: true, by: "id", value: id };
  }
  if (!slug || slug === DEFAULT_FARM_SLUG) {
    return { ok: false, error: "MARKET_HOST_COMPANY_ID or MARKET_HOST_COMPANY_SLUG is required." };
  }
  return { ok: true, by: "slug", value: slug };
}

export function isMarketSignupRequest(req) {
  const from = String(req?.body?.from ?? req?.query?.from ?? "").trim().toLowerCase();
  return from === "market";
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string, name?: string, slug?: string }> }>} dbQuery
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function loadMarketHostCompany(dbQuery, env = process.env) {
  const lookup = marketHostLookup(env);
  if (!lookup.ok) return lookup;
  try {
    const r =
      lookup.by === "id"
        ? await dbQuery(
            `SELECT id::text AS id, name, slug FROM companies WHERE id = $1::uuid LIMIT 1`,
            [lookup.value]
          )
        : await dbQuery(`SELECT id::text AS id, name, slug FROM companies WHERE slug = $1 LIMIT 1`, [
            lookup.value,
          ]);
    const row = r.rows[0];
    if (!row) {
      return { ok: false, error: "Market host company is not configured." };
    }
    if (row.id === DEFAULT_FARM_COMPANY_ID || row.slug === DEFAULT_FARM_SLUG) {
      return { ok: false, error: "Market host cannot be the default farm." };
    }
    return { ok: true, company: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Market host lookup failed." };
  }
}
