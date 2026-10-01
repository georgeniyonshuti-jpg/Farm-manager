/**
 * Forward book — chicks-in to selling week, visit window, listing phase.
 * Farmer/scout copy says selling week. DB still uses ready_from / ready_to.
 */

import {
  forwardWeekBuckets,
  readyWindowFromPlacement,
  readyWindowHitsThisOrNextWeek,
  remainingBirds,
} from "./pipeline.js";

export const DEFAULT_GROWOUT_MIN = 35;
export const DEFAULT_GROWOUT_MAX = 42;
export const VISIT_LEAD_DAYS = 7;
export const DEFAULT_VISIT_FEE_RWF = 5000;

export const CHICKS_IN_RELATIVE = {
  today: 0,
  about_week: 7,
  about_2_weeks: 14,
  about_month: 30,
};

export function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function addUtcDays(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return isoDate(d);
}

export function placementFromRelative(kind, now = new Date(), exactDate = null) {
  if (kind === "date" || exactDate) {
    const s = String(exactDate || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  const days = CHICKS_IN_RELATIVE[kind];
  if (days == null) return null;
  return addUtcDays(isoDate(now), -days);
}

export function sellingWeekFromPlacement(placementDate, dayMin = DEFAULT_GROWOUT_MIN, dayMax = DEFAULT_GROWOUT_MAX) {
  return readyWindowFromPlacement(placementDate, dayMin, dayMax);
}

export function resolveSellingWeek({
  placementDate,
  chicksInRelative,
  readyFrom,
  readyTo,
  dayMin = DEFAULT_GROWOUT_MIN,
  dayMax = DEFAULT_GROWOUT_MAX,
  now = new Date(),
} = {}) {
  const overrideFrom = readyFrom ? String(readyFrom).slice(0, 10) : "";
  const overrideTo = readyTo ? String(readyTo).slice(0, 10) : "";
  const placement =
    placementFromRelative(chicksInRelative, now, placementDate) ||
    (placementDate ? String(placementDate).slice(0, 10) : null);
  const suggested = sellingWeekFromPlacement(placement, dayMin, dayMax);
  if (overrideFrom && overrideTo && overrideTo >= overrideFrom) {
    return {
      placementDate: placement,
      readyFrom: overrideFrom,
      readyTo: overrideTo,
      suggested,
      overridden: Boolean(suggested && (suggested.readyFrom !== overrideFrom || suggested.readyTo !== overrideTo)),
    };
  }
  if (!suggested) return { placementDate: placement, readyFrom: null, readyTo: null, suggested: null, overridden: false };
  return {
    placementDate: placement,
    readyFrom: suggested.readyFrom,
    readyTo: suggested.readyTo,
    suggested,
    overridden: false,
  };
}

export function visitDueOn(readyFrom) {
  return addUtcDays(readyFrom, -VISIT_LEAD_DAYS);
}

export function isVisitDue(readyFrom, now = new Date()) {
  const due = visitDueOn(readyFrom);
  if (!due) return false;
  return isoDate(now) >= due;
}

export function publicReadyBounds(now = new Date()) {
  const buckets = forwardWeekBuckets(now);
  return { from: buckets[0].from, to: buckets[1].to };
}

export function isScoutConfirmed(lot) {
  return Boolean(lot?.scoutConfirmedAt || lot?.scout_confirmed_at);
}

export function canAppearOnPublicShop(lot, now = new Date()) {
  if (!["open", "partial"].includes(String(lot?.status || ""))) return false;
  if (String(lot?.verificationStatus || lot?.verification_status || "verified") !== "verified") return false;
  const remaining =
    lot?.remainingBirds != null
      ? Number(lot.remainingBirds)
      : remainingBirds(lot?.birdCount ?? lot?.bird_count, lot?.matchedBirds ?? lot?.matched_birds ?? 0);
  if (!(remaining > 0)) return false;
  if (!isScoutConfirmed(lot)) return false;
  return readyWindowHitsThisOrNextWeek(lot.readyFrom ?? lot.ready_from, lot.readyTo ?? lot.ready_to, now);
}

export function listingPhase(lot, now = new Date()) {
  if (canAppearOnPublicShop(lot, now)) return "live";
  if (isScoutConfirmed(lot)) return "weighed";
  if (isVisitDue(lot?.readyFrom ?? lot?.ready_from, now)) return "visit_due";
  return "on_the_book";
}

export function applyWeighOutcome({ outcome, readyFrom, readyTo, birds, avgKg }) {
  const nextBirds = Math.max(1, Math.round(Number(birds) || 0));
  const nextKg = Number(avgKg);
  if (outcome === "ready") {
    if (!(nextBirds > 0) || !(nextKg > 0)) {
      return { ok: false, error: "Count and average kg are required." };
    }
    return {
      ok: true,
      confirm: true,
      accrueFee: true,
      birdCount: nextBirds,
      avgWeightKg: nextKg,
      readyFrom,
      readyTo,
    };
  }
  if (outcome === "slip_week") {
    return {
      ok: true,
      confirm: false,
      accrueFee: true,
      birdCount: nextBirds > 0 ? nextBirds : null,
      avgWeightKg: nextKg > 0 ? nextKg : null,
      readyFrom: addUtcDays(readyFrom, 7),
      readyTo: addUtcDays(readyTo, 7),
    };
  }
  if (outcome === "problem") {
    return {
      ok: true,
      confirm: false,
      accrueFee: false,
      birdCount: nextBirds > 0 ? nextBirds : null,
      avgWeightKg: nextKg > 0 ? nextKg : null,
      readyFrom,
      readyTo,
    };
  }
  return { ok: false, error: "outcome must be ready, slip_week, or problem." };
}

export function clevaRunRecentLogsCountAsConfirm({ merchantTier, hasRecentWeighIn, hasRecentLiveCount }) {
  return merchantTier === "cleva_run" && hasRecentWeighIn === true && hasRecentLiveCount === true;
}

export function publicEligibleWhereSql(now = new Date()) {
  const buckets = forwardWeekBuckets(now);
  const from = buckets[0].from;
  const to = buckets[1].to;
  return `
  l.status IN ('open', 'partial')
  AND COALESCE(l.verification_status, 'verified') = 'verified'
  AND GREATEST(0, COALESCE(l.saleable_birds, l.bird_count, 0) - COALESCE(mb.matched, 0)) > 0
  AND l.scout_confirmed_at IS NOT NULL
  AND l.ready_from::date <= '${to}'::date
  AND l.ready_to::date >= '${from}'::date
`;
}

export function sellingWeekLabel(readyFrom, readyTo) {
  if (!readyFrom || !readyTo) return "";
  const fmt = (s) =>
    new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  return `Selling week ${fmt(readyFrom)}–${fmt(readyTo)}`;
}

export function decorateListing(lot, now = new Date()) {
  if (!lot) return lot;
  const readyFrom = lot.readyFrom ?? lot.ready_from ?? null;
  const readyTo = lot.readyTo ?? lot.ready_to ?? null;
  return {
    ...lot,
    listingPhase: listingPhase(lot, now),
    visitDueOn: visitDueOn(readyFrom),
    sellingWeekLabel: sellingWeekLabel(readyFrom, readyTo),
  };
}

export function rankEligibleUntilConfirm({ confirmed, railEligible }) {
  return Boolean(confirmed) && railEligible !== false;
}

export async function loadClevaRunRecentConfirm(dbQuery, { source, flockId, companyVerified } = {}) {
  if (source !== "managed_flock" || !flockId || companyVerified !== "verified") {
    return { confirm: false, hasRecentWeighIn: false, hasRecentLiveCount: false };
  }
  let hasRecentWeighIn = false;
  let hasRecentLiveCount = false;
  try {
    const w = await dbQuery(
      `SELECT 1 FROM weigh_ins
        WHERE flock_id::text = $1
          AND weigh_date >= (CURRENT_DATE - 7)
        LIMIT 1`,
      [String(flockId)]
    );
    hasRecentWeighIn = Boolean(w.rows[0]);
  } catch {
    hasRecentWeighIn = false;
  }
  try {
    const live = await dbQuery(
      `SELECT 1 FROM poultry_flocks
        WHERE id = $1::uuid
          AND verified_live_count IS NOT NULL
          AND verified_live_at >= now() - interval '7 days'
        LIMIT 1`,
      [flockId]
    );
    hasRecentLiveCount = Boolean(live.rows[0]);
  } catch {
    hasRecentLiveCount = false;
  }
  if (!hasRecentLiveCount) {
    try {
      const log = await dbQuery(
        `SELECT 1 FROM poultry_daily_logs
          WHERE flock_id = $1::uuid
            AND log_date >= (CURRENT_DATE - 7)
          LIMIT 1`,
        [flockId]
      );
      hasRecentLiveCount = Boolean(log.rows[0]);
    } catch {
      hasRecentLiveCount = false;
    }
  }
  return {
    confirm: clevaRunRecentLogsCountAsConfirm({
      merchantTier: "cleva_run",
      hasRecentWeighIn,
      hasRecentLiveCount,
    }),
    hasRecentWeighIn,
    hasRecentLiveCount,
  };
}
