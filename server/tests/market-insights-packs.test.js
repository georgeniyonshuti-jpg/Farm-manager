import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MARKET_INSIGHTS_PACKS,
  mergeMarketPackPreferences,
  normalizeMarketPackPayload,
  marketPacksSettingsKey,
  marketDashboardMapKey,
} from "../src/services/marketInsightsPacks.js";
import {
  normalizeDashboardMap,
  packDashboardsFromMap,
  isMarketSupersetEmbedReady,
} from "../src/services/superset/marketDashboardMap.js";

describe("marketInsightsPacks", () => {
  it("settings keys are namespaced", () => {
    assert.equal(marketPacksSettingsKey("abc"), "market_insights_packs:abc");
    assert.equal(marketDashboardMapKey("abc"), "market_insights_dashboards:abc");
  });

  it("defaults enable all five packs", () => {
    const { packs } = mergeMarketPackPreferences(null);
    assert.equal(packs.length, 5);
    assert.ok(packs.every((p) => p.enabled));
    assert.deepEqual(
      packs.map((p) => p.id),
      DEFAULT_MARKET_INSIGHTS_PACKS.map((p) => p.id)
    );
  });

  it("normalizeMarketPackPayload turns unlisted off for arrays", () => {
    const prefs = normalizeMarketPackPayload([{ id: "overview", enabled: true }]);
    assert.equal(prefs.overview, true);
    assert.equal(prefs.supply, false);
    assert.equal(prefs.sales, false);
  });
});

describe("marketDashboardMap", () => {
  it("normalizes only known pack ids", () => {
    const map = normalizeDashboardMap({
      overview: "uuid-1",
      junk: "x",
      mega: "uuid-mega",
    });
    assert.deepEqual(map, { overview: "uuid-1", mega: "uuid-mega" });
    assert.deepEqual(packDashboardsFromMap(map), { overview: "uuid-1" });
  });

  it("embed ready requires url + credentials + uuid", () => {
    const keys = [
      "SUPERSET_URL",
      "MARKET_INSIGHTS_SUPERSET_URL",
      "SUPERSET_ACCESS_TOKEN",
      "SUPERSET_USERNAME",
      "SUPERSET_PASSWORD",
    ];
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      assert.equal(isMarketSupersetEmbedReady({ mega: "u" }), false);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });
});

