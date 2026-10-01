/**
 * Rule-based operational insights (no ML).
 * Consumes ops-board style flock rows + optional stock summary.
 */

export function buildFarmInsights({ flocks = [], stock = [] } = {}) {
  const items = [];
  const now = Date.now();

  for (const row of stock) {
    const balance = Number(row.balanceKg ?? row.balance_kg ?? 0);
    const daily = Number(row.avgDailyUseKg ?? row.avg_daily_use_kg ?? 0);
    const feedType = row.feedType || row.feed_type || "Feed";
    if (balance > 0 && daily > 0) {
      const days = balance / daily;
      if (days <= 5) {
        items.push({
          id: `feed-runout-${feedType}`,
          severity: days <= 2.5 ? "critical" : "warn",
          category: "inventory",
          message: `${feedType} runs out in ~${days.toFixed(1)} days at current use.`,
          actionHint: days <= 3 ? `Order more ${feedType} by Friday.` : undefined,
        });
      }
    }
  }

  for (const f of flocks) {
    const label = f.label || f.flockLabel || f.id;
    const overdue = Number(f.overdueRounds || 0);
    if (overdue > 0) {
      const hours = Number(f.timeStatus?.overdueHours || f.overdueHours || overdue * 4);
      items.push({
        id: `overdue-${f.flockId || f.id}`,
        severity: hours >= 24 ? "critical" : "warn",
        category: "checkin",
        flockId: String(f.flockId || f.id),
        flockLabel: label,
        message: `${label} check-in overdue${hours ? ` (~${Math.round(hours)}h)` : ""}.`,
        actionHint: "Complete round check-in — welfare risk if delayed.",
      });
    }

    const mortDelta = Number(f.mortality24hDeltaPct || 0);
    if (mortDelta > 0.5) {
      items.push({
        id: `mort-${f.flockId || f.id}`,
        severity: mortDelta > 1 ? "critical" : "warn",
        category: "health",
        flockId: String(f.flockId || f.id),
        flockLabel: label,
        message: `Mortality in ${label} is elevated vs recent baseline (+${mortDelta.toFixed(1)} pts).`,
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
        id: `weigh-${f.flockId || f.id}`,
        severity: daysSinceWeigh == null || daysSinceWeigh > 14 ? "critical" : "warn",
        category: "weigh_in",
        flockId: String(f.flockId || f.id),
        flockLabel: label,
        message: `${label} is overdue for weighing — FCR may become unreliable.`,
      });
    }

    const tempOut =
      f.tempOutsideHours != null
        ? Number(f.tempOutsideHours)
        : f.coopTempStatus === "out_of_range"
          ? 6
          : 0;
    if (tempOut >= 4) {
      items.push({
        id: `temp-${f.flockId || f.id}`,
        severity: "warn",
        category: "environment",
        flockId: String(f.flockId || f.id),
        flockLabel: label,
        message: `Average coop temperature for ${label} outside target for ~${Math.round(tempOut)}h.`,
      });
    }
  }

  const rank = { critical: 3, warn: 2, info: 1 };
  return items
    .sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0))
    .slice(0, 20);
}
