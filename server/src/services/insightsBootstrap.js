/**
 * Seed Insights pack prefs / market dashboard maps when a company is created.
 */

import { packsSettingsKey, normalizePackPayload, DEFAULT_INSIGHTS_PACKS } from "./insightsPacks.js";
import {
  marketPacksSettingsKey,
  marketDashboardMapKey,
  normalizeMarketPackPayload,
  DEFAULT_MARKET_INSIGHTS_PACKS,
} from "./marketInsightsPacks.js";
import { dashboardMapFromEnv, normalizeDashboardMap } from "./superset/marketDashboardMap.js";

async function upsertSetting(dbQuery, key, value) {
  await dbQuery(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ($1, $2)
     ON CONFLICT (setting_key) DO NOTHING`,
    [key, JSON.stringify(value)]
  );
}

/**
 * Default farm Trends packs (enabled flags only — UUIDs still come from ERP Insights meta).
 * @param {string} companyId
 * @param {Function} dbQuery
 */
export async function bootstrapFarmInsightsPacks(companyId, dbQuery) {
  if (!companyId || !dbQuery) return;
  const prefs = {};
  for (const p of DEFAULT_INSIGHTS_PACKS) prefs[p.id] = p.enabled;
  await upsertSetting(dbQuery, packsSettingsKey(companyId), normalizePackPayload(prefs));
}

/**
 * Market Analytics packs + optional Superset dashboard UUID map from env.
 * @param {string} companyId
 * @param {Function} dbQuery
 */
export async function bootstrapMarketInsights(companyId, dbQuery) {
  if (!companyId || !dbQuery) return;
  const prefs = {};
  for (const p of DEFAULT_MARKET_INSIGHTS_PACKS) prefs[p.id] = p.enabled;
  await upsertSetting(dbQuery, marketPacksSettingsKey(companyId), normalizeMarketPackPayload(prefs));

  const map = normalizeDashboardMap(dashboardMapFromEnv());
  if (Object.keys(map).length) {
    await upsertSetting(dbQuery, marketDashboardMapKey(companyId), map);
  }
}

/**
 * Full bootstrap used on company create / market-host ensure.
 * @param {string} companyId
 * @param {Function} dbQuery
 * @param {{ marketHost?: boolean }} [opts]
 */
export async function bootstrapCompanyInsights(companyId, dbQuery, opts = {}) {
  await bootstrapFarmInsightsPacks(companyId, dbQuery);
  if (opts.marketHost !== false) {
    await bootstrapMarketInsights(companyId, dbQuery);
  }
}
