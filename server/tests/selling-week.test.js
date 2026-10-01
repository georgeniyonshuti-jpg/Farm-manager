import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWeighOutcome,
  canAppearOnPublicShop,
  clevaRunRecentLogsCountAsConfirm,
  listingPhase,
  placementFromRelative,
  publicEligibleWhereSql,
  resolveSellingWeek,
  sellingWeekFromPlacement,
} from "../src/services/pipeline/sellingWeek.js";
import { isPublicMarketLotEligible } from "../src/services/pipeline/publicMarket.js";
import { resolveLockedBookPrices } from "../src/services/pipeline/marketQuote.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const now = new Date("2026-09-27T10:00:00Z");

describe("selling week from chicks-in", () => {
  it("placement + 35–42 suggests a selling week", () => {
    const w = sellingWeekFromPlacement("2026-08-01");
    assert.ok(w);
    assert.equal(w.readyFrom, "2026-09-05");
    assert.equal(w.readyTo, "2026-09-12");
  });

  it("farmer override is stored", () => {
    const resolved = resolveSellingWeek({
      placementDate: "2026-08-01",
      readyFrom: "2026-10-21",
      readyTo: "2026-10-27",
    });
    assert.equal(resolved.readyFrom, "2026-10-21");
    assert.equal(resolved.readyTo, "2026-10-27");
    assert.equal(resolved.overridden, true);
    assert.equal(resolved.placementDate, "2026-08-01");
    assert.equal(resolved.suggested.readyFrom, "2026-09-05");
  });

  it("about 2 weeks writes placement as today minus 14", () => {
    assert.equal(placementFromRelative("about_2_weeks", now), "2026-09-13");
    assert.equal(placementFromRelative("today", now), "2026-09-27");
    assert.equal(placementFromRelative("about_week", now), "2026-09-20");
    assert.equal(placementFromRelative("about_month", now), "2026-08-28");
  });
});

describe("public shop gate", () => {
  const thisWeek = { readyFrom: "2026-09-21", readyTo: "2026-09-27" };

  it("omits unweighed lots even if verified", () => {
    assert.equal(
      isPublicMarketLotEligible({
        status: "open",
        verificationStatus: "verified",
        remaining: 80,
        ...thisWeek,
        now,
      }),
      false
    );
  });

  it("omits later-than-next-week lots even if confirmed", () => {
    assert.equal(
      isPublicMarketLotEligible({
        status: "open",
        verificationStatus: "verified",
        remaining: 80,
        scoutConfirmedAt: "2026-09-20T00:00:00Z",
        readyFrom: "2026-11-01",
        readyTo: "2026-11-07",
        now,
      }),
      false
    );
  });

  it("allows confirmed this-week lots", () => {
    assert.equal(
      canAppearOnPublicShop(
        {
          status: "open",
          verificationStatus: "verified",
          remainingBirds: 80,
          scoutConfirmedAt: "2026-09-20T00:00:00Z",
          ...thisWeek,
        },
        now
      ),
      true
    );
  });

  it("SQL requires scout_confirmed_at and this/next week", () => {
    const sql = publicEligibleWhereSql(now);
    assert.match(sql, /scout_confirmed_at IS NOT NULL/);
    assert.match(sql, /2026-09-2/);
  });
});

describe("weigh outcomes", () => {
  it("ready confirms and accrues a visit fee", () => {
    const out = applyWeighOutcome({
      outcome: "ready",
      readyFrom: "2026-10-21",
      readyTo: "2026-10-27",
      birds: 120,
      avgKg: 1.7,
    });
    assert.equal(out.ok, true);
    assert.equal(out.confirm, true);
    assert.equal(out.accrueFee, true);
    assert.equal(out.birdCount, 120);
    assert.equal(out.avgWeightKg, 1.7);
  });

  it("slip_week does not confirm and pushes the week", () => {
    const out = applyWeighOutcome({
      outcome: "slip_week",
      readyFrom: "2026-10-21",
      readyTo: "2026-10-27",
      birds: 110,
      avgKg: 1.4,
    });
    assert.equal(out.confirm, false);
    assert.equal(out.accrueFee, true);
    assert.equal(out.readyFrom, "2026-10-28");
    assert.equal(out.readyTo, "2026-11-03");
  });
});

describe("booking lock", () => {
  it("rejects when the lot is not rank-eligible", () => {
    const locked = resolveLockedBookPrices({ rankEligible: false });
    assert.equal(locked.ok, false);
  });
});

describe("Cleva-run confirm", () => {
  it("counts recent weigh-in plus live count for Cleva-run only", () => {
    assert.equal(
      clevaRunRecentLogsCountAsConfirm({
        merchantTier: "cleva_run",
        hasRecentWeighIn: true,
        hasRecentLiveCount: true,
      }),
      true
    );
    assert.equal(
      clevaRunRecentLogsCountAsConfirm({
        merchantTier: "market_only",
        hasRecentWeighIn: true,
        hasRecentLiveCount: true,
      }),
      false
    );
    assert.equal(
      clevaRunRecentLogsCountAsConfirm({
        merchantTier: "cleva_run",
        hasRecentWeighIn: true,
        hasRecentLiveCount: false,
      }),
      false
    );
  });
});

describe("listing phase", () => {
  it("stays on the book until the visit window", () => {
    assert.equal(
      listingPhase(
        {
          status: "open",
          verificationStatus: "pending_review",
          remainingBirds: 80,
          readyFrom: "2026-11-01",
          readyTo: "2026-11-07",
        },
        now
      ),
      "on_the_book"
    );
  });
});

describe("copy ban", () => {
  it("farmer list sheet has no slaughter wording", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../web/src/components/market/ListBirdsSheet.tsx", import.meta.url)),
      "utf8"
    );
    assert.doesNotMatch(src, /slaughter/i);
    assert.match(src, /Selling week/);
    assert.match(src, /Chicks in/);
  });

  it("weigh sheet uses steppers", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../web/src/pages/farm/PipelineWeighPage.tsx", import.meta.url)),
      "utf8"
    );
    assert.match(src, /CountStepper/);
    assert.match(src, /KgStepper/);
    assert.doesNotMatch(src, /slaughter/i);
  });
});
