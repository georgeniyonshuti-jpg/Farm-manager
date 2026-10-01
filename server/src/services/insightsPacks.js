/**
 * Insights pack preferences for Farm PWA Trends (Superset embed).
 * Stored per company in app_settings.
 */

export const DEFAULT_INSIGHTS_PACKS = [
  { id: "executive", label: "Executive", enabled: true },
  { id: "growth", label: "Growth & weight", enabled: true },
  { id: "feed", label: "Feed & efficiency", enabled: true },
  { id: "health", label: "Health & mortality", enabled: true },
  { id: "operations", label: "Operations", enabled: true },
  { id: "finance", label: "Finance & fair value", enabled: false },
];

export const ALLOWED_PACK_IDS = new Set(DEFAULT_INSIGHTS_PACKS.map((p) => p.id));

export function packsSettingsKey(companyId) {
  return `insights_packs:${String(companyId || "global")}`;
}

/**
 * @param {Record<string, boolean> | null | undefined} prefs
 * @returns {{ packs: Array<{ id: string, label: string, enabled: boolean }>, note: string }}
 */
export function mergePackPreferences(prefs) {
  const map = prefs && typeof prefs === "object" ? prefs : {};
  const packs = DEFAULT_INSIGHTS_PACKS.map((p) => ({
    ...p,
    enabled: Object.prototype.hasOwnProperty.call(map, p.id) ? Boolean(map[p.id]) : p.enabled,
  }));
  return {
    packs,
    note: "With all packs on you get the full Command Center. Turn some off to show only those packs.",
  };
}

/**
 * @param {unknown} input
 * @returns {Record<string, boolean>}
 */
export function normalizePackPayload(input) {
  /** @type {Record<string, boolean>} */
  const prefs = {};
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string" && ALLOWED_PACK_IDS.has(item)) {
        prefs[item] = true;
      } else if (item && typeof item === "object" && ALLOWED_PACK_IDS.has(String(item.id))) {
        prefs[String(item.id)] = Boolean(item.enabled ?? true);
      }
    }
    // Explicit list: unlisted packs become disabled
    for (const id of ALLOWED_PACK_IDS) {
      if (!Object.prototype.hasOwnProperty.call(prefs, id)) prefs[id] = false;
    }
    return prefs;
  }
  if (input && typeof input === "object") {
    for (const [id, enabled] of Object.entries(input)) {
      if (ALLOWED_PACK_IDS.has(id)) prefs[id] = Boolean(enabled);
    }
  }
  return prefs;
}
