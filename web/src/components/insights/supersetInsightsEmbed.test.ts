import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("Farm PWA Insights Trends surface", () => {
  it("ManagementHome embeds Superset on Trends", () => {
    const text = readFileSync(
      join(srcRoot, "pages/dashboards/ManagementHome.tsx"),
      "utf8"
    );
    assert.match(text, /SupersetInsightsEmbed/);
    assert.match(text, /Insights packs/);
    assert.match(text, /homeTab === "trends"/);
    assert.doesNotMatch(text, /useWeighInTrends/);
    assert.doesNotMatch(text, /exec_kpis/);
  });

  it("SupersetInsightsEmbed uses guest token API", () => {
    const text = readFileSync(
      join(srcRoot, "components/insights/SupersetInsightsEmbed.tsx"),
      "utf8"
    );
    assert.match(text, /fetchInsightsEmbedToken/);
    assert.match(text, /fetchInsightsMeta/);
    assert.match(text, /embedDashboard/);
    assert.match(text, /hideChartControls: true/);
    assert.match(text, /Barn Insights is not linked/);
    assert.match(text, /Open Market overview/);
    assert.match(text, /surface === "market"/);
    assert.match(text, /fetchMarketInsightsMeta/);
  });

  it("insights.api hits farmapi routes", () => {
    const text = readFileSync(join(srcRoot, "api/insights.api.ts"), "utf8");
    assert.match(text, /\/api\/insights\/meta/);
    assert.match(text, /\/api\/insights\/embed\/token/);
    assert.match(text, /\/api\/insights\/packs/);
  });

  it("Market analytics lives on dashboard overview + trends", () => {
    const ops = readFileSync(join(srcRoot, "pages/market/MarketOpsPage.tsx"), "utf8");
    assert.doesNotMatch(ops, /AnalyticsPanel/);
    assert.match(ops, /\/dashboard\/market/);

    const overview = readFileSync(
      join(srcRoot, "pages/dashboards/MarketOverviewPage.tsx"),
      "utf8"
    );
    assert.match(overview, /AnalyticsPanel/);
    assert.match(overview, /mode="glance"/);

    const trends = readFileSync(
      join(srcRoot, "pages/dashboards/MarketTrendsPage.tsx"),
      "utf8"
    );
    assert.match(trends, /mode="deep"/);
  });
});
