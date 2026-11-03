/** Pick the target row that was in force for a week. History does not rewrite. */

export function resolveTarget(rows, metric, weekFrom) {
  const matching = (rows || []).filter((row) => row.metric === metric && String(row.effectiveFrom) <= weekFrom);
  matching.sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)) || String(a.id).localeCompare(String(b.id)));
  return matching.length ? matching[matching.length - 1] : null;
}

/** T1 is the floor. T2 is the stretch. A row with no tier is T1, so older rows still apply. */
export function resolveTargets(rows, metric, weekFrom) {
  const list = rows || [];
  return {
    t1: resolveTarget(list.filter((row) => row.tier !== "t2"), metric, weekFrom),
    t2: resolveTarget(list.filter((row) => row.tier === "t2"), metric, weekFrom),
  };
}

export const DEFAULT_TARGETS = [
  { id: "default-d8-sellers", metric: "sellers_activated_per_week", role: "seller", scope: "team", value: 10, effectiveFrom: "2020-01-01" },
  { id: "default-d8-scouts", metric: "scouts_activated_per_week", role: "scout", scope: "team", value: 2, effectiveFrom: "2020-01-01" },
  { id: "default-d8-buyers", metric: "buyers_activated_per_week", role: "buyer", scope: "team", value: 8, effectiveFrom: "2020-01-01" },
  { id: "default-d8-lots", metric: "scout_lots_per_week", role: "scout", scope: "per_scout", value: 8, effectiveFrom: "2020-01-01" },
  { id: "default-d8-scout-sellers", metric: "scout_sellers_per_week", role: "scout", scope: "per_scout", value: 4, effectiveFrom: "2020-01-01" },
  { id: "default-d8-birds", metric: "scout_birds_per_week", role: "scout", scope: "per_scout", value: 400, effectiveFrom: "2020-01-01" },
];
