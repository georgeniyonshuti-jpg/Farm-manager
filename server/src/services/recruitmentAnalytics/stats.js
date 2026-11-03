/**
 * Statistical helpers. Port of SPEC appendix B.
 * A rate that would exceed 100% is refused, never clipped into a pretty number.
 */

export function wilson(successes, n, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(n) || n <= 0) return null;
  if (successes < 0 || successes > n) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half), n };
}

export function quantile(values, q) {
  const v = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export const median = (values) => quantile(values, 0.5);

export function safeRate(num, den) {
  if (!(den > 0)) return { ok: false, reason: "no-denominator", num, den };
  if (num < 0 || num > den) return { ok: false, reason: "invariant-violation", num, den };
  return { ok: true, value: num / den, num, den };
}

export function periodChange(curr, prev, minBaselineForPct = 5) {
  const abs = curr - prev;
  const pct = prev >= minBaselineForPct ? abs / prev : null;
  const direction = abs > 0 ? "up" : abs < 0 ? "down" : "flat";
  return { abs, pct, direction };
}

export function pace(actual, target, elapsedFraction) {
  const fraction = Math.min(Math.max(elapsedFraction, 0), 1);
  const expected = target * fraction;
  const slack = Math.max(0.15 * target, 1);
  if (actual >= expected + slack) return "ahead";
  if (actual < expected - slack) return "behind";
  return "on_track";
}

export function xmr(points) {
  if (!points || points.length < 8) return null;
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const mr = points.slice(1).map((x, i) => Math.abs(x - points[i]));
  const mrBar = mr.reduce((a, b) => a + b, 0) / mr.length;
  const ucl = mean + 2.66 * mrBar;
  const lcl = Math.max(0, mean - 2.66 * mrBar);
  const outside = points.map((x) => x > ucl || x < lcl);
  const runFlags = points.map((_, i) => {
    if (i < 7) return false;
    const w = points.slice(i - 7, i + 1);
    return w.every((x) => x > mean) || w.every((x) => x < mean);
  });
  return { mean, ucl, lcl, outside, runFlags };
}

/** Median and IQR. Under 5 finite values, return the values instead of a median. */
export function timeSummary(days) {
  const valid = (days || []).filter((d) => Number.isFinite(d) && d >= 0);
  const excluded = (days || []).filter((d) => Number.isFinite(d) && d < 0).length;
  if (valid.length === 0) {
    return { value: null, n: 0, iqr: null, individuals: [], excludedNegatives: excluded };
  }
  if (valid.length < 5) {
    return {
      value: null,
      n: valid.length,
      iqr: null,
      individuals: [...valid].sort((a, b) => a - b),
      excludedNegatives: excluded,
    };
  }
  return {
    value: median(valid),
    n: valid.length,
    iqr: [quantile(valid, 0.25), quantile(valid, 0.75)],
    individuals: null,
    excludedNegatives: excluded,
  };
}
