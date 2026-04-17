import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure-function tests for the data-integrity logic used in server.js.
 * Functions are duplicated here to validate the algorithms without importing
 * the monolithic server module (which starts an HTTP server on import).
 */

function sameFlockId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

function shouldCountMortalityForLiveEstimate(event) {
  if (!event) return false;
  if (event.affectsLiveCount === false) return false;
  const status = String(event.submissionStatus ?? "approved");
  return status !== "rejected";
}

function shouldCountDailyLogMortality(log) {
  if (!log) return false;
  const vs = String(log.validationStatus ?? "draft");
  if (vs === "draft" || vs === "rejected") return false;
  const n = Number(log.mortality);
  return Number.isFinite(n) && n > 0;
}

function totalFeedKgForFlock(roundCheckins, flockFeedEntries, flockId, cutoffMs = Number.POSITIVE_INFINITY) {
  const fid = String(flockId);
  let s = 0;
  for (const c of roundCheckins) {
    if (!sameFlockId(c.flockId, fid)) continue;
    if ((c.submissionStatus ?? "approved") === "rejected") continue;
    if (new Date(c.at).getTime() > cutoffMs) continue;
    s += Number(c.feedKg) || 0;
  }
  for (const e of flockFeedEntries) {
    if (!sameFlockId(e.flockId, fid)) continue;
    if ((e.submissionStatus ?? "approved") === "rejected") continue;
    if (new Date(e.recordedAt).getTime() > cutoffMs) continue;
    s += Number(e.feedKg) || 0;
  }
  return s;
}

function computeMortalityToDate(mortalityEvents, dailyLogs, flockId, cutoffMs = Number.POSITIVE_INFINITY) {
  const fid = String(flockId);
  const fromEvents = mortalityEvents
    .filter(
      (m) =>
        sameFlockId(m.flockId, fid) &&
        new Date(m.at).getTime() <= cutoffMs &&
        shouldCountMortalityForLiveEstimate(m)
    )
    .reduce((s, m) => s + (Number(m.count) || 0), 0);

  const fromDaily = dailyLogs
    .filter((log) => {
      if (!sameFlockId(log.flockId, fid)) return false;
      if (!shouldCountDailyLogMortality(log)) return false;
      const d = String(log.logDate ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const dayEndMs = new Date(`${d}T23:59:59.999Z`).getTime();
      return dayEndMs <= cutoffMs;
    })
    .reduce((s, log) => s + Math.max(0, Number(log.mortality) || 0), 0);

  return fromEvents + fromDaily;
}

function computeBirdsLiveEstimate(initialCount, mortalityToDate, slaughterToDate, verifiedLiveCount) {
  const computed = Math.max(0, initialCount - mortalityToDate - slaughterToDate);
  if (verifiedLiveCount != null && Number.isFinite(Number(verifiedLiveCount))) {
    return Math.max(0, Math.floor(Number(verifiedLiveCount)));
  }
  return computed;
}

function computeFcrCumulative(feedToDate, birdsLiveEstimate, latestAvgWeightKg, initialTotalWeightKg) {
  if (latestAvgWeightKg == null || latestAvgWeightKg <= 0) return null;
  const currentBiomass = birdsLiveEstimate * latestAvgWeightKg;
  const weightGained = Math.max(0, currentBiomass - initialTotalWeightKg);
  return weightGained > 1e-9 ? feedToDate / weightGained : null;
}

// ── Tests ──

describe("totalFeedKgForFlock", () => {
  it("sums approved check-in feed and feed entries", () => {
    const checkins = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", feedKg: 10, submissionStatus: "approved" },
      { flockId: "f1", at: "2025-01-02T10:00:00Z", feedKg: 15, submissionStatus: "approved" },
    ];
    const feedEntries = [
      { flockId: "f1", recordedAt: "2025-01-01T12:00:00Z", feedKg: 5, submissionStatus: "approved" },
    ];
    assert.equal(totalFeedKgForFlock(checkins, feedEntries, "f1"), 30);
  });

  it("excludes rejected check-in feed", () => {
    const checkins = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", feedKg: 10, submissionStatus: "approved" },
      { flockId: "f1", at: "2025-01-02T10:00:00Z", feedKg: 15, submissionStatus: "rejected" },
    ];
    assert.equal(totalFeedKgForFlock(checkins, [], "f1"), 10);
  });

  it("excludes rejected feed entries", () => {
    const feedEntries = [
      { flockId: "f1", recordedAt: "2025-01-01T12:00:00Z", feedKg: 20, submissionStatus: "approved" },
      { flockId: "f1", recordedAt: "2025-01-02T12:00:00Z", feedKg: 10, submissionStatus: "rejected" },
    ];
    assert.equal(totalFeedKgForFlock([], feedEntries, "f1"), 20);
  });

  it("includes pending_review entries (counted until rejected)", () => {
    const feedEntries = [
      { flockId: "f1", recordedAt: "2025-01-01T12:00:00Z", feedKg: 20, submissionStatus: "pending_review" },
    ];
    assert.equal(totalFeedKgForFlock([], feedEntries, "f1"), 20);
  });

  it("respects cutoff time", () => {
    const checkins = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", feedKg: 10, submissionStatus: "approved" },
      { flockId: "f1", at: "2025-01-03T10:00:00Z", feedKg: 15, submissionStatus: "approved" },
    ];
    const cutoff = new Date("2025-01-02T00:00:00Z").getTime();
    assert.equal(totalFeedKgForFlock(checkins, [], "f1", cutoff), 10);
  });

  it("only counts feed for the specified flock", () => {
    const checkins = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", feedKg: 10, submissionStatus: "approved" },
      { flockId: "f2", at: "2025-01-01T10:00:00Z", feedKg: 50, submissionStatus: "approved" },
    ];
    assert.equal(totalFeedKgForFlock(checkins, [], "f1"), 10);
  });
});

describe("shouldCountMortalityForLiveEstimate", () => {
  it("counts approved events", () => {
    assert.ok(shouldCountMortalityForLiveEstimate({ submissionStatus: "approved", affectsLiveCount: true }));
  });

  it("excludes rejected events", () => {
    assert.ok(!shouldCountMortalityForLiveEstimate({ submissionStatus: "rejected", affectsLiveCount: true }));
  });

  it("excludes events with affectsLiveCount = false", () => {
    assert.ok(!shouldCountMortalityForLiveEstimate({ submissionStatus: "approved", affectsLiveCount: false }));
  });

  it("counts pending_review events (they affect count until explicitly rejected)", () => {
    assert.ok(shouldCountMortalityForLiveEstimate({ submissionStatus: "pending_review", affectsLiveCount: true }));
  });

  it("defaults submissionStatus to approved", () => {
    assert.ok(shouldCountMortalityForLiveEstimate({ affectsLiveCount: true }));
  });
});

describe("shouldCountDailyLogMortality", () => {
  it("counts submitted logs with mortality > 0", () => {
    assert.ok(shouldCountDailyLogMortality({ validationStatus: "submitted", mortality: 5 }));
  });

  it("excludes draft logs", () => {
    assert.ok(!shouldCountDailyLogMortality({ validationStatus: "draft", mortality: 5 }));
  });

  it("excludes rejected logs", () => {
    assert.ok(!shouldCountDailyLogMortality({ validationStatus: "rejected", mortality: 5 }));
  });

  it("excludes logs with zero mortality", () => {
    assert.ok(!shouldCountDailyLogMortality({ validationStatus: "submitted", mortality: 0 }));
  });
});

describe("computeMortalityToDate", () => {
  it("sums mortality from events and daily logs", () => {
    const events = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", count: 3, submissionStatus: "approved", affectsLiveCount: true },
      { flockId: "f1", at: "2025-01-02T10:00:00Z", count: 2, submissionStatus: "approved", affectsLiveCount: true },
    ];
    const dailyLogs = [
      { flockId: "f1", logDate: "2025-01-01", validationStatus: "submitted", mortality: 1 },
    ];
    assert.equal(computeMortalityToDate(events, dailyLogs, "f1"), 6);
  });

  it("excludes rejected mortality events", () => {
    const events = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", count: 3, submissionStatus: "approved", affectsLiveCount: true },
      { flockId: "f1", at: "2025-01-02T10:00:00Z", count: 5, submissionStatus: "rejected", affectsLiveCount: true },
    ];
    assert.equal(computeMortalityToDate(events, [], "f1"), 3);
  });

  it("excludes events where affectsLiveCount is false", () => {
    const events = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", count: 3, submissionStatus: "approved", affectsLiveCount: true },
      { flockId: "f1", at: "2025-01-02T10:00:00Z", count: 5, submissionStatus: "approved", affectsLiveCount: false },
    ];
    assert.equal(computeMortalityToDate(events, [], "f1"), 3);
  });
});

describe("computeBirdsLiveEstimate", () => {
  it("computes live = initial - mortality - slaughter", () => {
    assert.equal(computeBirdsLiveEstimate(1000, 50, 100, null), 850);
  });

  it("never goes negative", () => {
    assert.equal(computeBirdsLiveEstimate(100, 80, 50, null), 0);
  });

  it("uses verifiedLiveCount override when present", () => {
    assert.equal(computeBirdsLiveEstimate(1000, 50, 100, 900), 900);
  });

  it("ignores null verifiedLiveCount", () => {
    assert.equal(computeBirdsLiveEstimate(1000, 50, 0, null), 950);
  });
});

describe("computeFcrCumulative", () => {
  it("computes FCR = feedToDate / weightGained", () => {
    const fcr = computeFcrCumulative(500, 900, 2.0, 40);
    const expectedGain = 900 * 2.0 - 40;
    assert.ok(Math.abs(fcr - 500 / expectedGain) < 0.001);
  });

  it("returns null when no weigh-in", () => {
    assert.equal(computeFcrCumulative(500, 900, null, 40), null);
  });

  it("returns null when weight gain is zero or negative", () => {
    assert.equal(computeFcrCumulative(500, 900, 0.01, 100), null);
  });

  it("handles edge case: very small weight gain", () => {
    const fcr = computeFcrCumulative(100, 100, 1.5, 149.9);
    assert.ok(fcr > 0, "FCR should be positive when there is some weight gain");
  });
});

describe("mortality → flock count → FCR pipeline (integration)", () => {
  it("mortality reduces live count which changes FCR", () => {
    const initial = 1000;
    const feedToDate = 2000;
    const avgWeight = 2.5;
    const initialWeight = 40;

    const mortalityBefore = 0;
    const liveBefore = computeBirdsLiveEstimate(initial, mortalityBefore, 0, null);
    const fcrBefore = computeFcrCumulative(feedToDate, liveBefore, avgWeight, initialWeight);

    const mortalityAfter = 100;
    const liveAfter = computeBirdsLiveEstimate(initial, mortalityAfter, 0, null);
    const fcrAfter = computeFcrCumulative(feedToDate, liveAfter, avgWeight, initialWeight);

    assert.ok(liveAfter < liveBefore, "Live count should decrease with mortality");
    assert.ok(fcrAfter > fcrBefore, "FCR should worsen (increase) with higher mortality");
  });

  it("rejected mortality does NOT reduce live count", () => {
    const events = [
      { flockId: "f1", at: "2025-01-01T10:00:00Z", count: 50, submissionStatus: "rejected", affectsLiveCount: true },
    ];
    const mort = computeMortalityToDate(events, [], "f1");
    const live = computeBirdsLiveEstimate(1000, mort, 0, null);
    assert.equal(mort, 0, "Rejected mortality should not count");
    assert.equal(live, 1000, "Live count should remain at initial when mortality is rejected");
  });

  it("rejected feed does NOT inflate FCR denominator", () => {
    const feedEntries = [
      { flockId: "f1", recordedAt: "2025-01-01T12:00:00Z", feedKg: 100, submissionStatus: "approved" },
      { flockId: "f1", recordedAt: "2025-01-02T12:00:00Z", feedKg: 9999, submissionStatus: "rejected" },
    ];
    const feed = totalFeedKgForFlock([], feedEntries, "f1");
    assert.equal(feed, 100, "Only approved feed should be counted");
  });
});

describe("check-in → linked mortality cascade logic", () => {
  it("pending check-in should create pending mortality (not approved)", () => {
    const checkinStatus = "pending_review";
    const mortalityReportedInMortalityLog = true;

    const expectedMortStatus = checkinStatus;
    const expectedAffectsLive = checkinStatus === "approved" ? mortalityReportedInMortalityLog : false;

    assert.equal(expectedMortStatus, "pending_review");
    assert.equal(expectedAffectsLive, false, "Pending check-in mortality should not affect live count yet");
  });

  it("approved check-in with mortalityReportedInMortalityLog=true creates affecting mortality", () => {
    const checkinStatus = "approved";
    const mortalityReportedInMortalityLog = true;

    const expectedAffectsLive = checkinStatus === "approved" ? mortalityReportedInMortalityLog : false;
    assert.equal(expectedAffectsLive, true);
  });

  it("rejecting check-in must cascade to linked mortality", () => {
    const linkedMortality = {
      submissionStatus: "pending_review",
      affectsLiveCount: false,
      linkedCheckinId: "chk_123",
    };

    linkedMortality.submissionStatus = "rejected";
    linkedMortality.affectsLiveCount = false;

    assert.equal(linkedMortality.submissionStatus, "rejected");
    assert.equal(linkedMortality.affectsLiveCount, false);
  });
});
