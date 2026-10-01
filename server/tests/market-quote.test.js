import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMoneySplit,
  farmerMoneySplitView,
  headlineRwfPerKg,
  publicBuyerMoneySplit,
  rateTrend,
  suggestFarmGateFromAsks,
  askRails,
  boardLeaks,
  butcherPayFromBoard,
  buyerOfferLeaks,
  capPricedOffers,
  computeOffer,
  computeQuote,
  DEFAULT_BANDS,
  defaultWeekBounds,
  farmGateFromQuoteJson,
  farmerQuoteLeaks,
  isAskInRail,
  listingRankDecision,
  merchantTierOf,
  pickBand,
  pickQuantityTier,
  publicBoard,
  publicBuyerLeadSnapshot,
  publicBuyerOffer,
  publicFarmerQuote,
  resolveLockedBookPrices,
  shouldSkipListingReview,
  sortOffers,
  takePctFor,
  validateBands,
  validateQuantityTiers,
} from "../src/services/pipeline/marketQuote.js";

const card = {
  id: "card-1",
  validFrom: "2026-09-21",
  validTo: "2026-09-27",
  slaughterRwfPerBird: 200,
  deliveryRwfPerTrip: 15000,
  commissionPct: 5,
  clevaRunCommissionPct: 2,
  bands: DEFAULT_BANDS,
};

describe("marketQuote bands", () => {
  it("picks inclusive last band and rejects out of range", () => {
    assert.equal(pickBand(DEFAULT_BANDS, 1.7).farmGateRwfPerKg, 3800);
    assert.equal(pickBand(DEFAULT_BANDS, 2.5).farmGateRwfPerKg, 4100);
    assert.equal(pickBand(DEFAULT_BANDS, 1.2), null);
    assert.equal(pickBand(DEFAULT_BANDS, 2.6), null);
  });

  it("rejects overlapping bands", () => {
    const v = validateBands([
      { minKg: 1.4, maxKg: 1.8, farmGateRwfPerKg: 1, butcherRwfPerKg: 2 },
      { minKg: 1.6, maxKg: 2.0, farmGateRwfPerKg: 1, butcherRwfPerKg: 2 },
    ]);
    assert.equal(v.ok, false);
  });
});

describe("marketQuote receipts", () => {
  it("computes farmer you-receive and butcher you-pay from the same card", () => {
    const q = computeQuote(card, { birds: 200, avgKg: 1.8, slaughterPayer: "butcher", delivery: true });
    assert.ok(q);
    assert.equal(q.farmer.farmGateRwfPerKg, 4000);
    assert.equal(q.farmer.meatRwf, 1_440_000);
    assert.equal(q.farmer.commissionRwf, 72_000);
    assert.equal(q.farmer.processingRwf, 0);
    assert.equal(q.farmer.youReceiveRwf, 1_368_000);
    assert.equal(q.butcher.butcherRwfPerKg, 4550);
    assert.equal(q.butcher.meatRwf, 1_638_000);
    assert.equal(q.butcher.slaughterRwf, 40_000);
    assert.equal(q.butcher.deliveryRwf, 15_000);
    assert.equal(q.butcher.youPayRwf, 1_693_000);
  });

  it("splits buyer pay so farm, service, processing and transport add up", () => {
    const q = computeQuote(card, { birds: 200, avgKg: 1.8, slaughterPayer: "butcher", delivery: true });
    const split = buildMoneySplit(q, { visitFeeRwf: 10_000 });
    assert.ok(split);
    assert.equal(split.youPayRwf, 1_693_000);
    assert.equal(split.farmerNetRwf, 1_358_000);
    assert.equal(split.lines.farmer + split.lines.clevaService + split.lines.processing + split.lines.transport, 1_693_000);
    const buyer = publicBuyerMoneySplit(split);
    assert.equal(
      buyer.lines.reduce((sum, line) => sum + line.rwf, 0),
      buyer.youPayRwf
    );
    const farm = farmerMoneySplitView(split);
    assert.equal(farm.youReceiveRwf, 1_358_000);
    assert.equal(farm.lines.find((l) => l.key === "visit")?.rwf, -10_000);
    assert.equal(farm.servicePct, 5);
  });

  it("charges slaughter to the farmer only when they pay processing", () => {
    const q = computeQuote(card, { birds: 100, avgKg: 1.8, slaughterPayer: "farm" });
    assert.equal(q.farmer.processingRwf, 20_000);
    assert.equal(q.butcher.slaughterRwf, 0);
  });

  it("returns null without a matching band or card", () => {
    assert.equal(computeQuote(null, { birds: 50, avgKg: 1.8 }), null);
    assert.equal(computeQuote(card, { birds: 50, avgKg: 0.9 }), null);
  });
});

describe("marketQuote side-safe payloads", () => {
  it("farmer public quote omits butcher price and spread", () => {
    const q = computeQuote(card, { birds: 50, avgKg: 1.7 });
    const pub = publicFarmerQuote(q);
    assert.equal(farmerQuoteLeaks(pub).length, 0);
    assert.ok(pub.farmer.youReceiveRwf > 0);
    assert.equal(pub.butcher, undefined);
  });

  it("board omits farm-gate and commission", () => {
    const board = publicBoard(card);
    assert.equal(boardLeaks(board).length, 0);
    assert.equal(board.bands[2].fromRwfPerKg, 4550);
    assert.equal(board.bands[2].farmGateRwfPerKg, undefined);
  });

  it("butcherPayFromBoard matches computeQuote butcher total", () => {
    const q = computeQuote(card, { birds: 80, avgKg: 1.9, delivery: true });
    const pay = butcherPayFromBoard(publicBoard(card), { birds: 80, avgKg: 1.9, delivery: true });
    assert.equal(pay.youPayRwf, q.butcher.youPayRwf);
  });

  it("reads farm-gate from a stored snapshot", () => {
    const q = computeQuote(card, { birds: 10, avgKg: 1.8 });
    assert.equal(farmGateFromQuoteJson(publicFarmerQuote(q)), 4000);
  });
});

describe("marketQuote week", () => {
  it("returns a Monday–Sunday window", () => {
    const w = defaultWeekBounds(new Date("2026-09-25T10:00:00Z"));
    assert.equal(w.validFrom, "2026-09-21");
    assert.equal(w.validTo, "2026-09-27");
  });
});

describe("marketQuote offer pricing", () => {
  it("picks quantity tiers and rejects overlap", () => {
    assert.equal(pickQuantityTier(undefined, 20).id, "kitchen");
    assert.equal(pickQuantityTier(undefined, 80).id, "shop");
    assert.equal(pickQuantityTier(undefined, 120).id, "usual");
    assert.equal(pickQuantityTier(undefined, 200).id, "load");
    assert.equal(pickQuantityTier(undefined, 5), null);
    const v = validateQuantityTiers([
      { id: "a", minBirds: 50, maxBirds: 120, farmGateAdjRwf: 0, butcherAdjRwf: 0 },
      { id: "b", minBirds: 100, maxBirds: 200, farmGateAdjRwf: 0, butcherAdjRwf: 0 },
    ]);
    assert.equal(v.ok, false);
  });

  it("applies volume adj and Cleva-run take from the farmer ask", () => {
    const market = computeOffer(card, {
      birds: 120,
      avgKg: 1.8,
      askRwfPerKg: 4000,
      merchantTier: "market_only",
      slaughterPayer: "butcher",
    });
    assert.equal(market.quantityTier.id, "usual");
    assert.equal(market.farmer.farmGateRwfPerKg, 3970);
    assert.equal(market.farmer.commissionPct, 5);
    assert.equal(market.butcher.butcherRwfPerKg, 4500);
    const run = computeOffer(card, {
      birds: 120,
      avgKg: 1.8,
      askRwfPerKg: 4000,
      merchantTier: "cleva_run",
    });
    assert.equal(run.farmer.commissionPct, 2);
    assert.equal(takePctFor(card, "cleva_run"), 2);
  });

  it("rails market-only tighter than Cleva-run", () => {
    const market = askRails(card, 1.8, "market_only");
    const run = askRails(card, 1.8, "cleva_run");
    assert.equal(market.boardFarmGate, 4000);
    assert.equal(market.min, 3800);
    assert.equal(market.max, 4320);
    assert.ok(run.min < market.min);
    assert.ok(run.max > market.max);
    assert.equal(isAskInRail(4000, market), true);
    assert.equal(isAskInRail(5000, market), false);
  });

  it("does not rank below MOQ or out of rail", () => {
    assert.equal(computeOffer(card, { birds: 20, avgKg: 1.8, askRwfPerKg: 4000 }).rankEligible, false);
    assert.equal(computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 9000 }).rankEligible, false);
    assert.equal(computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 4000 }).rankEligible, true);
  });

  it("buyer payload omits farm-gate and take", () => {
    const offer = computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 4000 });
    const pub = publicBuyerOffer(offer);
    assert.equal(buyerOfferLeaks(pub).length, 0);
    assert.equal(pub.buyer.youPayRwf > 0, true);
    assert.equal(pub.farmer, undefined);
  });

  it("board quantity tiers omit farm-gate adj", () => {
    const board = publicBoard(card);
    assert.equal(boardLeaks(board).length, 0);
    assert.equal(board.quantityTiers[0].id, "kitchen");
    assert.ok(board.quantityTiers[0].fromRwfPerKg);
    assert.equal(board.quantityTiers[1].id, "shop");
    assert.equal(JSON.stringify(board).includes("farmGate"), false);
  });

  it("ranks Cleva-run within 5% ahead of cheaper market-only at the same landed band", () => {
    const cheapMarket = computeOffer(card, {
      birds: 100,
      avgKg: 1.8,
      askRwfPerKg: 4000,
      merchantTier: "market_only",
      readyFrom: "2026-09-22",
    });
    const run = computeOffer(card, {
      birds: 100,
      avgKg: 1.8,
      askRwfPerKg: 4160,
      merchantTier: "cleva_run",
      readyFrom: "2026-09-22",
    });
    const dearMarket = computeOffer(card, {
      birds: 100,
      avgKg: 1.8,
      askRwfPerKg: 4200,
      merchantTier: "market_only",
      readyFrom: "2026-09-22",
    });
    const ranked = sortOffers([dearMarket, run, cheapMarket]);
    assert.equal(ranked[0].merchantTier, "cleva_run");
    assert.equal(ranked[1].askRwfPerKg, 4000);
    const { priced, overflow } = capPricedOffers(ranked, 1);
    assert.equal(priced.length, 1);
    assert.equal(overflow.length, 2);
  });

  it("detects Cleva-run only from a managed verified flock", () => {
    assert.equal(merchantTierOf({ source: "managed_flock", flockId: "f1" }, { verificationStatus: "verified" }), "cleva_run");
    assert.equal(merchantTierOf({ source: "scout", flockId: null }, { verificationStatus: "verified" }), "market_only");
    assert.equal(merchantTierOf({ source: "managed_flock", flockId: "f1" }, { verificationStatus: "pending" }), "market_only");
  });

  it("sorts by buyer landed, not raw farmer ask", () => {
    const lowAsk = computeOffer(card, {
      birds: 100,
      avgKg: 1.8,
      askRwfPerKg: 3900,
      merchantTier: "market_only",
      readyFrom: "2026-09-24",
    });
    const highAsk = computeOffer(card, {
      birds: 100,
      avgKg: 1.8,
      askRwfPerKg: 4200,
      merchantTier: "market_only",
      readyFrom: "2026-09-21",
    });
    const ranked = sortOffers([highAsk, lowAsk]);
    assert.ok(ranked[0].butcher.butcherRwfPerKg < ranked[1].butcher.butcherRwfPerKg);
    assert.notEqual(ranked[0].askRwfPerKg, 4200);
  });

  it("locks the server buyer price and ignores a client agreed price", () => {
    const offer = computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 4000 });
    const partner = resolveLockedBookPrices(offer, { opsOverride: null });
    assert.equal(partner.ok, true);
    assert.equal(partner.buyerKg, offer.butcher.butcherRwfPerKg);
    assert.equal(partner.farmGateKg, offer.farmer.farmGateRwfPerKg);
    assert.notEqual(partner.buyerKg, 1111);
    const ops = resolveLockedBookPrices(offer, { opsOverride: 4100 });
    assert.equal(ops.buyerKg, 4100);
    const out = resolveLockedBookPrices(
      computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 9000 }),
      {}
    );
    assert.equal(out.ok, false);
  });

  it("marks out-of-rail listings not rank-eligible and skips Cleva-run in-rail review", () => {
    const out = listingRankDecision(card, { ask: 9000, avgKg: 1.8, birds: 80, merchantTier: "market_only" });
    assert.equal(out.inRail, false);
    assert.equal(out.rankEligible, false);
    const inn = listingRankDecision(card, { ask: 4000, avgKg: 1.8, birds: 80, merchantTier: "cleva_run" });
    assert.equal(inn.rankEligible, true);
    assert.equal(shouldSkipListingReview({ merchantTier: "cleva_run", priceOnly: true, inRail: true }), true);
    assert.equal(shouldSkipListingReview({ merchantTier: "market_only", priceOnly: true, inRail: true }), false);
    assert.equal(shouldSkipListingReview({ merchantTier: "cleva_run", priceOnly: false, inRail: true }), false);
  });

  it("guest lead snapshot is buyer you-pay only", () => {
    const offer = computeOffer(card, { birds: 80, avgKg: 1.8, askRwfPerKg: 4000 });
    const snap = publicBuyerLeadSnapshot(offer, { publicRef: "LOT-ABC123" });
    assert.equal(buyerOfferLeaks(snap).length, 0);
    assert.equal(snap.publicRef, "LOT-ABC123");
    assert.ok(snap.buyer.youPayRwf > 0);
    assert.equal(snap.farmer, undefined);
    assert.equal(JSON.stringify(snap).includes("farmGate"), false);
  });
});

describe("board headline and trend", () => {
  const bands = (butcher) => [
    { minKg: 1.4, maxKg: 1.8, farmGateRwfPerKg: 3600, butcherRwfPerKg: butcher },
    { minKg: 1.8, maxKg: 2.2, farmGateRwfPerKg: 3900, butcherRwfPerKg: butcher + 200 },
  ];

  it("headline is the lowest butcher band", () => {
    assert.equal(headlineRwfPerKg({ bands: bands(4300) }), 4300);
    assert.equal(headlineRwfPerKg({ bands: [] }), null);
    assert.equal(headlineRwfPerKg(null), null);
  });

  it("trend compares headlines week over week, to one decimal", () => {
    assert.deepEqual(rateTrend({ bands: bands(4300) }, { bands: bands(4200) }), {
      previousRwfPerKg: 4200,
      changePct: 2.4,
    });
    assert.equal(rateTrend({ bands: bands(4300) }, null), null);
  });

  it("public board carries headline and trend without farm-gate leaks", () => {
    const board = publicBoard(
      { ...card, bands: bands(4300) },
      { ...card, bands: bands(4400) }
    );
    assert.equal(board.headlineRwfPerKg, 4300);
    assert.equal(board.trend.changePct, -2.3);
    assert.deepEqual(boardLeaks(board), []);
  });
});

describe("suggestFarmGateFromAsks", () => {
  const bands = [
    { minKg: 1.4, maxKg: 1.8, farmGateRwfPerKg: 3600, butcherRwfPerKg: 4100 },
    { minKg: 1.8, maxKg: 2.2, farmGateRwfPerKg: 3900, butcherRwfPerKg: 4400 },
  ];

  it("averages verified asks overall and per band", () => {
    const s = suggestFarmGateFromAsks(
      [
        { askRwfPerKg: 3700, avgKg: 1.6 },
        { askRwfPerKg: 3800, avgKg: 1.7 },
        { askRwfPerKg: 4000, avgKg: 2.0 },
        { askRwfPerKg: 0, avgKg: 2.0 },
      ],
      bands
    );
    assert.equal(s.sampleSize, 3);
    assert.equal(s.avgRwfPerKg, 3833);
    assert.deepEqual(
      s.bands.map((b) => [b.sampleSize, b.avgRwfPerKg]),
      [
        [2, 3750],
        [1, 4000],
      ]
    );
  });

  it("returns null with no usable asks", () => {
    assert.equal(suggestFarmGateFromAsks([], bands), null);
    assert.equal(suggestFarmGateFromAsks([{ askRwfPerKg: null, avgKg: 1.8 }], bands), null);
  });
});
