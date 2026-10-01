/**
 * Vet visit schedule status (parallel to round check-in status).
 * Uses log_schedule rows with log_type = 'vet_visit'.
 */

/**
 * @param {string} flockId
 * @param {string | null} role
 * @param {Array<{ flockId: string, role: string, logType?: string, intervalHours: number, windowOpen: string, windowClose: string }>} logSchedules
 * @param {(a: string, b: string) => boolean} sameFlockId
 */
export function scheduleIntervalHoursForFlockRoleType(flockId, role, logSchedules, sameFlockId, logType = "vet_visit") {
  if (!role) return null;
  const entries = logSchedules.filter(
    (s) => sameFlockId(s.flockId, flockId) && s.role === role && (s.logType || "check_in") === logType
  );
  if (!entries.length) return null;
  const h = Number(entries[0].intervalHours);
  return Number.isFinite(h) && h > 0 ? h : null;
}

/**
 * @param {string} flockId
 * @param {Array<{ flockId: string, visitedAt?: string, createdAt?: string, logDate?: string, submissionStatus?: string }>} vetLogs
 * @param {(a: string, b: string) => boolean} sameFlockId
 */
export function lastVetVisitMs(flockId, vetLogs, sameFlockId) {
  let best = null;
  for (const v of vetLogs) {
    if (!sameFlockId(v.flockId, flockId)) continue;
    const raw = v.visitedAt ?? v.createdAt ?? (v.logDate ? `${v.logDate}T12:00:00Z` : null);
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t)) continue;
    if (best == null || t > best) best = t;
  }
  return best;
}

/**
 * @param {object} flock
 * @param {number} now
 * @param {string | null} role
 * @param {Array} logSchedules
 * @param {Array} vetLogs
 * @param {(a: string, b: string) => boolean} sameFlockId
 * @param {(flock: object, at?: Date) => number} flockAgeDays
 * @param {(ageDays: number, flock: object) => number} intervalHoursForAge
 * @param {(flockId: string) => number | null} lastCheckinMsFn - unused, kept for symmetry
 */
export function computeVetVisitNextDueMs(
  flock,
  now,
  role,
  logSchedules,
  vetLogs,
  sameFlockId,
  flockAgeDays,
  intervalHoursForAge
) {
  const roleInterval = scheduleIntervalHoursForFlockRoleType(flock.id, role, logSchedules, sameFlockId, "vet_visit");
  const ageDays = flockAgeDays(flock, new Date(now));
  const h = roleInterval ?? intervalHoursForAge(ageDays, flock);
  const intervalMs = h * 3600000;
  const last = lastVetVisitMs(flock.id, vetLogs, sameFlockId);
  if (last == null || !Number.isFinite(last)) {
    const p = new Date(`${flock?.placementDate ?? ""}T00:00:00`).getTime();
    if (!Number.isFinite(p)) return now + intervalMs;
    return p + intervalMs;
  }
  const out = last + intervalMs;
  return Number.isFinite(out) ? out : now + intervalMs;
}

/**
 * @param {object} flock
 * @param {string | null} role
 * @param {object} deps
 */
export function vetVisitStatusPayload(flock, role = "vet", deps) {
  const {
    logSchedules,
    vetLogs,
    sameFlockId,
    flockAgeDays,
    intervalHoursForAge,
    DEFAULT_CHECKIN_BANDS,
    safeMsToIso,
  } = deps;

  const now = Date.now();
  const ageDays = flockAgeDays(flock, new Date(now));
  const intervalHours =
    scheduleIntervalHoursForFlockRoleType(flock.id, role, logSchedules, sameFlockId, "vet_visit") ??
    intervalHoursForAge(ageDays, flock);
  const nextDueMsRaw = computeVetVisitNextDueMs(
    flock,
    now,
    role,
    logSchedules,
    vetLogs,
    sameFlockId,
    flockAgeDays,
    intervalHoursForAge
  );
  const intervalMsFallback = (Number.isFinite(intervalHours) ? intervalHours : 12) * 3600000;
  const nextDueMs = Number.isFinite(nextDueMsRaw) ? nextDueMsRaw : now + intervalMsFallback;
  const lastMs = lastVetVisitMs(flock.id, vetLogs, sameFlockId);
  const lastVisitAt =
    lastMs != null && Number.isFinite(lastMs) && Number.isFinite(new Date(lastMs).getTime())
      ? new Date(lastMs).toISOString()
      : null;
  const overdueMs = Math.max(0, now - nextDueMs);
  const isOverdue = now > nextDueMs;
  const msUntilDue = nextDueMs - now;
  let visitBadge = "ok";
  if (isOverdue) visitBadge = "overdue";
  else if (msUntilDue > 0 && msUntilDue <= 3600000) visitBadge = "upcoming";

  return {
    flockId: flock.id,
    label: flock.label,
    placementDate: flock.placementDate,
    ageDays,
    intervalHours,
    intervalSource:
      scheduleIntervalHoursForFlockRoleType(flock.id, role, logSchedules, sameFlockId, "vet_visit") != null
        ? "role_schedule"
        : flock.checkinBands?.length
          ? "batch_custom"
          : "default_age_curve",
    lastVisitAt,
    nextDueAt: safeMsToIso(nextDueMs),
    overdueMs,
    isOverdue,
    visitBadge,
    photosRequiredPerRound: flock.photosRequiredPerRound ?? 1,
    bands: (flock.checkinBands?.length ? flock.checkinBands : DEFAULT_CHECKIN_BANDS).map((b) => ({
      untilDay: b.untilDay,
      intervalHours: b.intervalHours,
    })),
  };
}
