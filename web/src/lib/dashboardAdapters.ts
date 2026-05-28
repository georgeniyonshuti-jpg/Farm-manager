export type RiskClass = "healthy" | "watch" | "at_risk" | "critical";

export type OpsBoardFlock = {
  flockId: string;
  label: string;
  barn: string;
  ageDays: number;
  latestFcr: number | null;
  latestWeightKg: number | null;
  overdueRounds: number;
  withdrawalBlockers: number;
  mortality7d: number;
  mortality24hDeltaPct: number;
  mortalityRatePct: number;
  expectedFcrRange: { min: number; max: number };
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
};

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
