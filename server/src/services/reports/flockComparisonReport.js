import { buildComparisonNarrative } from "./narrativeInsights.js";

function inRange(ts, fromIso, toIso) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  const from = fromIso ? new Date(fromIso).getTime() : Number.NEGATIVE_INFINITY;
  const to = toIso ? new Date(toIso).getTime() : Number.POSITIVE_INFINITY;
  return t >= from && t <= to;
}

export function buildFlockComparisonReport({
  flocks = [],
  checkins = [],
  feedEntries = [],
  mortalityEvents = [],
  vetLogs = [],
  from = null,
  to = null,
}) {
  const rows = flocks.map((flock) => {
    const fid = String(flock.id);
    const c = checkins.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
    const f = feedEntries.filter((r) => String(r.flockId) === fid && inRange(r.recordedAt, from, to));
    const m = mortalityEvents.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
    const v = vetLogs.filter((r) => String(r.flockId) === fid && inRange(r.createdAt ?? r.logDate, from, to));
    const initialCount = Math.max(1, Number(flock.initialCount ?? 0));
    const mortalityTotal = m.reduce((sum, x) => sum + Math.max(0, Number(x.count ?? 0)), 0);
    const feedToDateKg = f.reduce((sum, x) => sum + Math.max(0, Number(x.feedKg ?? 0)), 0);
    const liveBirds = Math.max(0, initialCount - mortalityTotal);
    const avgWeight = Number(flock.latestWeightKg ?? 0);
    const biomassKg = liveBirds > 0 && avgWeight > 0 ? liveBirds * avgWeight : null;
    const fcr = biomassKg && biomassKg > 0 ? feedToDateKg / biomassKg : null;
    const lastCheckinAt = c.length ? c.reduce((latest, row) => {
      const t = new Date(row.at).getTime();
      return Number.isFinite(t) && t > latest ? t : latest;
    }, -Infinity) : -Infinity;
    const overdueCheckins = Number.isFinite(lastCheckinAt) && lastCheckinAt > 0
      ? Math.max(0, Math.floor((Date.now() - lastCheckinAt) / 3600000))
      : 999999;
    return {
      flockId: fid,
      label: String(flock.label ?? flock.code ?? fid),
      ageDays: Math.max(0, Math.floor((Date.now() - new Date(String(flock.placementDate ?? Date.now())).getTime()) / 86400000)),
      initialCount,
      liveBirds,
      mortalityTotal,
      mortalityRatePct: (mortalityTotal / initialCount) * 100,
      feedToDateKg,
      fcr,
      checkinCount: c.length,
      vetLogCount: v.length,
      overdueCheckins,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    if (a.mortalityRatePct !== b.mortalityRatePct) return a.mortalityRatePct - b.mortalityRatePct;
    return (Number(a.fcr ?? 999) - Number(b.fcr ?? 999));
  });

  return {
    meta: {
      reportType: "flock_comparison",
      generatedAt: new Date().toISOString(),
      from,
      to,
      flockCount: rows.length,
    },
    rows,
    leaderboard: {
      best: sorted[0] ?? null,
      weakest: sorted[sorted.length - 1] ?? null,
    },
    insights: buildComparisonNarrative({ rows }),
  };
}
