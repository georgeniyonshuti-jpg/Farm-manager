function pct(v, digits = 1) {
  if (!Number.isFinite(Number(v))) return "n/a";
  return `${Number(v).toFixed(digits)}%`;
}

function num(v, digits = 1) {
  if (!Number.isFinite(Number(v))) return "n/a";
  return Number(v).toFixed(digits);
}

export function buildFlockNarrative({ flock, kpis, timeline }) {
  const lines = [];
  const label = flock?.label ?? "Selected flock";
  lines.push(`${label} currently stands at day ${Math.max(0, Number(kpis.ageDays ?? 0))} with an estimated live population of ${Math.max(0, Math.floor(Number(kpis.liveBirds ?? 0))).toLocaleString()} birds.`);
  if (Number.isFinite(kpis.mortalityRatePct)) {
    if (kpis.mortalityRatePct > 6) lines.push(`Mortality is elevated at ${pct(kpis.mortalityRatePct, 2)} and requires immediate containment actions focused on environment, feed consistency, and health checks.`);
    else if (kpis.mortalityRatePct > 3) lines.push(`Mortality is at ${pct(kpis.mortalityRatePct, 2)} which is manageable but should be monitored with tighter daily follow-up.`);
    else lines.push(`Mortality remains controlled at ${pct(kpis.mortalityRatePct, 2)} which supports stable cycle execution.`);
  }
  if (Number.isFinite(kpis.fcr)) {
    lines.push(`Current FCR is ${num(kpis.fcr, 2)} with cumulative feed used at ${Math.max(0, Number(kpis.feedToDateKg ?? 0)).toLocaleString()} kg.`);
  }
  if (Array.isArray(timeline) && timeline.length >= 2) {
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const delta = Number(last.cumulativeMortalityPct ?? 0) - Number(first.cumulativeMortalityPct ?? 0);
    lines.push(`Across the selected period, cumulative mortality shifted by ${pct(delta, 2)} while check-in discipline and feed capture signals should be used to explain this movement.`);
  }
  lines.push("Recommended actions: prioritize overdue check-ins first, verify feed and water consistency, and close clinical observations within 24 hours for any red-flag cohort.");
  return lines;
}

export function buildComparisonNarrative({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return ["No comparable flocks are available for the selected filters."];
  const sortedByMortality = [...rows].sort((a, b) => Number(a.mortalityRatePct ?? 0) - Number(b.mortalityRatePct ?? 0));
  const sortedByFcr = [...rows].filter((r) => Number.isFinite(r.fcr)).sort((a, b) => Number(a.fcr) - Number(b.fcr));
  const bestMort = sortedByMortality[0];
  const worstMort = sortedByMortality[sortedByMortality.length - 1];
  const out = [
    `The comparison set contains ${rows.length} flocks with visible spread in mortality, feed efficiency, and operations completion patterns.`,
    `${bestMort.label} shows the strongest mortality outcome at ${pct(bestMort.mortalityRatePct, 2)}, while ${worstMort.label} is highest at ${pct(worstMort.mortalityRatePct, 2)}.`,
  ];
  if (sortedByFcr.length >= 2) {
    out.push(`FCR ranges from ${num(sortedByFcr[0].fcr, 2)} (${sortedByFcr[0].label}) to ${num(sortedByFcr[sortedByFcr.length - 1].fcr, 2)} (${sortedByFcr[sortedByFcr.length - 1].label}).`);
  }
  out.push("Management focus should prioritize the highest-risk cohort, then replicate routines from top-performing flocks on check-in timeliness, feed discipline, and clinical response speed.");
  return out;
}

export function buildFarmOpsNarrative({ totals, riskMix }) {
  const total = Number(totals?.activeFlocks ?? 0);
  const out = [`Farm operations report covers ${total} active flocks and consolidates execution, bio-performance, and inventory movement into one decision view.`];
  if (Number(totals?.overdueFlocks ?? 0) > 0) {
    out.push(`${Math.floor(Number(totals.overdueFlocks))} flocks are currently overdue for check-ins, creating avoidable operational risk if left unresolved.`);
  } else {
    out.push("No flocks are currently overdue for check-ins, indicating healthy operating rhythm.");
  }
  if (riskMix && total > 0) {
    out.push(`Risk profile: healthy ${pct((Number(riskMix.healthy ?? 0) / total) * 100, 1)}, watch ${pct((Number(riskMix.watch ?? 0) / total) * 100, 1)}, at-risk ${pct((Number(riskMix.atRisk ?? 0) / total) * 100, 1)}, critical ${pct((Number(riskMix.critical ?? 0) / total) * 100, 1)}.`);
  }
  out.push("Recommended farm-level actions: clear overdue rounds daily, protect feed supply continuity, and run weekly variance reviews for mortality and FCR at flock and farm levels.");
  return out;
}
