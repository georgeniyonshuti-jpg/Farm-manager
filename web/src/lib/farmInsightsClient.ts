import type { FarmInsight } from "../components/farm/InsightsFeed";

/** Client-side insights from ops-board flocks when /api/farm/insights is thin. */
export function buildFarmInsightsClient(
  flocks: Array<{
    flockId?: string;
    id?: string;
    label?: string;
    overdueRounds?: number;
    mortality24hDeltaPct?: number;
    daysSinceWeighIn?: number | null;
    latestWeighDate?: string | null;
    timeStatus?: { overdueHours?: number };
  }>
): FarmInsight[] {
  const items: FarmInsight[] = [];
  const now = Date.now();
  for (const f of flocks) {
    const id = String(f.flockId || f.id || "");
    const label = f.label || id;
    const overdue = Number(f.overdueRounds || 0);
    if (overdue > 0) {
      const hours = Number(f.timeStatus?.overdueHours || overdue * 4);
      items.push({
        id: `overdue-${id}`,
        severity: hours >= 24 ? "critical" : "warn",
        category: "checkin",
        flockId: id,
        flockLabel: label,
        message: `${label} check-in overdue (~${Math.round(hours)}h).`,
        actionHint: "Complete round check-in — welfare risk if delayed.",
      });
    }
    const mortDelta = Number(f.mortality24hDeltaPct || 0);
    if (mortDelta > 0.5) {
      items.push({
        id: `mort-${id}`,
        severity: mortDelta > 1 ? "critical" : "warn",
        category: "health",
        flockId: id,
        flockLabel: label,
        message: `Mortality in ${label} is elevated (+${mortDelta.toFixed(1)} pts).`,
      });
    }
    const weighMs = f.latestWeighDate ? new Date(f.latestWeighDate).getTime() : NaN;
    const daysSinceWeigh =
      f.daysSinceWeighIn != null
        ? Number(f.daysSinceWeighIn)
        : Number.isFinite(weighMs)
          ? (now - weighMs) / 86400000
          : null;
    if (daysSinceWeigh == null || daysSinceWeigh > 10) {
      items.push({
        id: `weigh-${id}`,
        severity: daysSinceWeigh == null || daysSinceWeigh > 14 ? "critical" : "warn",
        category: "weigh_in",
        flockId: id,
        flockLabel: label,
        message: `${label} is overdue for weighing — FCR may become unreliable.`,
      });
    }
  }
  const rank = { critical: 3, warn: 2, info: 1 } as const;
  return items.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0)).slice(0, 12);
}
