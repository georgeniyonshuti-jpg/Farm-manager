/**
 * Public marketplace projections — allowlist only, never tenant internals.
 */

import { forwardWeekBuckets, remainingBirds } from "./pipeline.js";
import { canAppearOnPublicShop } from "./sellingWeek.js";
import {
  effectivePublicVisibility,
  mapPublicFarm,
  mapPublicMedia,
  marketplaceStorefrontsEnabled,
} from "./farmProfiles.js";

export const MATCHED_STATUSES_SQL = "('committed', 'delivered')";

const PRICE_BAND_FLOOR_RWF = 500;

/**
 * Round ask into a widened band so exact farm ask is not inferable.
 * @param {number | null | undefined} ask
 * @returns {{ min: number, max: number } | null}
 */
export function priceBand(ask) {
  const n = Number(ask);
  if (!Number.isFinite(n) || n < PRICE_BAND_FLOOR_RWF) return null;
  const round100 = (x) => Math.round(x / 100) * 100;
  const spread = Math.max(100, Math.round(n * 0.05));
  const min = Math.max(PRICE_BAND_FLOOR_RWF, round100(n - spread));
  const max = Math.max(min + 100, round100(n + spread));
  return { min, max };
}

/**
 * @param {number | null | undefined} avg
 * @param {number | null | undefined} expected
 * @returns {{ min: number, max: number } | null}
 */
export function weightBandKg(avg, expected) {
  const a = Number(avg);
  const e = Number(expected);
  if (Number.isFinite(a) && a > 0 && Number.isFinite(e) && e > 0) {
    const lo = Math.min(a, e);
    const hi = Math.max(a, e);
    return { min: Math.round(lo * 10) / 10, max: Math.round(hi * 10) / 10 };
  }
  if (Number.isFinite(a) && a > 0) {
    const v = Math.round(a * 10) / 10;
    return { min: v, max: v };
  }
  if (Number.isFinite(e) && e > 0) {
    const v = Math.round(e * 10) / 10;
    return { min: v, max: v };
  }
  return null;
}

function readyLabel(from, to) {
  const f = from ? String(from).slice(0, 10) : null;
  const t = to ? String(to).slice(0, 10) : null;
  if (f && t && f !== t) return `${f} – ${t}`;
  return f || t || null;
}

/**
 * Allowlist public lot card. Never includes id, company, flock, phone, farm name, exact ask.
 * @param {Record<string, unknown>} row
 * @param {{
 *   birdsAvailable?: number,
 *   storefrontsEnabled?: boolean,
 *   audience?: "guest"|"verified_buyer",
 *   profile?: object|null,
 *   media?: object[],
 *   profileMedia?: object[],
 *   butcherPricePerKg?: number|null,
 *   offer?: object|null,
 *   hideFarm?: boolean,
 * }} [extra]
 */
/** Day only — the guest card says when Cleva weighed, never the timestamp or who. */
export function checkedOnDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Digits only with country code, e.g. "250788123456"; null when unusable. */
export function normalizeWhatsapp(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `250${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function mapPublicLot(row, extra = {}) {
  const birdsAvailable =
    extra.birdsAvailable != null
      ? Number(extra.birdsAvailable)
      : remainingBirds(row.birdCount ?? row.bird_count, row.matchedBirds ?? row.matched_birds ?? 0);
  const visibility = effectivePublicVisibility(
    {
      visibilityTier: row.visibilityTier ?? row.visibility_tier ?? "brokered_public",
      profile: extra.profile || null,
    },
    {
      storefrontsEnabled: extra.storefrontsEnabled === true || marketplaceStorefrontsEnabled("1"),
      audience: extra.audience || "guest",
    }
  );
  // When caller omitted storefrontsEnabled, keep legacy anonymous card unless they passed a profile.
  const resolvedVisibility =
    extra.storefrontsEnabled == null && !extra.profile ? "brokered_public" : visibility;

  const media = (extra.media || []).map(mapPublicMedia).filter(Boolean);
  const card = {
    publicRef: String(row.publicRef ?? row.public_ref ?? ""),
    district: row.district != null ? String(row.district) : null,
    birdsAvailable: Math.max(0, birdsAvailable),
    breedLabel: row.breedCode ?? row.breed_code ?? null,
    productType: String(row.productType ?? row.product_type ?? "broiler_birds"),
    title: row.publicTitle ?? row.public_title ?? null,
    story: row.publicStory ?? row.public_story ?? null,
    weightBandKg: weightBandKg(row.avgWeightKg ?? row.avg_weight_kg, row.expectedWeightKg ?? row.expected_weight_kg),
    readyFrom: (row.readyFrom ?? row.ready_from) ? String(row.readyFrom ?? row.ready_from).slice(0, 10) : null,
    readyTo: (row.readyTo ?? row.ready_to) ? String(row.readyTo ?? row.ready_to).slice(0, 10) : null,
    checkedOn: checkedOnDate(row.scoutConfirmedAt ?? row.scout_confirmed_at),
    priceBandRwf: extra.offer?.butcher?.butcherRwfPerKg
      ? { min: extra.offer.butcher.butcherRwfPerKg, max: extra.offer.butcher.butcherRwfPerKg }
      : extra.hideFarm
        ? null
        : priceBand(extra.butcherPricePerKg ?? row.askPricePerKg ?? row.ask_price_per_kg),
    buyerRwfPerKg: extra.offer?.butcher?.butcherRwfPerKg ?? extra.butcherPricePerKg ?? null,
    youPayRwf: extra.offer?.butcher?.youPayRwf ?? null,
    moneySplit: extra.moneySplit || null,
    merchantTier: extra.offer?.merchantTier || null,
    quantityTier: extra.offer?.quantityTier || null,
    rankEligible: extra.offer ? Boolean(extra.offer.rankEligible) : true,
    slaughterAvailable: Boolean(row.farmerCanSlaughter ?? row.farmer_can_slaughter),
    deliveryAvailable: Boolean(row.deliveryAvailable ?? row.delivery_available),
    minOrderBirds:
      row.minOrderBirds != null || row.min_order_birds != null
        ? Math.round(Number(row.minOrderBirds ?? row.min_order_birds))
        : null,
    readyLabel: readyLabel(row.readyFrom ?? row.ready_from, row.readyTo ?? row.ready_to),
    media,
    coverUrl: media.find((m) => m.purpose === "cover")?.url || media[0]?.url || extra.coverUrl || null,
    visibility: extra.hideFarm ? "brokered_public" : resolvedVisibility,
    farm: null,
  };

  if (!extra.hideFarm && resolvedVisibility === "profile_public" && extra.profile) {
    card.farm = mapPublicFarm(extra.profile, { media: extra.profileMedia || [] });
    if (card.farm?.coverUrl && !card.coverUrl) card.coverUrl = card.farm.coverUrl;
  }

  if (
    !extra.hideFarm &&
    extra.audience === "verified_buyer" &&
    extra.profile &&
    (resolvedVisibility === "profile_public" || resolvedVisibility === "verified_buyers")
  ) {
    card.farm = mapPublicFarm(extra.profile, { media: extra.profileMedia || [], force: true });
  }

  return card;
}

export const PUBLIC_LOT_SENSITIVE_KEYS = [
  "id",
  "companyId",
  "flockId",
  "farmLabel",
  "contactPhone",
  "scoutedBy",
  "listedBy",
  "notes",
  "scoutConfirmedAt",
  "source",
  "status",
  "verificationStatus",
  "createdAt",
  "askPricePerKg",
  "matchedBirds",
];

/** Predicate used by public list filters (unit-testable). */
export function isPublicMarketLotEligible(input = {}) {
  return canAppearOnPublicShop(
    {
      ...input,
      remainingBirds: input.remainingBirds ?? input.remaining,
    },
    input.now
  );
}

/**
 * Map week query param to forward bucket key.
 * @param {string | null | undefined} week
 */
export function weekParamToBucketKey(week) {
  const w = String(week || "").trim().toLowerCase();
  if (w === "this" || w === "this_week") return "this_week";
  if (w === "next" || w === "next_week") return "next_week";
  if (w === "later" || w === "week_after") return "week_after";
  return null;
}

export function publicWeekBuckets(now = new Date()) {
  return forwardWeekBuckets(now);
}

export const SETTLE_TERMS = ["cash_scale", "same_week", "days_7", "days_14"];
export const HANDOVER_MODES = ["collect", "delivery"];
export const PROCESS_MODES = ["live", "slaughter"];

/**
 * Optional shop terms on a guest request. Invalid values become null — never invent a price.
 * @param {Record<string, unknown>} input
 * @param {Date} [now]
 */
export function parseBuyerRequestExtras(input = {}, now = new Date()) {
  const typicalRaw = input.typicalBirdsPerWeek ?? input.typical_birds_per_week;
  const typical = typicalRaw != null && typicalRaw !== "" ? Number(typicalRaw) : null;
  const typicalBirdsPerWeek = typical > 0 ? Math.round(typical) : null;

  const settle = String(input.settleTerms ?? input.settle_terms ?? "").trim();
  const settleTerms = SETTLE_TERMS.includes(settle) ? settle : null;

  const expectRaw = input.expectedRwfPerKg ?? input.expected_rwf_per_kg;
  const expectStr = expectRaw == null ? "" : String(expectRaw).trim().toLowerCase();
  const expectNum = Number(expectRaw);
  const expectedRwfPerKg =
    expectStr && expectStr !== "board" && expectNum > 0 ? Math.round(expectNum) : null;

  const handoverRaw = String(input.handover ?? "").trim();
  const handover = HANDOVER_MODES.includes(handoverRaw) ? handoverRaw : null;

  const processRaw = String(input.process ?? "").trim();
  const process = PROCESS_MODES.includes(processRaw) ? processRaw : null;

  const when = String(input.neededWhen ?? input.needed_when ?? "").trim().toLowerCase();
  const buckets = forwardWeekBuckets(now);
  let neededFrom = null;
  if (when === "this" || when === "this_week") {
    neededFrom = buckets[0].from;
  } else if (when === "next" || when === "next_week") {
    neededFrom = buckets[1].from;
  } else {
    const raw = input.neededFrom ?? input.needed_from ?? null;
    if (raw && /^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
      neededFrom = String(raw).slice(0, 10);
    }
  }

  return {
    typicalBirdsPerWeek,
    settleTerms,
    expectedRwfPerKg,
    handover,
    process,
    neededFrom,
  };
}

/**
 * @param {{ contactName?: string, phone?: string, birds?: number|null, honeypot?: string, formStartedAt?: number }} input
 */
export function validatePublicRequest(input) {
  const honeypot = String(input.honeypot ?? "").trim();
  if (honeypot) return { ok: false, error: "Rejected." };
  const contactName = String(input.contactName ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  if (!contactName || contactName.length < 2) return { ok: false, error: "Name is required." };
  if (!phone || phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Valid phone is required." };
  const birds = input.birds != null ? Number(input.birds) : null;
  if (birds != null && (!Number.isFinite(birds) || birds <= 0)) {
    return { ok: false, error: "Birds must be greater than 0." };
  }
  const started = Number(input.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = Date.now() - started;
    if (elapsed >= 0 && elapsed < 1200) return { ok: false, error: "Please wait a moment and try again." };
  }
  const extras = parseBuyerRequestExtras(input);
  return { ok: true, contactName, phone, birds, ...extras };
}

export function validatePublicSellRequest(input) {
  const v = validatePublicRequest(input);
  if (!v.ok) return v;
  if (!(Number(v.birds) > 0)) return { ok: false, error: "How many birds is required." };
  const avgWeightKg = input.avgWeightKg != null ? Number(input.avgWeightKg) : null;
  if (avgWeightKg != null && (!(avgWeightKg > 0) || avgWeightKg > 8)) {
    return { ok: false, error: "Average kg must be greater than 0." };
  }
  return { ...v, avgWeightKg: avgWeightKg && avgWeightKg > 0 ? avgWeightKg : null };
}

export function isSellLead(lead) {
  return (
    String(lead?.source || "") === "public_sell" ||
    String(lead?.buyerType || lead?.buyer_type || "") === "farmer"
  );
}

export function leadReferenceFromId(id) {
  const s = String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return s ? `REQ-${s}` : "REQ-PENDING";
}
