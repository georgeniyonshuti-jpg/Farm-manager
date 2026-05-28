import { buildFlockNarrative } from "./narrativeInsights.js";

function inRange(ts, fromIso, toIso) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  const from = fromIso ? new Date(fromIso).getTime() : Number.NEGATIVE_INFINITY;
  const to = toIso ? new Date(toIso).getTime() : Number.POSITIVE_INFINITY;
  return t >= from && t <= to;
}

export function buildFlockDeepDiveReport({
  flock,
  checkins = [],
  feedEntries = [],
  mortalityEvents = [],
  vetLogs = [],
  treatments = [],
  slaughterEvents = [],
  from = null,
  to = null,
}) {
  const fid = String(flock?.id ?? "");
  const c = checkins.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
  const f = feedEntries.filter((r) => String(r.flockId) === fid && inRange(r.recordedAt, from, to));
  const m = mortalityEvents.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
  const v = vetLogs.filter((r) => String(r.flockId) === fid && inRange(r.createdAt ?? r.logDate, from, to));
  const t = treatments.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
  const s = slaughterEvents.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));

  const initialCount = Math.max(1, Number(flock?.initialCount ?? 0));
  const mortalityTotal = m.reduce((sum, r) => sum + Math.max(0, Number(r.count ?? 0)), 0);
  const feedToDateKg = f.reduce((sum, r) => sum + Math.max(0, Number(r.feedKg ?? 0)), 0);
  const liveBirds = Math.max(0, initialCount - mortalityTotal);
  const avgWeight = Number(flock?.latestWeightKg ?? 0);
  const biomassKg = liveBirds > 0 && avgWeight > 0 ? liveBirds * avgWeight : null;
  const fcr = biomassKg && biomassKg > 0 ? feedToDateKg / biomassKg : null;
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(String(flock?.placementDate ?? Date.now())).getTime()) / 86400000));

  const timeline = c.map((row, idx) => {
    const day = Math.max(0, Math.floor((new Date(row.at).getTime() - new Date(String(flock?.placementDate ?? row.at)).getTime()) / 86400000));
    const cumulativeMortality = m
      .filter((x) => new Date(x.at).getTime() <= new Date(row.at).getTime())
      .reduce((sum, x) => sum + Math.max(0, Number(x.count ?? 0)), 0);
    return {
      idx: idx + 1,
      day,
      checkinAt: row.at,
      feedKgCumulative: f
        .filter((x) => new Date(x.recordedAt).getTime() <= new Date(row.at).getTime())
        .reduce((sum, x) => sum + Math.max(0, Number(x.feedKg ?? 0)), 0),
      cumulativeMortalityPct: (cumulativeMortality / initialCount) * 100,
    };
  });

  const kpis = {
    ageDays,
    liveBirds,
    mortalityTotal,
    mortalityRatePct: (mortalityTotal / initialCount) * 100,
    feedToDateKg,
    fcr,
    checkinCount: c.length,
    vetLogCount: v.length,
    treatmentCount: t.length,
    slaughterCount: s.length,
  };

  return {
    meta: {
      reportType: "flock_deep_dive",
      generatedAt: new Date().toISOString(),
      from,
      to,
      flockId: fid,
      flockLabel: String(flock?.label ?? flock?.code ?? fid),
    },
    kpis,
    timeline,
    tables: {
      checkins: c.slice(-80),
      feedEntries: f.slice(-120),
      mortalityEvents: m.slice(-120),
      vetLogs: v.slice(-120),
      treatments: t.slice(-120),
      slaughterEvents: s.slice(-120),
    },
    insights: buildFlockNarrative({ flock, kpis, timeline }),
  };
}
