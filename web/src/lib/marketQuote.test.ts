import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { butcherPayFromBoard, defaultWeekBounds, displayStripRate, formatWeekRange, midWeight, previewFromDraft, resolveStripRate, type MarketBoard } from "./marketQuote.ts";

const board: MarketBoard = {
  validFrom: "2026-09-21",
  validTo: "2026-09-27",
  slaughterRwfPerBird: 200,
  deliveryRwfPerTrip: 15000,
  bands: [
    { minKg: 1.4, maxKg: 1.6, fromRwfPerKg: 4100 },
    { minKg: 1.6, maxKg: 1.8, fromRwfPerKg: 4300 },
    { minKg: 1.8, maxKg: 2.0, fromRwfPerKg: 4550 },
    { minKg: 2.0, maxKg: 2.5, fromRwfPerKg: 4700 },
  ],
};

describe("marketQuote midWeight", () => {
  it("returns the band midpoint to one decimal", () => {
    assert.equal(midWeight({ minKg: 1.6, maxKg: 1.8 }), 1.7);
    assert.equal(midWeight({ minKg: 1.8, maxKg: 2.0 }), 1.9);
  });
});

describe("marketQuote butcherPayFromBoard", () => {
  it("never needs farm-gate to compute you-pay", () => {
    const pay = butcherPayFromBoard(board, { birds: 200, avgKg: 1.8, delivery: true });
    assert.ok(pay);
    assert.equal(pay.butcherRwfPerKg, 4550);
    assert.equal(pay.youPayRwf, 1_693_000);
    assert.equal(JSON.stringify(pay).includes("farmGate"), false);
    assert.equal(JSON.stringify(pay).includes("youReceive"), false);
  });

  it("applies a public quantity-tier adj without farm-gate", () => {
    const withTiers: MarketBoard = {
      ...board,
      quantityTiers: [
        { id: "kitchen", label: "Kitchen", minBirds: 10, maxBirds: 49, fromRwfPerKg: 4250 },
        { id: "shop", label: "Shop", minBirds: 50, maxBirds: 99, fromRwfPerKg: 4100 },
        { id: "usual", label: "Usual", minBirds: 100, maxBirds: 199, fromRwfPerKg: 4050 },
        { id: "load", label: "Load", minBirds: 200, maxBirds: null, fromRwfPerKg: 3950 },
      ],
    };
    const kitchen = butcherPayFromBoard(withTiers, { birds: 20, avgKg: 1.8 });
    assert.ok(kitchen);
    assert.equal(kitchen.butcherRwfPerKg, 4700);
    const pay = butcherPayFromBoard(withTiers, { birds: 200, avgKg: 1.8 });
    assert.ok(pay);
    assert.equal(pay.butcherRwfPerKg, 4400);
    assert.equal(JSON.stringify(pay).includes("farmGate"), false);
  });
});

describe("marketQuote week label", () => {
  it("formats a Monday–Sunday window without inventing a price", () => {
    const w = defaultWeekBounds(new Date("2026-09-25T10:00:00Z"));
    assert.equal(w.validFrom, "2026-09-21");
    assert.equal(w.validTo, "2026-09-27");
    assert.equal(formatWeekRange(w.validFrom, w.validTo), "21–27 Sep");
  });
});

describe("marketQuote previewFromDraft", () => {
  it("shows both receipts for the 200 × 1.8 sample", () => {
    const preview = previewFromDraft({
      slaughterRwfPerBird: 200,
      deliveryRwfPerTrip: 0,
      commissionPct: 5,
      bands: [
        { minKg: 1.6, maxKg: 1.8, farmGateRwfPerKg: 3800, butcherRwfPerKg: 4300 },
        { minKg: 1.8, maxKg: 2.0, farmGateRwfPerKg: 4000, butcherRwfPerKg: 4550 },
      ],
    });
    assert.ok(preview);
    assert.equal(preview.farmer.youReceiveRwf, 1_368_000);
    assert.equal(preview.butcher.youPayRwf, 1_678_000);
    assert.equal(preview.farmer.farmGateRwfPerKg, 4000);
    assert.equal(preview.butcher.butcherRwfPerKg, 4550);
  });
});

describe("resolveStripRate", () => {
  it("prefers headlineRwfPerKg over the first band", () => {
    assert.equal(resolveStripRate({ ...board, headlineRwfPerKg: 3900 }), 3900);
    assert.equal(resolveStripRate(board), 4100);
    assert.equal(resolveStripRate(null), null);
    assert.equal(resolveStripRate({ ...board, headlineRwfPerKg: null, bands: [] }), null);
  });
});

describe("displayStripRate", () => {
  it("falls back to the demo board rate when nothing is published", () => {
    assert.equal(displayStripRate(null), 4300);
    assert.equal(displayStripRate({ ...board, headlineRwfPerKg: null, bands: [] }), 4300);
    assert.equal(displayStripRate(board), 4100);
  });
});
