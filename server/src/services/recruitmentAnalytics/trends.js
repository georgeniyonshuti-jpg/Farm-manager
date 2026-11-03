/** Cohort triangle, weekly lines, XmR. Charts stay off until the sample is large enough. */

import { xmr } from "./stats.js";
import { addDays, inRange, kigaliDate, kigaliHour, weeksEnding } from "./time.js";

export function weeklyCounts(people, role, field, to, weeks = 6) {
  const buckets = weeksEnding(to, weeks);
  return buckets.map((bucket) => ({
    from: bucket.from,
    to: bucket.to,
    value: (people || []).filter((p) => !p.isInternal && !p.isSynthetic && p.role === role && p[field] && inRange(p[field], bucket.from, bucket.to)).length,
  }));
}

export function cohortTriangle(people, { role = "seller", to, windowDays = 14, maxAge = 8, now = new Date() }) {
  const sellers = (people || []).filter((p) => !p.isInternal && !p.isSynthetic && p.role === role && p.createdAt);
  const byWeek = new Map();
  for (const person of sellers) {
    const created = kigaliDate(person.createdAt);
    if (!created || created > to) continue;
    const week = weeksEnding(created, 1)[0];
    if (!byWeek.has(week.from)) byWeek.set(week.from, []);
    byWeek.get(week.from).push(person);
  }
  const weekStarts = [...byWeek.keys()].sort();
  const today = kigaliDate(now);
  const rows = weekStarts.map((from) => {
    const members = byWeek.get(from);
    const cells = [];
    for (let age = 0; age < maxAge; age += 1) {
      const ageEnd = addDays(from, (age + 1) * 7 - 1);
      if (ageEnd > today) {
        cells.push({ age, value: null, state: "not_reached" });
        continue;
      }
      const incomplete = addDays(from, age * 7) <= today && ageEnd >= today;
      const reached = members.filter((p) => {
        if (!p.activatedAt) return false;
        const days = (new Date(p.activatedAt) - new Date(p.createdAt)) / 86400000;
        return days >= 0 && days <= Math.min(windowDays, (age + 1) * 7);
      }).length;
      cells.push({
        age,
        value: members.length ? reached / members.length : null,
        reached,
        n: members.length,
        state: incomplete ? "incomplete" : "complete",
      });
    }
    return { cohort: from, n: members.length, cells };
  });
  const enough = rows.filter((r) => r.n >= 10).length >= 4;
  const average = [];
  for (let age = 0; age < maxAge; age += 1) {
    let weight = 0;
    let sum = 0;
    for (const row of rows) {
      const cell = row.cells[age];
      if (!cell || cell.value == null || cell.state === "not_reached") continue;
      sum += cell.value * row.n;
      weight += row.n;
    }
    average.push(weight ? sum / weight : null);
  }
  return {
    available: enough,
    hiddenReason: enough ? null : "Need at least 4 cohorts with 10 people each. Showing the cohort sizes instead.",
    rows,
    weightedAverage: average,
    definitionId: "M-TOP-RATE",
  };
}

export function activationHistogram(people, role = "seller") {
  const buckets = [
    { id: "0-1", min: 0, max: 1, n: 0 },
    { id: "2-3", min: 2, max: 3, n: 0 },
    { id: "4-7", min: 4, max: 7, n: 0 },
    { id: "8-14", min: 8, max: 14, n: 0 },
    { id: "15+", min: 15, max: Infinity, n: 0 },
  ];
  let n = 0;
  for (const person of people || []) {
    if (person.isInternal || person.role !== role || !person.activatedAt || !person.createdAt) continue;
    const days = (new Date(person.activatedAt) - new Date(person.createdAt)) / 86400000;
    if (days < 0) continue;
    n += 1;
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (bucket) bucket.n += 1;
  }
  return { definitionId: "M-MEDIAN-TTS", n, buckets };
}

export function hourHeatmap(people, from, to) {
  const signups = (people || []).filter((p) => !p.isInternal && !p.isSynthetic && inRange(p.createdAt, from, to));
  if (signups.length < 100) {
    return { available: false, reason: "Hidden until there are at least 100 signups in this range.", n: signups.length, cells: [] };
  }
  const cells = [];
  for (const person of signups) {
    const slot = kigaliHour(person.createdAt);
    if (!slot) continue;
    cells.push(slot);
  }
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const cell of cells) grid[cell.day][cell.hour] += 1;
  return { available: true, n: signups.length, grid, definitionId: "M-REACH" };
}

export function trendBlock(people, { to, now = new Date() }) {
  const sellerWeeks = weeklyCounts(people, "seller", "activatedAt", to, 12);
  const points = sellerWeeks.map((w) => w.value);
  const recent = sellerWeeks.slice(-6);
  const xmrResult = xmr(points);
  return {
    inputs: recent.map((w) => ({ week: w.from, sellersActivated: w.value, definitionId: "M-SELLER-ACTIVATED", n: w.value })),
    twelveMonths: sellerWeeks.length >= 26 ? sellerWeeks : null,
    twelveMonthsReason: sellerWeeks.length >= 26 ? null : "Twelve-month view waits until six months of weeks exist.",
    xmr: xmrResult
      ? { ...xmrResult, points, label: xmrResult.outside.some(Boolean) || xmrResult.runFlags.some(Boolean) ? "real change" : "normal variation" }
      : null,
    xmrReason: xmrResult ? null : "XmR needs 8 weekly points. Showing the plain line.",
    cohorts: cohortTriangle(people, { to, now }),
    histogram: activationHistogram(people),
    heatmap: hourHeatmap(people, addDays(to, -29), to),
  };
}
