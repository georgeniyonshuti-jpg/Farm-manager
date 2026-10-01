/**
 * Weekly broiler board — broker quotes.
 * Farmer receipt and butcher receipt share one card. Never mix the two on the wire.
 */

export const DEFAULT_BANDS = [
  { minKg: 1.4, maxKg: 1.6, farmGateRwfPerKg: 3600, butcherRwfPerKg: 4100 },
  { minKg: 1.6, maxKg: 1.8, farmGateRwfPerKg: 3800, butcherRwfPerKg: 4300 },
  { minKg: 1.8, maxKg: 2.0, farmGateRwfPerKg: 4000, butcherRwfPerKg: 4550 },
  { minKg: 2.0, maxKg: 2.5, farmGateRwfPerKg: 4100, butcherRwfPerKg: 4700 },
];

export const DEFAULT_QUANTITY_TIERS = [
  { id: "kitchen", minBirds: 10, maxBirds: 49, label: "Kitchen", farmGateAdjRwf: 0, butcherAdjRwf: 150 },
  { id: "shop", minBirds: 50, maxBirds: 99, label: "Shop", farmGateAdjRwf: 0, butcherAdjRwf: 0 },
  { id: "usual", minBirds: 100, maxBirds: 199, label: "Usual", farmGateAdjRwf: -30, butcherAdjRwf: -50 },
  { id: "load", minBirds: 200, maxBirds: null, label: "Load", farmGateAdjRwf: -80, butcherAdjRwf: -150 },
];

export const RANK_MOQ_BIRDS = 50;
export const PRICED_OFFER_CAP = 8;
export const CLEVA_RUN_RANK_TOLERANCE = 0.05;
export const MARKET_ONLY_RAIL = { lo: 0.95, hi: 1.08 };
export const CLEVA_RUN_RAIL = { lo: 0.92, hi: 1.1 };
export const DEFAULT_CLEVA_RUN_COMMISSION_PCT = 2;

const FARMER_LEAK_KEYS = ["butcherRwfPerKg", "butcher", "spread", "youPayRwf", "fromRwfPerKg"];
const BOARD_LEAK_KEYS = ["farmGateRwfPerKg", "farmGate", "youReceiveRwf", "commissionRwf", "commissionPct", "clevaRunCommissionPct"];
const BUYER_LEAK_KEYS = ["farmGateRwfPerKg", "farmGate", "youReceiveRwf", "commissionRwf", "commissionPct", "askRwfPerKg", "askPricePerKg"];

export function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Monday–Sunday containing `now` (UTC date). */
export function defaultWeekBounds(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const from = new Date(d);
  from.setUTCDate(d.getUTCDate() + mondayOffset);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  return { validFrom: isoDate(from), validTo: isoDate(to) };
}

export function normalizeBand(raw) {
  const minKg = Number(raw?.minKg ?? raw?.min_kg);
  const maxKg = Number(raw?.maxKg ?? raw?.max_kg);
  const farmGateRwfPerKg = Math.round(Number(raw?.farmGateRwfPerKg ?? raw?.farm_gate_rwf_per_kg));
  const butcherRwfPerKg = Math.round(Number(raw?.butcherRwfPerKg ?? raw?.butcher_rwf_per_kg));
  if (
    !(minKg > 0) ||
    !(maxKg >= minKg) ||
    !Number.isFinite(farmGateRwfPerKg) ||
    farmGateRwfPerKg < 0 ||
    !Number.isFinite(butcherRwfPerKg) ||
    butcherRwfPerKg < 0
  ) {
    return null;
  }
  return { minKg, maxKg, farmGateRwfPerKg, butcherRwfPerKg };
}

export function normalizeBands(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizeBand).filter(Boolean).sort((a, b) => a.minKg - b.minKg);
}

export function validateBands(bands) {
  const list = normalizeBands(bands);
  if (!list.length) return { ok: false, error: "At least one weight band is required." };
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].minKg < list[i - 1].maxKg) {
      return { ok: false, error: "Weight bands cannot overlap." };
    }
  }
  return { ok: true, bands: list };
}

export function pickBand(bands, avgKg) {
  const kg = Number(avgKg);
  const list = normalizeBands(bands);
  if (!Number.isFinite(kg) || kg <= 0 || !list.length) return null;
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    const last = i === list.length - 1;
    if (kg >= b.minKg && (last ? kg <= b.maxKg : kg < b.maxKg)) return b;
  }
  return null;
}

export function normalizeQuantityTier(raw) {
  const id = String(raw?.id || "").trim().toLowerCase();
  const minBirds = Math.round(Number(raw?.minBirds ?? raw?.min_birds));
  const maxRaw = raw?.maxBirds ?? raw?.max_birds;
  const maxBirds = maxRaw == null || maxRaw === "" ? null : Math.round(Number(maxRaw));
  const label = String(raw?.label || id || "").trim();
  const farmGateAdjRwf = Math.round(Number(raw?.farmGateAdjRwf ?? raw?.farm_gate_adj_rwf) || 0);
  const butcherAdjRwf = Math.round(Number(raw?.butcherAdjRwf ?? raw?.butcher_adj_rwf) || 0);
  if (!id || !(minBirds > 0) || (maxBirds != null && !(maxBirds >= minBirds))) return null;
  return { id, minBirds, maxBirds, label: label || id, farmGateAdjRwf, butcherAdjRwf };
}

export function normalizeQuantityTiers(raw) {
  const list = Array.isArray(raw) ? raw.map(normalizeQuantityTier).filter(Boolean) : [];
  return list.length ? list.sort((a, b) => a.minBirds - b.minBirds) : DEFAULT_QUANTITY_TIERS.map((t) => ({ ...t }));
}

export function validateQuantityTiers(raw) {
  const list = normalizeQuantityTiers(raw);
  if (list.length < 1 || list.length > 4) return { ok: false, error: "Use 1–4 quantity tiers." };
  for (let i = 1; i < list.length; i += 1) {
    const prevMax = list[i - 1].maxBirds;
    if (prevMax != null && list[i].minBirds <= prevMax) {
      return { ok: false, error: "Quantity tiers cannot overlap." };
    }
  }
  return { ok: true, tiers: list };
}

export function pickQuantityTier(tiers, birds) {
  const n = Math.round(Number(birds));
  const list = normalizeQuantityTiers(tiers);
  if (!(n > 0) || !list.length) return null;
  for (const t of list) {
    const hi = t.maxBirds == null ? Infinity : t.maxBirds;
    if (n >= t.minBirds && n <= hi) return t;
  }
  return null;
}

export function merchantTierOf(lot = {}, company = {}) {
  const source = String(lot.source || lot.sourceType || "");
  const flockId = lot.flockId ?? lot.flock_id;
  const verified = String(
    company.verificationStatus ?? company.verification_status ?? lot.companyVerificationStatus ?? "verified"
  );
  return source === "managed_flock" && flockId && verified === "verified" ? "cleva_run" : "market_only";
}

export function askRails(card, avgKg, merchantTier = "market_only") {
  if (!card) return null;
  const band = pickBand(card.bands, avgKg);
  if (!band) return null;
  const mul = merchantTier === "cleva_run" ? CLEVA_RUN_RAIL : MARKET_ONLY_RAIL;
  return {
    min: Math.round(band.farmGateRwfPerKg * mul.lo),
    max: Math.round(band.farmGateRwfPerKg * mul.hi),
    boardFarmGate: band.farmGateRwfPerKg,
    merchantTier: merchantTier === "cleva_run" ? "cleva_run" : "market_only",
  };
}

export function isAskInRail(ask, rails) {
  const n = Math.round(Number(ask));
  if (!rails || !Number.isFinite(n) || n <= 0) return false;
  return n >= rails.min && n <= rails.max;
}

export function takePctFor(card, merchantTier = "market_only") {
  if (merchantTier === "cleva_run") {
    const n = Number(card?.clevaRunCommissionPct ?? card?.cleva_run_commission_pct);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CLEVA_RUN_COMMISSION_PCT;
  }
  return Number(card?.commissionPct ?? card?.commission_pct) || 0;
}

export function parseCardRow(row) {
  if (!row) return null;
  const bands = normalizeBands(row.bands);
  const quantityTiers = normalizeQuantityTiers(row.quantityTiers ?? row.quantity_tiers);
  const clevaRun = Number(row.clevaRunCommissionPct ?? row.cleva_run_commission_pct);
  return {
    id: String(row.id),
    validFrom: isoDate(row.validFrom ?? row.valid_from),
    validTo: isoDate(row.validTo ?? row.valid_to),
    status: String(row.status || "draft"),
    slaughterRwfPerBird: Math.max(0, Math.round(Number(row.slaughterRwfPerBird ?? row.slaughter_rwf_per_bird) || 0)),
    deliveryRwfPerTrip: Math.max(0, Math.round(Number(row.deliveryRwfPerTrip ?? row.delivery_rwf_per_trip) || 0)),
    commissionPct: Number(row.commissionPct ?? row.commission_pct) || 0,
    clevaRunCommissionPct: Number.isFinite(clevaRun) && clevaRun >= 0 ? clevaRun : DEFAULT_CLEVA_RUN_COMMISSION_PCT,
    bands,
    quantityTiers,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    publishedAt: row.publishedAt ?? row.published_at ?? null,
  };
}

/**
 * Full internal quote. Do not send this object to public farmer/board endpoints as-is.
 */
export function computeQuote(card, input = {}) {
  if (!card) return null;
  const birds = Math.round(Number(input.birds));
  const avgKg = Number(input.avgKg ?? input.avg_weight_kg);
  if (!(birds > 0) || !(avgKg > 0)) return null;
  const band = pickBand(card.bands, avgKg);
  if (!band) return null;
  const slaughterPayer = input.slaughterPayer === "farm" ? "farm" : "butcher";
  const delivery = Boolean(input.delivery);
  const meatRwf = Math.round(birds * avgKg * band.farmGateRwfPerKg);
  const commissionRwf = Math.round(meatRwf * (Number(card.commissionPct) || 0) / 100);
  const processingRwf = slaughterPayer === "farm" ? card.slaughterRwfPerBird * birds : 0;
  const youReceiveRwf = meatRwf - commissionRwf - processingRwf;
  const butcherMeatRwf = Math.round(birds * avgKg * band.butcherRwfPerKg);
  const slaughterRwf = slaughterPayer === "butcher" ? card.slaughterRwfPerBird * birds : 0;
  const deliveryRwf = delivery ? card.deliveryRwfPerTrip : 0;
  return {
    cardId: card.id,
    validFrom: card.validFrom,
    validTo: card.validTo,
    birds,
    avgKg,
    slaughterPayer,
    delivery,
    band: { minKg: band.minKg, maxKg: band.maxKg },
    farmer: {
      farmGateRwfPerKg: band.farmGateRwfPerKg,
      meatRwf,
      commissionRwf,
      commissionPct: Number(card.commissionPct) || 0,
      processingRwf,
      youReceiveRwf,
    },
    butcher: {
      butcherRwfPerKg: band.butcherRwfPerKg,
      meatRwf: butcherMeatRwf,
      slaughterRwf,
      deliveryRwf,
      youPayRwf: butcherMeatRwf + slaughterRwf + deliveryRwf,
    },
  };
}

/**
 * Lot-specific offer: farmer ask + volume adj + take. Single path for list, lead, book.
 */
export function computeOffer(card, input = {}) {
  if (!card) return null;
  const birds = Math.round(Number(input.birds));
  const avgKg = Number(input.avgKg ?? input.avg_weight_kg);
  if (!(birds > 0) || !(avgKg > 0)) return null;
  const band = pickBand(card.bands, avgKg);
  if (!band) return null;
  const merchantTier = input.merchantTier === "cleva_run" ? "cleva_run" : "market_only";
  const tier = pickQuantityTier(card.quantityTiers, birds);
  const askRaw = Number(input.askRwfPerKg ?? input.askPricePerKg);
  const askRwfPerKg = Number.isFinite(askRaw) && askRaw > 0 ? Math.round(askRaw) : band.farmGateRwfPerKg;
  const farmGateAdj = tier?.farmGateAdjRwf || 0;
  const butcherAdj = tier?.butcherAdjRwf || 0;
  const farmGateRwfPerKg = Math.max(0, askRwfPerKg + farmGateAdj);
  const spread = band.butcherRwfPerKg - band.farmGateRwfPerKg;
  const butcherRwfPerKg = Math.max(0, askRwfPerKg + spread + butcherAdj);
  const slaughterPayer = input.slaughterPayer === "farm" ? "farm" : "butcher";
  const delivery = Boolean(input.delivery);
  const commissionPct = takePctFor(card, merchantTier);
  const meatRwf = Math.round(birds * avgKg * farmGateRwfPerKg);
  const commissionRwf = Math.round((meatRwf * commissionPct) / 100);
  const processingRwf = slaughterPayer === "farm" ? (card.slaughterRwfPerBird || 0) * birds : 0;
  const youReceiveRwf = meatRwf - commissionRwf - processingRwf;
  const butcherMeatRwf = Math.round(birds * avgKg * butcherRwfPerKg);
  const slaughterRwf = slaughterPayer === "butcher" ? (card.slaughterRwfPerBird || 0) * birds : 0;
  const deliveryRwf = delivery ? card.deliveryRwfPerTrip || 0 : 0;
  const rails = askRails(card, avgKg, merchantTier);
  const rankEligible =
    birds >= RANK_MOQ_BIRDS &&
    Boolean(tier) &&
    isAskInRail(askRwfPerKg, rails) &&
    input.rankEligible !== false;
  return {
    cardId: card.id,
    validFrom: card.validFrom,
    validTo: card.validTo,
    birds,
    avgKg,
    slaughterPayer,
    delivery,
    merchantTier,
    askRwfPerKg,
    rankEligible,
    readyFrom: input.readyFrom || null,
    birdsAvailable: Number(input.birdsAvailable || birds),
    quantityTier: tier
      ? { id: tier.id, label: tier.label, minBirds: tier.minBirds, maxBirds: tier.maxBirds }
      : null,
    band: { minKg: band.minKg, maxKg: band.maxKg },
    farmer: {
      farmGateRwfPerKg,
      meatRwf,
      commissionRwf,
      commissionPct,
      processingRwf,
      youReceiveRwf,
    },
    butcher: {
      butcherRwfPerKg,
      meatRwf: butcherMeatRwf,
      slaughterRwf,
      deliveryRwf,
      youPayRwf: butcherMeatRwf + slaughterRwf + deliveryRwf,
    },
  };
}

export function publicBuyerOffer(full) {
  if (!full) return null;
  return {
    cardId: full.cardId,
    validFrom: full.validFrom,
    validTo: full.validTo,
    birds: full.birds,
    avgKg: full.avgKg,
    slaughterPayer: full.slaughterPayer,
    delivery: full.delivery,
    merchantTier: full.merchantTier,
    rankEligible: Boolean(full.rankEligible),
    quantityTier: full.quantityTier,
    buyer: {
      buyerRwfPerKg: full.butcher.butcherRwfPerKg,
      meatRwf: full.butcher.meatRwf,
      slaughterRwf: full.butcher.slaughterRwf,
      deliveryRwf: full.butcher.deliveryRwf,
      youPayRwf: full.butcher.youPayRwf,
    },
  };
}

export function publicBuyerLeadSnapshot(full, extra = {}) {
  const pub = publicBuyerOffer(full);
  if (!pub) return null;
  return {
    ...pub,
    publicRef: extra.publicRef || null,
  };
}

export function rankScore(offer, cheapestBuyerKg) {
  const landed = Number(offer?.butcher?.butcherRwfPerKg);
  if (!Number.isFinite(landed)) return Number.POSITIVE_INFINITY;
  if (offer.merchantTier === "cleva_run") {
    const floor = Number.isFinite(cheapestBuyerKg) ? cheapestBuyerKg : landed;
    if (landed <= floor * (1 + CLEVA_RUN_RANK_TOLERANCE)) {
      return landed / (1 + CLEVA_RUN_RANK_TOLERANCE);
    }
  }
  return landed;
}

export function sortOffers(offers) {
  const list = (offers || []).filter((o) => o && o.rankEligible);
  const cheapest = list.reduce((min, o) => Math.min(min, o.butcher.butcherRwfPerKg), Number.POSITIVE_INFINITY);
  return [...list].sort((a, b) => {
    const sa = rankScore(a, cheapest);
    const sb = rankScore(b, cheapest);
    if (sa !== sb) return sa - sb;
    if (a.merchantTier !== b.merchantTier) return a.merchantTier === "cleva_run" ? -1 : 1;
    const ra = String(a.readyFrom || "");
    const rb = String(b.readyFrom || "");
    if (ra !== rb) return ra.localeCompare(rb);
    return Number(b.birdsAvailable || 0) - Number(a.birdsAvailable || 0);
  });
}

export function capPricedOffers(sorted, cap = PRICED_OFFER_CAP) {
  const list = sorted || [];
  return { priced: list.slice(0, cap), overflow: list.slice(cap) };
}

export function listingRankDecision(card, { ask, avgKg, birds, merchantTier } = {}) {
  const rails = card ? askRails(card, avgKg, merchantTier) : null;
  const inRail = rails ? isAskInRail(ask, rails) : false;
  const rankEligible = Boolean(inRail && Number(birds) >= RANK_MOQ_BIRDS);
  return { rails, inRail, rankEligible, merchantTier: merchantTier === "cleva_run" ? "cleva_run" : "market_only" };
}

export function shouldSkipListingReview({ merchantTier, priceOnly, inRail } = {}) {
  return merchantTier === "cleva_run" && priceOnly === true && inRail === true;
}

export function resolveLockedBookPrices(offer, { opsOverride = null } = {}) {
  if (!offer) return { ok: false, error: "Could not price this trip." };
  if (!offer.rankEligible) {
    return { ok: false, error: "Lot is not rank-eligible at this trip size or ask." };
  }
  const override = Number(opsOverride);
  const buyerKg =
    Number.isFinite(override) && override > 0 ? Math.round(override) : offer.butcher.butcherRwfPerKg;
  return {
    ok: true,
    buyerKg,
    farmGateKg: offer.farmer.farmGateRwfPerKg,
    quantityTier: offer.quantityTier?.id || null,
    cardId: offer.cardId || null,
    offer,
  };
}

/**
 * Two-sided money split. Buyer lines always sum to youPayRwf.
 * Farmer net is what Cleva pays the farm after service + visit + farm-paid processing.
 */
export function buildMoneySplit(offer, extra = {}) {
  if (!offer?.farmer || !offer?.butcher) return null;
  const visitFeeRwf = Math.max(0, Math.round(Number(extra.visitFeeRwf) || 0));
  const processingBuyer = Math.max(0, Math.round(Number(offer.butcher.slaughterRwf) || 0));
  const transportRwf = Math.max(0, Math.round(Number(offer.butcher.deliveryRwf) || 0));
  const youPayRwf = Math.round(Number(offer.butcher.youPayRwf) || 0);
  const farmerNetRwf = Math.round(Number(offer.farmer.youReceiveRwf) || 0) - visitFeeRwf;
  const clevaServiceRwf = Math.max(0, youPayRwf - farmerNetRwf - processingBuyer - transportRwf);
  return {
    birds: offer.birds,
    avgKg: offer.avgKg,
    buyerRwfPerKg: offer.butcher.butcherRwfPerKg,
    farmGateRwfPerKg: offer.farmer.farmGateRwfPerKg,
    youPayRwf,
    farmerNetRwf,
    visitFeeRwf,
    servicePct: Number(offer.farmer.commissionPct) || 0,
    lines: {
      farmer: farmerNetRwf,
      clevaService: clevaServiceRwf,
      visit: visitFeeRwf,
      processing: processingBuyer,
      transport: transportRwf,
    },
    farmer: {
      grossRwf: Math.round(Number(offer.farmer.meatRwf) || 0),
      serviceRwf: Math.round(Number(offer.farmer.commissionRwf) || 0),
      servicePct: Number(offer.farmer.commissionPct) || 0,
      visitFeeRwf,
      processingRwf: Math.round(Number(offer.farmer.processingRwf) || 0),
      youReceiveRwf: farmerNetRwf,
    },
    buyer: {
      meatRwf: Math.round(Number(offer.butcher.meatRwf) || 0),
      processingRwf: processingBuyer,
      transportRwf,
      youPayRwf,
    },
  };
}

export function publicBuyerMoneySplit(split, opts = {}) {
  if (!split) return null;
  const actor = String(opts.deliveryActor || "").toLowerCase();
  const transportLabelKey =
    actor === "cleva" ? "splitClevaDelivery" : actor === "farm" || split.lines.transport > 0
      ? "splitFarmDelivery"
      : "splitTransport";
  return {
    birds: split.birds,
    avgKg: split.avgKg,
    buyerRwfPerKg: split.buyerRwfPerKg,
    youPayRwf: split.youPayRwf,
    deliveryActor: actor === "buyer" || actor === "farm" || actor === "cleva" ? actor : null,
    lines: [
      { key: "farmer", labelKey: "splitFarmer", rwf: split.lines.farmer },
      { key: "service", labelKey: "splitService", rwf: split.lines.clevaService },
      { key: "processing", labelKey: "splitProcessing", rwf: split.lines.processing },
      { key: "transport", labelKey: transportLabelKey, rwf: split.lines.transport },
    ].filter((line) => line.rwf > 0 || line.key === "farmer" || line.key === "service"),
  };
}

export function farmerMoneySplitView(split) {
  if (!split) return null;
  return {
    farmGateRwfPerKg: split.farmGateRwfPerKg,
    birds: split.birds,
    avgKg: split.avgKg,
    youReceiveRwf: split.farmer.youReceiveRwf,
    servicePct: split.farmer.servicePct,
    lines: [
      { key: "gross", labelKey: "splitFarmGross", rwf: split.farmer.grossRwf },
      { key: "service", labelKey: "splitFarmService", rwf: -split.farmer.serviceRwf, pct: split.farmer.servicePct },
      { key: "visit", labelKey: "splitFarmVisit", rwf: -split.farmer.visitFeeRwf },
      { key: "processing", labelKey: "splitFarmProcessing", rwf: -split.farmer.processingRwf },
    ].filter((line) => line.rwf !== 0 || line.key === "gross" || line.key === "service"),
  };
}

export function birdsToNextTier(tiers, birds) {
  const n = Math.round(Number(birds));
  const list = normalizeQuantityTiers(tiers);
  const current = pickQuantityTier(list, n);
  if (!current) {
    const first = list[0];
    if (!first) return null;
    return { birdsNeeded: Math.max(0, first.minBirds - n), tier: first };
  }
  const idx = list.findIndex((t) => t.id === current.id);
  const next = list[idx + 1];
  if (!next) return null;
  return { birdsNeeded: Math.max(0, next.minBirds - n), tier: next };
}

export function publicFarmerQuote(full) {
  if (!full) return null;
  return {
    cardId: full.cardId,
    validFrom: full.validFrom,
    validTo: full.validTo,
    birds: full.birds,
    avgKg: full.avgKg,
    slaughterPayer: full.slaughterPayer,
    delivery: full.delivery,
    farmer: { ...full.farmer },
  };
}

/** Lowest butcher band on a card — the "from X RWF/kg" headline. */
export function headlineRwfPerKg(card) {
  const list = normalizeBands(card?.bands).filter((b) => b.butcherRwfPerKg > 0);
  if (!list.length) return null;
  return list.reduce((m, b) => Math.min(m, b.butcherRwfPerKg), Number.POSITIVE_INFINITY);
}

/** Week-over-week change of the headline rate; null without a comparable previous card. */
export function rateTrend(current, previous) {
  const now = headlineRwfPerKg(current);
  const prev = headlineRwfPerKg(previous);
  if (!(now > 0) || !(prev > 0)) return null;
  return {
    previousRwfPerKg: prev,
    changePct: Math.round(((now - prev) / prev) * 1000) / 10,
  };
}

/**
 * Average farm-gate ask across verified listings, overall and per weight band.
 * Desk-only: asks are farm-gate prices and never go to the public board.
 */
export function suggestFarmGateFromAsks(rows, bands) {
  const asks = (rows || [])
    .map((r) => ({ ask: Number(r.askRwfPerKg), kg: Number(r.avgKg) }))
    .filter((r) => r.ask > 0);
  if (!asks.length) return null;
  const avg = (list) => Math.round(list.reduce((s, r) => s + r.ask, 0) / list.length);
  return {
    sampleSize: asks.length,
    avgRwfPerKg: avg(asks),
    bands: normalizeBands(bands).map((b, i, list) => {
      const last = i === list.length - 1;
      const inBand = asks.filter((r) => r.kg >= b.minKg && (last ? r.kg <= b.maxKg : r.kg < b.maxKg));
      return {
        minKg: b.minKg,
        maxKg: b.maxKg,
        sampleSize: inBand.length,
        avgRwfPerKg: inBand.length ? avg(inBand) : null,
      };
    }),
  };
}

export function publicBoard(card, previous = null) {
  if (!card) return null;
  const tiers = normalizeQuantityTiers(card.quantityTiers);
  const minButcher = card.bands.reduce((m, b) => Math.min(m, b.butcherRwfPerKg), Number.POSITIVE_INFINITY);
  return {
    validFrom: card.validFrom,
    validTo: card.validTo,
    headlineRwfPerKg: headlineRwfPerKg(card),
    trend: rateTrend(card, previous),
    slaughterRwfPerBird: card.slaughterRwfPerBird,
    deliveryRwfPerTrip: card.deliveryRwfPerTrip,
    bands: card.bands.map((b) => ({
      minKg: b.minKg,
      maxKg: b.maxKg,
      fromRwfPerKg: b.butcherRwfPerKg,
    })),
    quantityTiers: tiers.map((t) => ({
      id: t.id,
      label: t.label,
      minBirds: t.minBirds,
      maxBirds: t.maxBirds,
      fromRwfPerKg: Number.isFinite(minButcher) ? minButcher + t.butcherAdjRwf : null,
    })),
    rankMoq: RANK_MOQ_BIRDS,
  };
}

export function butcherPayFromBoard(board, input = {}) {
  if (!board) return null;
  const birds = Math.round(Number(input.birds));
  const avgKg = Number(input.avgKg);
  if (!(birds > 0) || !(avgKg > 0)) return null;
  const band = (board.bands || []).find((b, i, list) => {
    const last = i === list.length - 1;
    return avgKg >= b.minKg && (last ? avgKg <= b.maxKg : avgKg < b.maxKg);
  });
  if (!band) return null;
  const slaughterPayer = input.slaughterPayer === "farm" ? "farm" : "butcher";
  const delivery = Boolean(input.delivery);
  const tiers = board.quantityTiers || [];
  const tier = tiers.find((t) => {
    const hi = t.maxBirds == null ? Infinity : t.maxBirds;
    return birds >= t.minBirds && birds <= hi;
  });
  const minFrom = (board.bands || []).reduce(
    (m, b) => Math.min(m, Number(b.fromRwfPerKg) || Infinity),
    Number.POSITIVE_INFINITY
  );
  const adj =
    tier && Number.isFinite(tier.fromRwfPerKg) && Number.isFinite(minFrom)
      ? Number(tier.fromRwfPerKg) - minFrom
      : 0;
  const butcherRwfPerKg = band.fromRwfPerKg + adj;
  const meatRwf = Math.round(birds * avgKg * butcherRwfPerKg);
  const slaughterRwf = slaughterPayer === "butcher" ? (board.slaughterRwfPerBird || 0) * birds : 0;
  const deliveryRwf = delivery ? board.deliveryRwfPerTrip || 0 : 0;
  return {
    butcherRwfPerKg,
    meatRwf,
    slaughterRwf,
    deliveryRwf,
    youPayRwf: meatRwf + slaughterRwf + deliveryRwf,
    validTo: board.validTo,
  };
}

function collectKeys(value, acc = new Set()) {
  if (!value || typeof value !== "object") return acc;
  for (const [k, v] of Object.entries(value)) {
    acc.add(k);
    collectKeys(v, acc);
  }
  return acc;
}

export function farmerQuoteLeaks(payload) {
  const keys = collectKeys(payload);
  return FARMER_LEAK_KEYS.filter((k) => keys.has(k));
}

export function boardLeaks(payload) {
  const keys = collectKeys(payload);
  return BOARD_LEAK_KEYS.filter((k) => keys.has(k));
}

export function buyerOfferLeaks(payload) {
  const keys = collectKeys(payload);
  return BUYER_LEAK_KEYS.filter((k) => keys.has(k));
}

export function farmGateFromQuoteJson(quoteJson) {
  const n = Number(quoteJson?.farmer?.farmGateRwfPerKg);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CARD_SELECT = `
  id::text AS id,
  valid_from AS "validFrom",
  valid_to AS "validTo",
  status,
  slaughter_rwf_per_bird AS "slaughterRwfPerBird",
  delivery_rwf_per_trip AS "deliveryRwfPerTrip",
  commission_pct AS "commissionPct",
  COALESCE(cleva_run_commission_pct, 2) AS "clevaRunCommissionPct",
  bands,
  COALESCE(quantity_tiers, '[]'::jsonb) AS "quantityTiers",
  notes,
  created_at AS "createdAt",
  updated_at AS "updatedAt",
  published_at AS "publishedAt"
`;

export async function loadPublishedCard(dbQuery, now = new Date()) {
  try {
    const today = isoDate(now);
    const r = await dbQuery(
      `SELECT ${CARD_SELECT}
         FROM market_rate_cards
        WHERE status = 'published'
          AND valid_from <= $1::date
          AND valid_to >= $1::date
        ORDER BY valid_from DESC
        LIMIT 1`,
      [today]
    );
    return parseCardRow(r.rows[0] || null);
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return null;
    throw e;
  }
}

/** The card that was live before `card`, for the trend. Drafts never count. */
export async function loadPreviousCard(dbQuery, card) {
  if (!card) return null;
  try {
    const r = await dbQuery(
      `SELECT ${CARD_SELECT}
         FROM market_rate_cards
        WHERE status IN ('published', 'archived')
          AND published_at IS NOT NULL
          AND valid_from < $1::date
          AND id <> $2::uuid
        ORDER BY valid_from DESC
        LIMIT 1`,
      [card.validFrom, card.id]
    );
    return parseCardRow(r.rows[0] || null);
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return null;
    throw e;
  }
}

export async function loadLatestCard(dbQuery) {
  try {
    const r = await dbQuery(
      `SELECT ${CARD_SELECT}
         FROM market_rate_cards
        ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                 valid_from DESC
        LIMIT 20`
    );
    return r.rows.map(parseCardRow);
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") return [];
    throw e;
  }
}

export { CARD_SELECT };
