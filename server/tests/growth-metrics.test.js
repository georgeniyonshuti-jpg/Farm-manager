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

  it("ops-board exposes growth tracker fields and structured growthInsights", () => {
    const block = extractRouteBlock(serverJs, "/api/farm/ops-board");
    assert.ok(block.includes("feedToDateKg"), "Must expose feedToDateKg per flock");
    assert.ok(block.includes("adgGramsPerDay"), "Must expose adgGramsPerDay per flock");
    assert.ok(block.includes("fcrStatus"), "Must expose fcrStatus per flock");
    assert.ok(block.includes("daysSinceWeighIn"), "Must expose daysSinceWeighIn per flock");
    assert.ok(block.includes("growthInsights"), "Must return growthInsights array");
    assert.ok(block.includes("totalFeedToDateKg"), "Must aggregate totalFeedToDateKg in farmTotals");
    assert.ok(block.includes("flocksAboveTargetFcr"), "Must aggregate flocksAboveTargetFcr in farmTotals");
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
    growthTrackerSummary,
    growthScorecardRows,
    fcrStatusLabel,
    trendArrowLabel,
    farmAverageWeightTrend,
    flockWeightTrendChartData,
    FLOCK_TREND_COLORS,
  } = await import("../../web/src/lib/dashboardAdapters.ts");

  const samplePoint = (overrides) => ({
    flockId: "f1",
    label: "Barn-A",
    weighDate: "2026-01-01",
    avgWeightKg: 2,
    expectedWeightKg: 2.1,
    source: "vet_log",
    vetLogId: null,
    ageDays: 20,
    fcrAtSample: 1.5,
    ...overrides,
  });

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

  const sampleFlock = (overrides) => ({
    flockId: "f1",
    label: "Barn-A",
    ageDays: 28,
    latestWeightKg: 2,
    expectedWeightKg: 2.2,
    weightDeviationPct: -9,
    latestFcr: 1.75,
    expectedFcrRange: { min: 1.4, max: 1.6 },
    fcrStatus: "warning",
    feedToDateKg: 1200,
    feedPerBirdKg: 3.2,
    adgGramsPerDay: 55,
    daysSinceWeighIn: 3,
    latestWeighDate: new Date().toISOString(),
    ...overrides,
  });

  it("growthTrackerSummary merges biomass with feed and ADG farm totals", () => {
    const summary = growthTrackerSummary(
      [
        sampleFlock({ flockId: "a", latestFcr: 1.75, fcrStatus: "warning" }),
        sampleFlock({
          flockId: "b",
          label: "Barn-B",
          weightDeviationPct: -2,
          latestFcr: 1.5,
          fcrStatus: "on_track",
          adgGramsPerDay: 45,
        }),
      ],
      { totalFeedToDateKg: 5000, avgFeedPerBirdKg: 3.1, flocksAboveTargetFcr: 1 },
    );
    assert.equal(summary.totalFeedToDateKg, 5000);
    assert.equal(summary.avgFeedPerBirdKg, 3.1);
    assert.equal(summary.flocksAboveTargetFcr, 1);
    assert.equal(summary.avgAdgGramsPerDay, 50);
    assert.equal(summary.fcrWatchCount, 1);
  });

  it("growthScorecardRows prioritizes underweight and high-FCR flocks", () => {
    const rows = growthScorecardRows(
      [
        sampleFlock({ flockId: "ok", weightDeviationPct: 0, latestFcr: 1.5, fcrStatus: "on_track" }),
        sampleFlock({ flockId: "bad", weightDeviationPct: -12, latestFcr: 1.9, fcrStatus: "warning" }),
        sampleFlock({ flockId: "mid", weightDeviationPct: -6, latestFcr: 1.65, fcrStatus: "watch" }),
      ],
      2,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].flockId, "bad");
  });

  it("fcrStatusLabel and trendArrowLabel map known values", () => {
    assert.equal(fcrStatusLabel("on_track"), "On track");
    assert.equal(fcrStatusLabel("warning"), "High");
    assert.equal(trendArrowLabel("up"), "↑");
    assert.equal(trendArrowLabel("flat"), "→");
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

  it("flockWeightTrendChartData pivots two flocks with distinct colors", () => {
    const { rows, series } = flockWeightTrendChartData([
      samplePoint({ flockId: "f1", label: "Alpha", weighDate: "2026-01-01", avgWeightKg: 2 }),
      samplePoint({ flockId: "f2", label: "Beta", weighDate: "2026-01-08", avgWeightKg: 2.2 }),
    ]);
    assert.equal(series.length, 2);
    assert.notEqual(series[0].color, series[1].color);
    assert.equal(series[0].color, FLOCK_TREND_COLORS[0]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, "2026-01-01");
    assert.equal(rows[1].date, "2026-01-08");
    assert.equal(rows[0][series[0].actualKey], 2);
    assert.equal(rows[1][series[1].actualKey], 2.2);
  });

  it("flockWeightTrendChartData filters to one flock", () => {
    const points = [
      samplePoint({ flockId: "f1", label: "Alpha" }),
      samplePoint({ flockId: "f2", label: "Beta", weighDate: "2026-01-02" }),
    ];
    const { series } = flockWeightTrendChartData(points, { flockId: "f2" });
    assert.equal(series.length, 1);
    assert.equal(series[0].flockId, "f2");
    assert.equal(series[0].label, "Beta");
  });

  it("flockWeightTrendChartData caps at limit when many flocks", () => {
    const points = [];
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        points.push(
          samplePoint({
            flockId: `f${i}`,
            label: `Flock-${i}`,
            weighDate: `2026-01-${String(j + 1).padStart(2, "0")}`,
            avgWeightKg: 2 + i * 0.01,
          }),
        );
      }
    }
    const { series } = flockWeightTrendChartData(points, { limit: 8 });
    assert.equal(series.length, 8);
    assert.equal(series[0].flockId, "f11");
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
