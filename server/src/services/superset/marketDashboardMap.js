/**
 * Resolve Market Command Center dashboard UUIDs from env + app_settings.
 */

import { ALLOWED_MARKET_PACK_IDS, marketDashboardMapKey } from "../marketInsightsPacks.js";
import { getSupersetPublicUrl, isSupersetGuestConfigured } from "./guestToken.js";

/**
 * @param {Record<string, string> | null | undefined} map
 * @returns {Record<string, string>}
 */
export function normalizeDashboardMap(map) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    const id = String(k || "").trim();
    const uuid = String(v || "").trim();
    if ((ALLOWED_MARKET_PACK_IDS.has(id) || id === "mega") && uuid) out[id] = uuid;
  }
  return out;
}

/** Env defaults shared across tenants until per-company override exists. */
export function dashboardMapFromEnv() {
  return normalizeDashboardMap({
    mega: process.env.MARKET_INSIGHTS_DASHBOARD_UUID || "",
    overview: process.env.MARKET_INSIGHTS_PACK_OVERVIEW || "",
    supply: process.env.MARKET_INSIGHTS_PACK_SUPPLY || "",
    demand: process.env.MARKET_INSIGHTS_PACK_DEMAND || "",
    scouts: process.env.MARKET_INSIGHTS_PACK_SCOUTS || "",
    sales: process.env.MARKET_INSIGHTS_PACK_SALES || "",
    acquisition: process.env.MARKET_INSIGHTS_PACK_ACQUISITION || "",
  });
}

/**
 * @param {string | null} companyId
 * @param {Function | null} dbQuery
 * @param {boolean} hasDb
 */
export async function loadMarketDashboardMap(companyId, dbQuery, hasDb) {
  const fromEnv = dashboardMapFromEnv();
  if (!hasDb || !dbQuery || !companyId) return fromEnv;
  try {
    const r = await dbQuery("SELECT setting_value FROM app_settings WHERE setting_key = $1", [
      marketDashboardMapKey(companyId),
    ]);
    if (!r.rows.length) return fromEnv;
    let parsed;
    try {
      parsed = JSON.parse(r.rows[0].setting_value);
    } catch {
      return fromEnv;
    }
    return { ...fromEnv, ...normalizeDashboardMap(parsed) };
  } catch {
    return fromEnv;
  }
}

/**
 * @param {string} companyId
 * @param {Record<string, string>} map
 * @param {Function} dbQuery
 */
export async function saveMarketDashboardMap(companyId, map, dbQuery) {
  await dbQuery(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [marketDashboardMapKey(companyId), JSON.stringify(normalizeDashboardMap(map))]
  );
}

/**
 * @param {Record<string, string>} map
 */
export function packDashboardsFromMap(map) {
  /** @type {Record<string, string>} */
  const packs = {};
  for (const id of ALLOWED_MARKET_PACK_IDS) {
    if (map[id]) packs[id] = map[id];
  }
  return packs;
}

/**
 * Superset embed is available when we have a public URL, guest credentials,
 * and at least one dashboard UUID.
 * @param {Record<string, string>} map
 */
export function isMarketSupersetEmbedReady(map) {
  const hasUuid = Boolean(map.mega) || Object.values(packDashboardsFromMap(map)).some(Boolean);
  return Boolean(getSupersetPublicUrl() && isSupersetGuestConfigured() && hasUuid);
}
