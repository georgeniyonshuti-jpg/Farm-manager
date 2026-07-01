import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getReferenceMarketPricing,
  getConfigVersion,
  initializeMemoryDefaults,
  applyAdminSystemConfigPut,
} from "../systemConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverJs = await readFile(path.resolve(__dirname, "../server.js"), "utf8");

describe("getReferenceMarketPricing", () => {
  beforeEach(() => {
    initializeMemoryDefaults();
  });

  async function setReferencePricing(market, costs) {
    await applyAdminSystemConfigPut(
      {
        version: getConfigVersion(),
        appSettings: {
          reference_market_price_rwf_per_kg: market,
          reference_costs_to_sell_rwf_per_kg: costs,
        },
      },
      null,
      null,
      () => false,
      () => {},
      "test",
      "superuser",
    );
  }

  it("returns null net price when market price is unset", () => {
    const p = getReferenceMarketPricing();
    assert.equal(p.marketPricePerKg, null);
    assert.equal(p.netFairValuePerKg, null);
  });

  it("deducts costs to sell from market price", async () => {
    await setReferencePricing("2500", "300");
    const p = getReferenceMarketPricing();
    assert.equal(p.marketPricePerKg, 2500);
    assert.equal(p.costsToSellPerKg, 300);
    assert.equal(p.netFairValuePerKg, 2200);
  });

  it("never returns negative net fair value per kg", async () => {
    await setReferencePricing("100", "500");
    const p = getReferenceMarketPricing();
    assert.equal(p.netFairValuePerKg, 0);
  });
});

describe("ops-board growth & valuation fields", () => {
  it("GET /api/farm/ops-board returns biomass and fair value fields", () => {
    const block = extractRouteBlock(serverJs, "/api/farm/ops-board");
    assert.ok(block, "ops-board route must exist");
    assert.ok(block.includes("birdsLiveEstimate"), "Must expose birdsLiveEstimate");
    assert.ok(block.includes("biomassKg"), "Must expose biomassKg");
    assert.ok(block.includes("estimatedFairValueRwf"), "Must expose estimatedFairValueRwf");
    assert.ok(block.includes("lastValuationSnapshotRwf"), "Must join valuation snapshots");
    assert.ok(block.includes("farmTotals"), "Must return farmTotals");
    assert.ok(block.includes("getReferenceMarketPricing"), "Must read reference market pricing");
  });
});

describe("weigh-in trends API", () => {
  it("GET /api/farm/weigh-in-trends exists and scopes by company", () => {
    const block = extractRouteBlock(serverJs, "/api/farm/weigh-in-trends");
    assert.ok(block, "weigh-in-trends route must exist");
    assert.ok(block.includes("company_id"), "Must filter by company for non-superusers");
    assert.ok(block.includes("interpolateCurve"), "Must compute expected weight at sample age");
    assert.ok(block.includes("weigh_in_id"), "Must link vet-log weigh-ins when available");
    assert.ok(block.includes("id::text"), "Must compare flock ids as text for weigh_ins join");
  });
});

describe("dashboard widget defaults", () => {
  it("includes growth_metrics in default dashboard widgets", () => {
    assert.ok(serverJs.includes('"growth_metrics"'), "growth_metrics widget id must be in server defaults");
  });

  it("vet log list select includes mortality snapshot fields", () => {
    assert.ok(serverJs.includes("confirmedLiveCount"), "Vet log list must expose confirmedLiveCount");
    assert.ok(serverJs.includes("mortalityConfirmedSinceLastVisit"), "Vet log list must expose mortality review fields");
  });
});

describe("dashboardAdapters growth helpers", async () => {
  const {
    weightVsTargetSeries,
    biomassSummary,
    farmAverageWeightTrend,
  } = await import("../../web/src/lib/dashboardAdapters.ts");

  it("weightVsTargetSeries sorts worst deviation first", () => {
    const rows = weightVsTargetSeries(
      [
        {
          flockId: "a",
          label: "A",
          latestWeightKg: 2,
          expectedWeightKg: 2.2,
          weightDeviationPct: -9,
        },
        {
          flockId: "b",
          label: "B",
          latestWeightKg: 2.1,
          expectedWeightKg: 2.2,
          weightDeviationPct: -4,
        },
      ],
      8,
    );
    assert.equal(rows[0].name, "A");
    assert.equal(rows[0].weightDeviationPct, -9);
  });

  it("biomassSummary aggregates farm totals", () => {
    const summary = biomassSummary([
      {
        biomassKg: 1200,
        estimatedFairValueRwf: 3000000,
        latestWeightKg: 2,
        weightDeviationPct: -3,
        latestFcr: 1.6,
        latestWeighDate: new Date().toISOString(),
      },
      {
        biomassKg: 800,
        estimatedFairValueRwf: 2000000,
        latestWeightKg: 1.9,
        weightDeviationPct: -8,
        latestFcr: 1.7,
        latestWeighDate: null,
      },
    ]);
    assert.equal(summary.totalBiomassKg, 2000);
    assert.equal(summary.estimatedFairValueRwf, 5000000);
    assert.equal(summary.belowTargetCount, 1);
    assert.equal(summary.staleWeighInCount, 1);
    assert.equal(summary.avgFcr, 1.65);
  });

  it("farmAverageWeightTrend groups by date", () => {
    const trend = farmAverageWeightTrend([
      { flockId: "1", label: "F1", weighDate: "2026-01-01", avgWeightKg: 2, expectedWeightKg: 2.1, source: "vet_log", vetLogId: null, ageDays: 20, fcrAtSample: 1.5 },
      { flockId: "2", label: "F2", weighDate: "2026-01-01", avgWeightKg: 2.2, expectedWeightKg: 2.1, source: "standalone", vetLogId: null, ageDays: 21, fcrAtSample: 1.4 },
      { flockId: "1", label: "F1", weighDate: "2026-01-08", avgWeightKg: 2.3, expectedWeightKg: 2.2, source: "vet_log", vetLogId: null, ageDays: 27, fcrAtSample: 1.45 },
    ]);
    assert.equal(trend.length, 2);
    assert.equal(trend[0].date, "2026-01-01");
    assert.equal(trend[0].avgWeightKg, 2.1);
    assert.equal(trend[0].count, 2);
  });
});

function extractRouteBlock(source, routePattern) {
  const needle = `"${routePattern}"`;
  const idx = source.indexOf(needle);
  if (idx === -1) return null;
  let depth = 0;
  let started = false;
  let start = idx;
  for (let i = idx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      if (!started) start = i;
      started = true;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (started && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return source.slice(idx, idx + 8000);
}
