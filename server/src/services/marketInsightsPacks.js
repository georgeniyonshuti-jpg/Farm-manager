/**
 * Market Insights pack preferences (Market ops → Analytics).
 * Stored per company in app_settings.
 */

export const DEFAULT_MARKET_INSIGHTS_PACKS = [
  { id: "overview", label: "Overview", enabled: true },
  { id: "supply", label: "Supply", enabled: true },
  { id: "demand", label: "Demand", enabled: true },
  { id: "scouts", label: "Scouts", enabled: true },
  { id: "sales", label: "Sales", enabled: true },
  { id: "acquisition", label: "Acquisition", enabled: true },
];

export const ALLOWED_MARKET_PACK_IDS = new Set(
  DEFAULT_MARKET_INSIGHTS_PACKS.map((p) => p.id)
);

export function marketPacksSettingsKey(companyId) {
  return `market_insights_packs:${String(companyId || "global")}`;
}

export function marketDashboardMapKey(companyId) {
  return `market_insights_dashboards:${String(companyId || "global")}`;
}

/**
 * @param {Record<string, boolean> | null | undefined} prefs
 * @returns {{ packs: Array<{ id: string, label: string, enabled: boolean }>, note: string }}
 */
export function mergeMarketPackPreferences(prefs) {
  const map = prefs && typeof prefs === "object" ? prefs : {};
  const packs = DEFAULT_MARKET_INSIGHTS_PACKS.map((p) => ({
    ...p,
    enabled: Object.prototype.hasOwnProperty.call(map, p.id) ? Boolean(map[p.id]) : p.enabled,
  }));
  return {
    packs,
    note: "Overview is liquidity and GMV. Supply / Demand are separate funnels. Scouts and Sales dig into field and money. Acquisition is channel reach and signups over time.",
  };
}

/**
 * @param {unknown} input
 * @returns {Record<string, boolean>}
 */
export function normalizeMarketPackPayload(input) {
  /** @type {Record<string, boolean>} */
  const prefs = {};
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string" && ALLOWED_MARKET_PACK_IDS.has(item)) {
        prefs[item] = true;
      } else if (item && typeof item === "object" && ALLOWED_MARKET_PACK_IDS.has(String(item.id))) {
        prefs[String(item.id)] = Boolean(item.enabled ?? true);
      }
    }
    for (const id of ALLOWED_MARKET_PACK_IDS) {
      if (!Object.prototype.hasOwnProperty.call(prefs, id)) prefs[id] = false;
    }
    return prefs;
  }
  if (input && typeof input === "object") {
    for (const [id, enabled] of Object.entries(input)) {
      if (ALLOWED_MARKET_PACK_IDS.has(id)) prefs[id] = Boolean(enabled);
    }
  }
  return prefs;
}

/** Default scout / seller / buyer expectations (ops can override via app_settings). */
export const DEFAULT_MARKET_EXPECTATIONS = {
  scoutSellersPerWeek: 4,
  scoutLotsPerWeek: 8,
  scoutBirdsPerWeek: 400,
  /** Recruitment: new activated sellers / scouts per calendar week. */
  newSellersPerWeek: 10,
  newScoutsPerWeek: 2,
  newBuyersPerWeek: 8,
  /** Account with no activation after this many days counts as dead. */
  deadAfterDays: 14,
  sellerDaysToFirstListing: 7,
  buyerDaysToFirstDemand: 5,
  matchRateTargetPct: 40,
  sellThroughTargetPct: 55,
};

const EXPECTATION_KEYS = new Set(Object.keys(DEFAULT_MARKET_EXPECTATIONS));

/**
 * @param {unknown} input
 * @returns {typeof DEFAULT_MARKET_EXPECTATIONS}
 */
export function normalizeMarketExpectations(input) {
  const base = { ...DEFAULT_MARKET_EXPECTATIONS };
  if (!input || typeof input !== "object") return base;
  for (const [k, v] of Object.entries(input)) {
    if (!EXPECTATION_KEYS.has(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    base[k] = n;
  }
  return base;
}
