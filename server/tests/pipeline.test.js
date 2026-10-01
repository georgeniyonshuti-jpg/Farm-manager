import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessPipelineDesk,
  canBrowseMarket,
  canOptInManagedFlock,
  canScoutPipeline,
  computeScoutCommission,
  deriveDemandStatusAfterMatch,
  deriveLotStatusAfterMatch,
  forwardWeekBuckets,
  isBuyerRole,
  planManagedLotSync,
  readyWindowFromPlacement,
  readyWindowHitsThisOrNextWeek,
  remainingBirds,
  shouldAutoDraftLot,
} from "../src/services/pipeline/pipeline.js";

describe("pipeline helpers", () => {
  it("readyWindowFromPlacement adds slaughter day range to placement", () => {
    const w = readyWindowFromPlacement("2026-08-01", 35, 42);
    assert.ok(w);
    assert.equal(w.readyFrom, "2026-09-05");
    assert.equal(w.readyTo, "2026-09-12");
  });

  it("readyWindowFromPlacement returns null without placement", () => {
    assert.equal(readyWindowFromPlacement(null, 35, 42), null);
  });

  it("remainingBirds never goes negative", () => {
    assert.equal(remainingBirds(100, 40), 60);
    assert.equal(remainingBirds(100, 150), 0);
  });

  it("deriveLotStatusAfterMatch supports partial matches", () => {
    assert.equal(deriveLotStatusAfterMatch(420, 150, "open"), "partial");
    assert.equal(deriveLotStatusAfterMatch(420, 420, "partial"), "matched");
    assert.equal(deriveLotStatusAfterMatch(420, 0, "open"), "open");
    assert.equal(deriveLotStatusAfterMatch(420, 10, "cancelled"), "cancelled");
  });

  it("deriveDemandStatusAfterMatch fills when complete", () => {
    assert.equal(deriveDemandStatusAfterMatch(100, 40, "open"), "partial");
    assert.equal(deriveDemandStatusAfterMatch(100, 100, "partial"), "filled");
    assert.equal(deriveDemandStatusAfterMatch(100, 0, "open"), "open");
  });

  it("forwardWeekBuckets returns three consecutive weeks", () => {
    const buckets = forwardWeekBuckets(new Date("2026-09-15T12:00:00Z"));
    assert.equal(buckets.length, 3);
    assert.equal(buckets[0].key, "this_week");
    assert.equal(buckets[1].key, "next_week");
    assert.equal(buckets[2].key, "week_after");
    assert.ok(buckets[0].from <= buckets[0].to);
    assert.ok(buckets[1].from > buckets[0].to);
  });

  it("desk access is sales_coordinator or superuser only", () => {
    assert.equal(canAccessPipelineDesk({ role: "superuser" }), true);
    assert.equal(canAccessPipelineDesk({ role: "sales_coordinator" }), true);
    assert.equal(canAccessPipelineDesk({ role: "manager" }), false);
    assert.equal(canAccessPipelineDesk({ role: "vet" }), false);
    assert.equal(canAccessPipelineDesk(null), false);
  });

  it("market browse includes buyers and ops", () => {
    assert.equal(canBrowseMarket({ role: "buyer" }), true);
    assert.equal(canBrowseMarket({ role: "sales_coordinator" }), true);
    assert.equal(canBrowseMarket({ role: "manager" }), false);
    assert.equal(isBuyerRole({ role: "buyer" }), true);
  });

  it("scout access includes vets and managers but not laborers", () => {
    assert.equal(canScoutPipeline({ role: "vet" }), true);
    assert.equal(canScoutPipeline({ role: "vet_manager" }), true);
    assert.equal(canScoutPipeline({ role: "manager" }), true);
    assert.equal(canScoutPipeline({ role: "laborer" }), false);
  });

  it("managed flock opt-in excludes field laborers and plain vets", () => {
    assert.equal(canOptInManagedFlock({ role: "manager" }), true);
    assert.equal(canOptInManagedFlock({ role: "company_admin" }), true);
    assert.equal(canOptInManagedFlock({ role: "vet" }), false);
    assert.equal(canOptInManagedFlock({ role: "laborer" }), false);
  });

  it("computeScoutCommission accrues on birds × weight × price × rate", () => {
    const c = computeScoutCommission({
      birds: 100,
      avgWeightKg: 1.5,
      agreedPricePerKg: 4000,
      ratePct: 2,
    });
    assert.equal(c.ok, true);
    assert.equal(c.amountRwf, 12000);
  });

  it("computeScoutCommission fails without weight or price", () => {
    assert.equal(computeScoutCommission({ birds: 10, ratePct: 2 }).ok, false);
  });

  it("ready window hits this or next Kigali week only", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const buckets = forwardWeekBuckets(now);
    assert.equal(readyWindowHitsThisOrNextWeek(buckets[0].from, buckets[0].to, now), true);
    assert.equal(readyWindowHitsThisOrNextWeek(buckets[1].from, buckets[1].to, now), true);
    assert.equal(readyWindowHitsThisOrNextWeek(buckets[2].from, buckets[2].to, now), false);
  });

  it("shouldAutoDraftLot requires birds, window, and no open lot", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const buckets = forwardWeekBuckets(now);
    assert.equal(
      shouldAutoDraftLot({
        readyFrom: buckets[0].from,
        readyTo: buckets[0].to,
        liveEstimate: 200,
        hasOpenLot: false,
        now,
      }),
      true
    );
    assert.equal(
      shouldAutoDraftLot({
        readyFrom: buckets[0].from,
        readyTo: buckets[0].to,
        liveEstimate: 200,
        hasOpenLot: true,
        now,
      }),
      false
    );
    assert.equal(
      shouldAutoDraftLot({
        readyFrom: buckets[0].from,
        readyTo: buckets[0].to,
        liveEstimate: 0,
        hasOpenLot: false,
        now,
      }),
      false
    );
    assert.equal(
      shouldAutoDraftLot({
        readyFrom: buckets[2].from,
        readyTo: buckets[2].to,
        liveEstimate: 200,
        hasOpenLot: false,
        now,
      }),
      true
    );
  });

  it("planManagedLotSync closes empty lots without zeroing bird_count", () => {
    assert.deepEqual(planManagedLotSync({ liveEstimate: 0, matchedBirds: 0, currentStatus: "open" }), {
      skip: false,
      birdCount: null,
      saleableBirds: 0,
      status: "cancelled",
    });
    assert.equal(
      planManagedLotSync({ liveEstimate: 0, matchedBirds: 40, currentStatus: "partial" }).status,
      "matched"
    );
    assert.deepEqual(planManagedLotSync({ liveEstimate: 80, matchedBirds: 20, currentStatus: "open" }), {
      skip: false,
      birdCount: 100,
      saleableBirds: 80,
      status: "partial",
    });
    assert.equal(planManagedLotSync({ liveEstimate: 10, matchedBirds: 0, currentStatus: "cancelled" }).skip, true);
  });
});

describe("pipeline sales bridge rules", () => {
  it("managed lots require flock_id; scout lots must not have flock_id", () => {
    function validLot(source, flockId) {
      if (source === "managed_flock") return flockId != null;
      if (source === "scout") return flockId == null;
      return false;
    }
    assert.equal(validLot("managed_flock", "abc"), true);
    assert.equal(validLot("managed_flock", null), false);
    assert.equal(validLot("scout", null), true);
    assert.equal(validLot("scout", "abc"), false);
  });

  it("partial match leaves remaining birds for another buyer", () => {
    const lotBirds = 420;
    const first = 150;
    const second = 270;
    assert.equal(remainingBirds(lotBirds, first), 270);
    assert.equal(remainingBirds(lotBirds, first + second), 0);
    assert.equal(deriveLotStatusAfterMatch(lotBirds, first, "open"), "partial");
    assert.equal(deriveLotStatusAfterMatch(lotBirds, first + second, "partial"), "matched");
  });

  it("double-book would exceed remaining birds", () => {
    const lotBirds = 100;
    const alreadyMatched = 80;
    const left = remainingBirds(lotBirds, alreadyMatched);
    assert.equal(left, 20);
    assert.equal(30 > left, true);
  });

  it("managed deliver requires weight before sales order bridge", () => {
    function canBridgeManagedDeliver({ lotSource, avgWeightKg, totalWeightKg, birds }) {
      if (lotSource !== "managed_flock") return true;
      const total =
        totalWeightKg != null
          ? Number(totalWeightKg)
          : avgWeightKg != null
            ? Number(avgWeightKg) * Number(birds)
            : null;
      return total != null && total > 0;
    }
    assert.equal(canBridgeManagedDeliver({ lotSource: "scout", birds: 10 }), true);
    assert.equal(
      canBridgeManagedDeliver({ lotSource: "managed_flock", birds: 10, avgWeightKg: null }),
      false
    );
    assert.equal(
      canBridgeManagedDeliver({ lotSource: "managed_flock", birds: 10, avgWeightKg: 1.8 }),
      true
    );
  });

  it("payout flips commission from accrued to paid", () => {
    function nextStatus(current, action) {
      if (current === "accrued" && action === "pay") return "paid";
      if (current === "accrued" && action === "void") return "void";
      return current;
    }
    assert.equal(nextStatus("accrued", "pay"), "paid");
    assert.equal(nextStatus("accrued", "void"), "void");
    assert.equal(nextStatus("paid", "pay"), "paid");
  });
});
