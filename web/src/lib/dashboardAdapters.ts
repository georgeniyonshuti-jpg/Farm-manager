export type RiskClass = "healthy" | "watch" | "at_risk" | "critical";

export type OpsBoardTrendArrow = "up" | "down" | "flat";

export type OpsBoardFlock = {
  flockId: string;
  label: string;
  barn: string;
  ageDays: number;
  latestFcr: number | null;
  latestWeightKg: number | null;
  latestWeighDate?: string | null;
  expectedWeightKg?: number;
  weightDeviationPct?: number;
  fcrDeviation?: number | null;
  birdsLiveEstimate?: number;
  biomassKg?: number | null;
  estimatedFairValueRwf?: number | null;
  lastValuationSnapshotRwf?: number | null;
  lastValuationDate?: string | null;
  overdueRounds: number;
  withdrawalBlockers: number;
  mortality7d: number;
  mortality24hDeltaPct: number;
  mortalityRatePct: number;
  expectedFcrRange: { min: number; max: number };
  dataFreshnessScore?: number;
  trends?: {
    mortality?: OpsBoardTrendArrow;
    weight?: OpsBoardTrendArrow;
    fcr?: OpsBoardTrendArrow;
  };
  projections?: {
    projectedHarvestWeightKg?: number | null;
    projectedHarvestDeltaPct?: number | null;
    projectedMortalityPct?: number;
  };
  alerts?: string[];
  riskScore: number;
  riskClass: RiskClass;
  topIssue: string;
};

export type OpsBoardResponse = {
  flocks: OpsBoardFlock[];
  barns: Array<{
    barn: string;
    flockCount: number;
    blockedFlocks: number;
    overdueRounds: number;
    mortality7d: number;
    avgFcr: number | null;
  }>;
  insights: string[];
  farmHealthScore: number;
  mostImprovedFlockId: string | null;
  worstDecliningFlockId: string | null;
  farmTotals?: {
    totalBiomassKg: number;
    estimatedFairValueRwf: number | null;
    referenceMarketPriceRwfPerKg: number | null;
    approvedValuationTotalRwf: number | null;
  };
};

export type WeighInTrendPoint = {
  flockId: string;
  label: string;
  weighDate: string;
  avgWeightKg: number;
  expectedWeightKg: number | null;
  source: string | null;
  vetLogId: string | null;
  ageDays: number | null;
  fcrAtSample: number | null;
};

const STALE_WEIGH_IN_DAYS = 14;

export function riskClassCount(flocks: OpsBoardFlock[]): Array<{ name: string; value: number }> {
  const counts: Record<RiskClass, number> = {
    healthy: 0,
    watch: 0,
    at_risk: 0,
    critical: 0,
  };
  for (const f of flocks) counts[f.riskClass] += 1;
  return [
    { name: "Healthy", value: counts.healthy },
    { name: "Watch", value: counts.watch },
    { name: "At risk", value: counts.at_risk },
    { name: "Critical", value: counts.critical },
  ];
}

export function topRiskSeries(flocks: OpsBoardFlock[], limit = 8): Array<{ name: string; riskScore: number }> {
  return [...flocks]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit)
    .map((f) => ({ name: f.label, riskScore: Math.round(f.riskScore) }));
}

export function blockersSeries(
  flocks: OpsBoardFlock[],
  limit = 8,
): Array<{ name: string; overdueRounds: number; withdrawalBlockers: number }> {
  return [...flocks]
    .sort((a, b) => (b.overdueRounds + b.withdrawalBlockers) - (a.overdueRounds + a.withdrawalBlockers))
    .slice(0, limit)
    .map((f) => ({
      name: f.label,
      overdueRounds: f.overdueRounds,
      withdrawalBlockers: f.withdrawalBlockers,
    }));
}

export function fcrVsTargetSeries(
  flocks: OpsBoardFlock[],
  limit = 10,
): Array<{ name: string; latestFcr: number; targetMax: number }> {
  return [...flocks]
    .filter((f) => f.latestFcr != null)
    .sort((a, b) => Number(b.latestFcr) - Number(a.latestFcr))
    .slice(0, limit)
    .map((f) => ({
      name: f.label,
      latestFcr: Number(f.latestFcr),
      targetMax: Number(f.expectedFcrRange.max.toFixed(2)),
    }));
}

export function weightVsTargetSeries(
  flocks: OpsBoardFlock[],
  limit = 8,
): Array<{ name: string; latestWeightKg: number; expectedWeightKg: number; weightDeviationPct: number }> {
  return [...flocks]
    .filter((f) => f.latestWeightKg != null && f.expectedWeightKg != null)
    .sort((a, b) => Number(a.weightDeviationPct ?? 0) - Number(b.weightDeviationPct ?? 0))
    .slice(0, limit)
    .map((f) => ({
      name: f.label,
      latestWeightKg: Number(f.latestWeightKg),
      expectedWeightKg: Number(f.expectedWeightKg),
      weightDeviationPct: Number(f.weightDeviationPct ?? 0),
    }));
}

export function weightDeviationBars(
  flocks: OpsBoardFlock[],
  limit = 8,
): Array<{ name: string; weightDeviationPct: number }> {
  return [...flocks]
    .filter((f) => f.weightDeviationPct != null)
    .sort((a, b) => Number(a.weightDeviationPct) - Number(b.weightDeviationPct))
    .slice(0, limit)
    .map((f) => ({
      name: f.label,
      weightDeviationPct: Number(f.weightDeviationPct),
    }));
}

export function biomassSummary(flocks: OpsBoardFlock[]): {
  totalBiomassKg: number;
  estimatedFairValueRwf: number | null;
  flocksWithWeight: number;
  belowTargetCount: number;
  staleWeighInCount: number;
  avgWeightDeviationPct: number | null;
  avgFcr: number | null;
} {
  const withWeight = flocks.filter((f) => f.latestWeightKg != null);
  const now = Date.now();
  const staleCutoff = now - STALE_WEIGH_IN_DAYS * 86400000;
  let totalBiomass = 0;
  let fairValueSum = 0;
  let fairValueCount = 0;
  let belowTarget = 0;
  let stale = 0;
  let devSum = 0;
  let devCount = 0;
  let fcrSum = 0;
  let fcrCount = 0;

  for (const f of flocks) {
    if (f.biomassKg != null && Number.isFinite(f.biomassKg)) {
      totalBiomass += Number(f.biomassKg);
    }
    if (f.estimatedFairValueRwf != null && Number.isFinite(f.estimatedFairValueRwf)) {
      fairValueSum += Number(f.estimatedFairValueRwf);
      fairValueCount += 1;
    }
    if ((f.weightDeviationPct ?? 0) < -5) belowTarget += 1;
    if (f.weightDeviationPct != null) {
      devSum += Number(f.weightDeviationPct);
      devCount += 1;
    }
    if (f.latestFcr != null) {
      fcrSum += Number(f.latestFcr);
      fcrCount += 1;
    }
    const weighMs = f.latestWeighDate ? new Date(f.latestWeighDate).getTime() : NaN;
    if (!f.latestWeighDate || !Number.isFinite(weighMs) || weighMs < staleCutoff) {
      stale += 1;
    }
  }

  return {
    totalBiomassKg: Number(totalBiomass.toFixed(1)),
    estimatedFairValueRwf: fairValueCount > 0 ? Math.round(fairValueSum) : null,
    flocksWithWeight: withWeight.length,
    belowTargetCount: belowTarget,
    staleWeighInCount: stale,
    avgWeightDeviationPct: devCount > 0 ? Number((devSum / devCount).toFixed(1)) : null,
    avgFcr: fcrCount > 0 ? Number((fcrSum / fcrCount).toFixed(2)) : null,
  };
}

export function topBiomassFlocks(
  flocks: OpsBoardFlock[],
  limit = 5,
): Array<{
  flockId: string;
  label: string;
  biomassKg: number;
  weightDeviationPct: number | null;
  latestFcr: number | null;
  expectedFcrRange: { min: number; max: number };
}> {
  return [...flocks]
    .filter((f) => f.biomassKg != null && Number(f.biomassKg) > 0)
    .sort((a, b) => Number(b.biomassKg) - Number(a.biomassKg))
    .slice(0, limit)
    .map((f) => ({
      flockId: f.flockId,
      label: f.label,
      biomassKg: Number(f.biomassKg),
      weightDeviationPct: f.weightDeviationPct ?? null,
      latestFcr: f.latestFcr,
      expectedFcrRange: f.expectedFcrRange,
    }));
}

/** Farm-average weight by date for trend chart. */
export function farmAverageWeightTrend(
  points: WeighInTrendPoint[],
): Array<{ date: string; avgWeightKg: number; expectedWeightKg: number | null; count: number }> {
  const byDate = new Map<string, { sum: number; expectedSum: number; expectedN: number; count: number }>();
  for (const p of points) {
    const d = String(p.weighDate).slice(0, 10);
    const prev = byDate.get(d) ?? { sum: 0, expectedSum: 0, expectedN: 0, count: 0 };
    prev.sum += Number(p.avgWeightKg);
    prev.count += 1;
    if (p.expectedWeightKg != null) {
      prev.expectedSum += Number(p.expectedWeightKg);
      prev.expectedN += 1;
    }
    byDate.set(d, prev);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      avgWeightKg: Number((v.sum / v.count).toFixed(3)),
      expectedWeightKg: v.expectedN > 0 ? Number((v.expectedSum / v.expectedN).toFixed(3)) : null,
      count: v.count,
    }));
}

export function mortalityTrendPseudoDaily(flocks: OpsBoardFlock[]): Array<{ day: string; mortalityPct: number }> {
  const avgDelta = flocks.length
    ? flocks.reduce((s, f) => s + Number(f.mortality24hDeltaPct || 0), 0) / flocks.length
    : 0;
  const avgRate = flocks.length
    ? flocks.reduce((s, f) => s + Number(f.mortalityRatePct || 0), 0) / flocks.length
    : 0;
  const points: Array<{ day: string; mortalityPct: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const multiplier = (6 - i) / 6;
    points.push({
      day: `D-${i}`,
      mortalityPct: Number(Math.max(0, avgRate - avgDelta * (1 - multiplier)).toFixed(2)),
    });
  }
  return points;
}
