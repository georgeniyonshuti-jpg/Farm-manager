/**
 * Broiler batch economics — ported from Business Model / broiler_model.py.
 */

export function defaultBroilerInputs() {
  return {
    chicks: 10_000,
    cost_per_chick: 850.0,
    chick_weight_kg: 0.042,
    cycle_days: 35,
    mortality_pct: 4.0,
    finish_weight_kg: 2.15,
    price_per_kg: 1350.0,
    price_per_bird: 0.0,
    feed_price_per_kg: 920.0,
    feed_kg_total: 0.0,
    fcr: 1.65,
    med_vaccine_total: 2_500_000.0,
    labor_total: 4_000_000.0,
    utilities_total: 1_200_000.0,
    transport_total: 800_000.0,
    overhead_fixed: 0.0,
    mortality_curve_exponent: 1.0,
  };
}

export function mergeBroilerInputs(partial) {
  const base = defaultBroilerInputs();
  if (!partial || typeof partial !== "object") return base;
  for (const k of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(partial, k) && partial[k] != null) {
      const v = partial[k];
      if (typeof v === "number" && Number.isFinite(v)) base[k] = v;
    }
  }
  return base;
}

function mortalityFrac(inp) {
  return Math.max(0, Math.min(0.95, inp.mortality_pct / 100));
}

function birdsEnd(inp) {
  return inp.chicks * (1.0 - mortalityFrac(inp));
}

function massGainKg(inp) {
  const dw = Math.max(inp.finish_weight_kg - inp.chick_weight_kg, 0.01);
  return birdsEnd(inp) * dw;
}

function feedKgResolved(inp) {
  if (inp.feed_kg_total > 0) return inp.feed_kg_total;
  return inp.fcr * massGainKg(inp);
}

function chickCostTotal(inp) {
  return inp.chicks * inp.cost_per_chick;
}

function feedCost(inp) {
  return feedKgResolved(inp) * inp.feed_price_per_kg;
}

function totalCostProduction(inp) {
  return (
    chickCostTotal(inp) +
    feedCost(inp) +
    inp.med_vaccine_total +
    inp.labor_total +
    inp.utilities_total +
    inp.transport_total
  );
}

function revenue(inp) {
  const be = birdsEnd(inp);
  if (inp.price_per_bird > 0) return be * inp.price_per_bird;
  return be * inp.finish_weight_kg * inp.price_per_kg;
}

function grossProfit(inp) {
  return revenue(inp) - totalCostProduction(inp);
}

export function netProfitBroiler(inp) {
  return grossProfit(inp) - inp.overhead_fixed;
}

export function effectiveFcr(inp) {
  const mg = massGainKg(inp);
  const fk = feedKgResolved(inp);
  return mg > 1e-6 ? fk / mg : NaN;
}

export function breakEvenPricePerKg(inp) {
  const be = birdsEnd(inp);
  if (be <= 0 || inp.finish_weight_kg <= 0) return NaN;
  return totalCostProduction(inp) / (be * inp.finish_weight_kg);
}

export function broilerSummary(inp) {
  const be = birdsEnd(inp);
  return {
    birds_end: be,
    birds_lost: inp.chicks - be,
    revenue_rwf: revenue(inp),
    total_cost_rwf: totalCostProduction(inp),
    gross_profit_rwf: grossProfit(inp),
    net_profit_rwf: netProfitBroiler(inp),
    feed_kg: feedKgResolved(inp),
    feed_cost_rwf: feedCost(inp),
    effective_fcr: effectiveFcr(inp),
    break_even_price_per_kg: breakEvenPricePerKg(inp),
    roi_cycle: totalCostProduction(inp) > 0 ? netProfitBroiler(inp) / totalCostProduction(inp) : NaN,
    working_capital_proxy: totalCostProduction(inp),
  };
}

/** @returns {Record<string, number>[]} */
export function dailyTrajectory(inp) {
  const D = Math.max(1, Math.floor(inp.cycle_days));
  const days = [];
  const exp = inp.mortality_curve_exponent;
  const fkTotal = feedKgResolved(inp);
  const metabolic = [];
  let msum = 0;
  for (let d = 1; d <= D; d += 1) {
    const t = d / D;
    const cumMort = mortalityFrac(inp) * t ** exp;
    const surv = inp.chicks * (1.0 - cumMort);
    const w = inp.chick_weight_kg + (inp.finish_weight_kg - inp.chick_weight_kg) * t ** 0.92;
    const met = Math.max(surv, 0) * Math.max(w, 0.02) ** 0.72;
    metabolic.push(met);
    msum += met;
  }
  if (msum <= 0) msum = 1;
  const rows = [];
  let feedCum = 0;
  const chickC = chickCostTotal(inp);
  const other =
    inp.med_vaccine_total + inp.labor_total + inp.utilities_total + inp.transport_total;
  const otherDaily = other / D;
  const revEnd = revenue(inp);
  for (let d = 1; d <= D; d += 1) {
    const t = d / D;
    const cumMort = mortalityFrac(inp) * t ** exp;
    const surv = inp.chicks * (1.0 - cumMort);
    const w = inp.chick_weight_kg + (inp.finish_weight_kg - inp.chick_weight_kg) * t ** 0.92;
    const feedDaily = fkTotal * (metabolic[d - 1] / msum);
    feedCum += feedDaily;
    const feedC = feedCum * inp.feed_price_per_kg;
    const costCum = chickC + feedC + otherDaily * d;
    const revCum = revEnd * t;
    rows.push({
      day: d,
      birds_alive: surv,
      avg_weight_kg: w,
      mortality_cumulative: inp.chicks - surv,
      feed_cum_kg: feedCum,
      feed_daily_kg: feedDaily,
      cost_cum_rwf: costCum,
      revenue_cum_rwf: revCum,
    });
  }
  return rows;
}

export function weeklyMortalityRates(traj) {
  if (!traj.length) return [];
  const maxDay = traj[traj.length - 1].day;
  const daySet = new Set(traj.map((r) => r.day));
  const rows = [];
  for (let wk = 0; wk <= Math.floor(maxDay / 7); wk += 1) {
    const d0 = wk * 7 + 1;
    const d1 = Math.min((wk + 1) * 7, maxDay);
    if (!daySet.has(d0)) continue;
    const s0 = traj.find((r) => r.day === d0)?.birds_alive;
    if (s0 == null || !Number.isFinite(s0) || s0 <= 0) continue;
    const sub = traj.filter((r) => r.day >= d0 && r.day <= d1);
    if (!sub.length) continue;
    const s1 = sub[sub.length - 1].birds_alive;
    const rate = Math.max(0, ((s0 - s1) / s0) * 100);
    rows.push({ week: wk + 1, mortality_pct_of_week_start: rate });
  }
  return rows;
}

function scenarioCopy(inp, overrides) {
  return { ...inp, ...overrides };
}

export function mortalityProfitDragPct(inp) {
  const z = netProfitBroiler(scenarioCopy(inp, { mortality_pct: 0 }));
  const n = netProfitBroiler(inp);
  if (Math.abs(z) < 1e-6) return NaN;
  return ((z - n) / Math.abs(z)) * 100;
}

export function insightMessagesBroiler(inp, traj) {
  const out = [];
  const wk = weeklyMortalityRates(traj);
  if (wk.length >= 2) {
    const w2row = wk.find((r) => r.week === 2);
    const w2 = w2row ? w2row.mortality_pct_of_week_start : 0;
    if (w2 > 1.2) {
      out.push(
        "High mortality detected in week 2 — review heat, ventilation, and brooding density."
      );
    }
  }
  const fc = feedCost(inp);
  const tcp = totalCostProduction(inp);
  if (tcp > 0 && fc / tcp > 0.62) {
    out.push(
      "Feed cost exceeds a typical optimal share of total cost — negotiate feed, tighten FCR, or review rations."
    );
  }
  if (effectiveFcr(inp) > 1.78) {
    out.push(
      "Feed conversion is above common industry targets — check feed quality, health stress, and lighting program."
    );
  }
  if (inp.mortality_pct > 6) {
    out.push("Cycle mortality is elevated — prioritize veterinary review and biosecurity audit.");
  }
  const be = breakEvenPricePerKg(inp);
  if (Number.isFinite(be) && inp.price_per_kg > 0 && inp.price_per_bird <= 0) {
    const headroom = ((inp.price_per_kg - be) / inp.price_per_kg) * 100;
    if (headroom < 8) {
      out.push(
        "Thin margin vs break-even liveweight price — small price or mortality moves swing profit sharply."
      );
    }
  }
  if (netProfitBroiler(inp) < 0) {
    out.push(
      "Projected net margin is negative at these assumptions — simulate lower mortality or higher price before placing chicks."
    );
  }
  const dp = mortalityProfitDragPct(inp);
  if (Number.isFinite(dp) && Math.abs(dp) > 4) {
    out.push(
      `Mortality alone reduces achievable net profit by roughly ${Math.abs(dp).toFixed(1)}% relative to a same-cost flock with no losses.`
    );
  }
  if (!out.length) {
    out.push(
      "Key indicators are within a reasonable band — keep logging daily checks to catch drift early."
    );
  }
  return out;
}
