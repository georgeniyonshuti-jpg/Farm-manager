/** Scout coaching labels. New scouts are Ramping, not Behind. */

import { daysBetween, inRange, kigaliWeek } from "./time.js";

export const RAMP_DAYS = 14;
export const DEFAULT_SCOUT_TARGETS = { lots: 8, sellers: 4, birds: 400 };

export function scoutTenureDays(scout, now) {
  if (!scout.approvedAt) return null;
  return daysBetween(scout.approvedAt, now);
}

export function attainment(actual, target) {
  if (!(target > 0)) return null;
  return actual / target;
}

/**
 * @param {object} scout
 * @param {object} [opts]
 * @param {Array<{from:string,to:string,lots:number,sellers:number,birds:number}>} [opts.weeks]
 */
export function scoutStatus(scout, now = new Date(), opts = {}) {
  const tenure = scoutTenureDays(scout, now);
  if (tenure == null || tenure <= RAMP_DAYS) return "ramping";
  const last = scout.lastActivityAt || scout.approvedAt;
  const idle = last ? daysBetween(last, now) : null;
  if (idle != null && idle >= 14) return "dormant";
  const weeks = opts.weeks || scout.weeks || [];
  const afterRamp = weeks.filter((w) => {
    if (!scout.approvedAt) return false;
    return daysBetween(scout.approvedAt, `${w.from}T12:00:00+02:00`) > RAMP_DAYS;
  });
  const targets = opts.targets || DEFAULT_SCOUT_TARGETS;
  const ratios = afterRamp.map((w) => {
    const parts = [
      attainment(w.lots || 0, targets.lots),
      attainment(w.sellers || 0, targets.sellers),
      attainment(w.birds || 0, targets.birds),
    ].filter((n) => n != null);
    if (!parts.length) return 0;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  });
  const lastTwo = ratios.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((r) => r >= 1.2)) return "excellent";
  if (lastTwo.length > 0 && lastTwo.every((r) => r >= 0.8)) return "on_track";
  const noLotRecently = !scout.lastVerifiedLotAt || daysBetween(scout.lastVerifiedLotAt, now) > 10;
  if ((lastTwo.length > 0 && lastTwo.some((r) => r < 0.4)) || noLotRecently) return "needs_support";
  return "on_track";
}

export const STATUS_LABEL = {
  ramping: "Ramping",
  on_track: "On track",
  needs_support: "Needs support",
  dormant: "Dormant",
  excellent: "Excellent",
};

export function lotsInRange(events, from, to) {
  return (events || []).filter((e) => e.verified && inRange(e.at, from, to));
}

export function currentWeekKey(now = new Date()) {
  return kigaliWeek(now).from;
}
