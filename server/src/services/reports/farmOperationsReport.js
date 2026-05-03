import { buildFarmOpsNarrative } from "./narrativeInsights.js";

function inRange(ts, fromIso, toIso) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  const from = fromIso ? new Date(fromIso).getTime() : Number.NEGATIVE_INFINITY;
  const to = toIso ? new Date(toIso).getTime() : Number.POSITIVE_INFINITY;
  return t >= from && t <= to;
}

export function buildFarmOperationsReport({
  flocks = [],
  checkins = [],
  feedEntries = [],
  mortalityEvents = [],
  vetLogs = [],
  inventoryTransactions = [],
  from = null,
  to = null,
}) {
  const active = flocks.filter((f) => String(f.status ?? "active") === "active");
  const byFlock = active.map((flock) => {
    const fid = String(flock.id);
    const c = checkins.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
    const f = feedEntries.filter((r) => String(r.flockId) === fid && inRange(r.recordedAt, from, to));
    const m = mortalityEvents.filter((r) => String(r.flockId) === fid && inRange(r.at, from, to));
    const v = vetLogs.filter((r) => String(r.flockId) === fid && inRange(r.createdAt ?? r.logDate, from, to));
    const initialCount = Math.max(1, Number(flock.initialCount ?? 0));
    const mortalityTotal = m.reduce((sum, x) => sum + Math.max(0, Number(x.count ?? 0)), 0);
    const mortalityRatePct = (mortalityTotal / initialCount) * 100;
    return {
      flockId: fid,
      label: String(flock.label ?? flock.code ?? fid),
      checkinCount: c.length,
      feedEntryCount: f.length,
      vetLogCount: v.length,
      mortalityTotal,
      mortalityRatePct,
      overdue: c.length === 0,
      riskClass: mortalityRatePct > 6 ? "critical" : mortalityRatePct > 3 ? "at_risk" : mortalityRatePct > 1.5 ? "watch" : "healthy",
    };
  });

  const riskMix = byFlock.reduce(
    (acc, r) => {
      if (r.riskClass === "critical") acc.critical += 1;
      else if (r.riskClass === "at_risk") acc.atRisk += 1;
      else if (r.riskClass === "watch") acc.watch += 1;
      else acc.healthy += 1;
      return acc;
    },
    { healthy: 0, watch: 0, atRisk: 0, critical: 0 },
  );

  const inventory = inventoryTransactions
    .filter((x) => inRange(x.at ?? x.recordedAt, from, to))
    .reduce(
      (acc, row) => {
        const t = String(row.type ?? "");
        const delta = Number(row.deltaKg ?? 0);
        if (t === "procurement_receipt") acc.procuredKg += Math.max(0, delta);
        if (t === "feed_consumption") acc.consumedKg += Math.max(0, Math.abs(delta));
        if (t === "adjustment") acc.adjustmentKg += delta;
        return acc;
      },
      { procuredKg: 0, consumedKg: 0, adjustmentKg: 0 },
    );

  const totals = {
    activeFlocks: active.length,
    overdueFlocks: byFlock.filter((r) => r.overdue).length,
    totalMortality: byFlock.reduce((s, r) => s + r.mortalityTotal, 0),
    avgMortalityRatePct: byFlock.length ? byFlock.reduce((s, r) => s + r.mortalityRatePct, 0) / byFlock.length : 0,
    checkins: byFlock.reduce((s, r) => s + r.checkinCount, 0),
    feedLogs: byFlock.reduce((s, r) => s + r.feedEntryCount, 0),
    vetLogs: byFlock.reduce((s, r) => s + r.vetLogCount, 0),
    ...inventory,
  };

  return {
    meta: {
      reportType: "farm_operations",
      generatedAt: new Date().toISOString(),
      from,
      to,
    },
    totals,
    riskMix,
    byFlock,
    insights: buildFarmOpsNarrative({ totals, riskMix }),
  };
}
