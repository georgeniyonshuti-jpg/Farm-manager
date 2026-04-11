/**
 * PAYGO projection core — ported from Business Model / paygo_core.py (ClevaCredit).
 * Pure JS; no pandas. Used by Farm Manager API for in-app analytics.
 */

/** @typedef {Record<string, number | null>} MonthlyRow */

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

export function defaultPaygoInputs() {
  return {
    proj_months: 36,
    dev_start: 300,
    dev_ramp_end: 5000,
    ramp_months: 6,
    dev_m: 5000,
    vol_mult: 1.0,
    base_repay: 340_000.0,
    dev_cost: 200_000.0,
    dep_pct: 0.3,
    p3: 0.3,
    disc3: 0.3,
    p6: 0.2,
    disc6: 0.2,
    p12: 0.5,
    disc12: 0.0,
    def_rate: 0.1,
    rec_rwf: 35_000.0,
    def_w1: 0.35,
    def_w2: 0.45,
    def_w3: 0.2,
    debt_rate: 0.18,
    io_mos: 3,
    amort_mos: 33,
    min_cash: 50_000_000.0,
    lock_cost: 12_000.0,
    prov_cost: 5000.0,
    plat_act: 750.0,
    mm_pct: 0.025,
    cloud_fix: 2_200_000.0,
    sms_act: 45.0,
    crm_fix: 1_400_000.0,
    sup_fix: 8_500_000.0,
    coll_fix: 6_200_000.0,
    tech_fix: 4_100_000.0,
    admin_fix: 12_000_000.0,
    wh_fix: 3_200_000.0,
    log_dev: 7500.0,
    agent_dev: 450.0,
    comm_pct: 0.03,
    cac_dev: 22_000.0,
    repo_cost: 14_000.0,
    refurb_cost: 22_000.0,
    tax_rate: 0.0,
    hurdle_annual: 0.15,
  };
}

export function mergePaygoInputs(partial) {
  const base = defaultPaygoInputs();
  if (!partial || typeof partial !== "object") return base;
  for (const k of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(partial, k) && partial[k] != null) {
      const v = partial[k];
      if (typeof v === "number" && Number.isFinite(v)) base[k] = v;
    }
  }
  return base;
}

export function unitsForPaygo(inp) {
  return inp.dev_m * inp.vol_mult;
}

export function unitsInSalesMonth(inp, month1based) {
  const vm = inp.vol_mult;
  if (month1based <= inp.ramp_months) {
    if (inp.ramp_months <= 1) return inp.dev_start * vm;
    const span = Math.max(1, inp.ramp_months - 1);
    const u = inp.dev_start + ((inp.dev_ramp_end - inp.dev_start) * (month1based - 1)) / span;
    return u * vm;
  }
  return inp.dev_m * vm;
}

function planRows(inp) {
  return [3, 6, 12].map((mo) => {
    const disc = mo === 3 ? inp.disc3 : mo === 6 ? inp.disc6 : inp.disc12;
    const total = inp.base_repay * (1 - disc);
    const dep = total * inp.dep_pct;
    const fin = total - dep;
    const inst = fin / mo;
    return { mo, total, dep, fin, inst };
  });
}

export function buildEngine(inp) {
  const rows = planRows(inp);
  const [r3, r6, r12] = rows;
  const gross_contract = inp.p3 * r3.total + inp.p6 * r6.total + inp.p12 * r12.total;
  const blended_dep = inp.p3 * r3.dep + inp.p6 * r6.dep + inp.p12 * r12.dep;
  const wsum = inp.def_w1 + inp.def_w2 + inp.def_w3;
  const net_installments = [];
  for (let age = 1; age <= 12; age += 1) {
    const g =
      inp.p3 * (age <= r3.mo ? r3.inst : 0) +
      inp.p6 * (age <= r6.mo ? r6.inst : 0) +
      inp.p12 * (age <= r12.mo ? r12.inst : 0);
    const w = age <= 3 ? inp.def_w1 : age <= 8 ? inp.def_w2 : inp.def_w3;
    const n = g * (1 - inp.def_rate) + inp.def_rate * inp.rec_rwf * (w / wsum);
    net_installments.push(n);
  }
  return { gross_contract, blended_deposit: blended_dep, net_installments };
}

export function cohortCollections(inp, nMonths) {
  const eng = buildEngine(inp);
  const dep = eng.blended_deposit;
  const neti = eng.net_installments;
  const unitsByVintage = [];
  for (let v = 1; v <= nMonths; v += 1) {
    unitsByVintage.push(unitsInSalesMonth(inp, v));
  }
  const cols = [];
  const actives = [];
  for (let m = 1; m <= nMonths; m += 1) {
    let tot = 0;
    for (let v = 1; v <= nMonths; v += 1) {
      if (m < v) continue;
      const uV = unitsByVintage[v - 1];
      if (m === v) tot += uV * dep;
      else {
        const age = m - v;
        if (age >= 1 && age <= 12) tot += uV * neti[age - 1];
      }
    }
    cols.push(tot);
    let ad = 0;
    for (let v = 1; v <= nMonths; v += 1) {
      if (v <= m && v > m - 12) ad += unitsByVintage[v - 1];
    }
    actives.push(ad);
  }
  return { cols, actives, eng };
}

/** @returns {MonthlyRow[]} */
export function runProjection(inp) {
  const n = Math.max(1, Math.min(120, Math.floor(num(inp.proj_months, 36))));
  const { cols, actives, eng } = cohortCollections(inp, n);
  const gc = eng.gross_contract;

  const ebitdas = [];
  for (let m = 0; m < n; m += 1) {
    const u_m = unitsInSalesMonth(inp, m + 1);
    const collections = cols[m];
    const active = actives[m];
    const device = -u_m * inp.dev_cost;
    const lock = -u_m * (inp.lock_cost + inp.prov_cost);
    const comm = -u_m * inp.comm_pct * gc;
    const logcac = -u_m * (inp.log_dev + inp.agent_dev + inp.cac_dev);
    const mm = -inp.mm_pct * collections;
    const plat = -inp.plat_act * active;
    const sms = -inp.sms_act * active;
    const cloud = -(inp.cloud_fix + inp.crm_fix);
    const staff = -(inp.sup_fix + inp.coll_fix + inp.tech_fix + inp.admin_fix);
    const wh = -inp.wh_fix;
    const defops = -u_m * inp.def_rate * (inp.repo_cost + inp.refurb_cost);
    ebitdas.push(
      collections + device + lock + comm + logcac + mm + plat + sms + cloud + staff + wh + defops
    );
  }

  let opening = 0;
  /** @type {MonthlyRow[]} */
  const records = [];
  for (let m = 0; m < n; m += 1) {
    const ebitda = ebitdas[m];
    const interest = (opening * inp.debt_rate) / 12.0;
    const int_exp = -interest;
    const ebt = ebitda + int_exp;
    const tax = -Math.max(0, ebt) * inp.tax_rate;
    const pre_debt = ebitda + tax;
    const prior_cash = m === 0 ? inp.min_cash : records[m - 1].cash_end;
    const draw = Math.max(0, inp.min_cash - (prior_cash + pre_debt));
    let principal = 0;
    if (m + 1 <= inp.io_mos) principal = 0;
    else principal = Math.min(opening + draw, (opening + draw) / inp.amort_mos);
    const closing = opening + draw - principal;
    const cash_end = prior_cash + pre_debt + draw - interest - principal;
    const ds = interest + principal;
    const dscr = ds > 0 ? ebitda / ds : null;
    const ni = ebt + tax;
    const fcf = pre_debt - interest - principal + draw;
    records.push({
      month: m + 1,
      units_sold: unitsInSalesMonth(inp, m + 1),
      collections: cols[m],
      active_devices: actives[m],
      ebitda,
      interest: int_exp,
      ebt,
      tax,
      net_income: ni,
      pre_debt,
      opening_debt: opening,
      draws: draw,
      interest_paid: interest,
      principal,
      closing_debt: closing,
      cash_end,
      dscr,
      fcf,
    });
    opening = closing;
  }
  return records;
}

function npvMonthly(cashflows, annualHurdle) {
  const r = annualHurdle / 12.0;
  let s = 0;
  for (let i = 0; i < cashflows.length; i += 1) {
    s += cashflows[i] / (1.0 + r) ** (i + 1);
  }
  return s;
}

function irrMonthlyBisect(cashflows, lo = -0.99, hi = 5.0) {
  function npvAt(rm) {
    let s = 0;
    for (let i = 0; i < cashflows.length; i += 1) {
      s += cashflows[i] / (1.0 + rm) ** (i + 1);
    }
    return s;
  }
  let vLo;
  let vHi;
  try {
    vLo = npvAt(lo);
    vHi = npvAt(hi);
  } catch {
    return null;
  }
  if (vLo * vHi > 0) return null;
  let loB = lo;
  let hiB = hi;
  let v_lo = vLo;
  let v_hi = vHi;
  for (let _ = 0; _ < 80; _ += 1) {
    const mid = (loB + hiB) / 2.0;
    const vm = npvAt(mid);
    if (Math.abs(vm) < 1e-4) return mid;
    if (vm * v_lo < 0) {
      hiB = mid;
      v_hi = vm;
    } else {
      loB = mid;
      v_lo = vm;
    }
  }
  return (loB + hiB) / 2.0;
}

export function summarizeProjection(df, inp) {
  const fcf = df.map((r) => r.fcf);
  const dscrs = df.map((r) => r.dscr).filter((x) => x != null && Number.isFinite(x));
  const eng = buildEngine(inp);
  const fixed_m =
    inp.cloud_fix +
    inp.crm_fix +
    inp.sup_fix +
    inp.coll_fix +
    inp.tech_fix +
    inp.admin_fix +
    inp.wh_fix;
  const u = unitsForPaygo(inp);
  const cash_in = eng.blended_deposit + eng.net_installments.reduce((a, b) => a + b, 0);
  const dev_stack = inp.dev_cost + inp.lock_cost + inp.prov_cost;
  const comm = inp.comm_pct * eng.gross_contract;
  const logcac = inp.log_dev + inp.agent_dev + inp.cac_dev;
  const mm = inp.mm_pct * cash_in;
  const plat_sms = inp.plat_act * 6.5 + inp.sms_act * 6.5;
  const alloc_fix = fixed_m / Math.max(1.0, u);
  const defop = inp.def_rate * (inp.repo_cost + inp.refurb_cost);
  const cost_ld = dev_stack + comm + logcac + mm + plat_sms + alloc_fix + defop;
  const contrib = cash_in - cost_ld;
  const be_vol = contrib > 0 ? fixed_m / contrib : Infinity;

  const irr_m = irrMonthlyBisect(fcf);
  const irr_ann = irr_m != null ? (1.0 + irr_m) ** 12 - 1.0 : null;

  const closingDebts = df.map((r) => r.closing_debt);
  const peak_debt = Math.max(...closingDebts, 0);

  return {
    gross_contract: eng.gross_contract,
    blended_deposit: eng.blended_deposit,
    deposit_vs_device: eng.blended_deposit / Math.max(1.0, inp.dev_cost),
    peak_debt,
    ending_cash: df.length ? df[df.length - 1].cash_end : 0,
    cum_ebitda: df.reduce((s, r) => s + r.ebitda, 0),
    cum_ni: df.reduce((s, r) => s + r.net_income, 0),
    avg_dscr: dscrs.length ? dscrs.reduce((a, b) => a + b, 0) / dscrs.length : null,
    min_dscr: dscrs.length ? Math.min(...dscrs) : null,
    npv_fcf: npvMonthly(fcf, inp.hurdle_annual),
    irr_monthly: irr_m,
    irr_annualized: irr_ann,
    contribution_per_device: contrib,
    breakeven_devices_mo: be_vol,
    expected_cash_per_device: cash_in,
  };
}

export function profitMilestones(df) {
  const n = df.length;

  function firstMonthPositive(col) {
    for (let i = 0; i < n; i += 1) {
      const v = num(df[i][col]);
      if (v > 0) return { month: df[i].month, value: v };
    }
    return { month: null, value: null };
  }

  const eb = firstMonthPositive("ebitda");
  const ni = firstMonthPositive("net_income");

  let m_cni = null;
  let v_cni = null;
  let cum = 0;
  for (let i = 0; i < n; i += 1) {
    cum += df[i].net_income;
    if (cum > 0) {
      m_cni = df[i].month;
      v_cni = cum;
      break;
    }
  }

  let m_ceb = null;
  let v_ceb = null;
  cum = 0;
  for (let i = 0; i < n; i += 1) {
    cum += df[i].ebitda;
    if (cum > 0) {
      m_ceb = df[i].month;
      v_ceb = cum;
      break;
    }
  }

  let bestIdx = 0;
  let bestE = df[0]?.ebitda ?? 0;
  for (let i = 1; i < n; i += 1) {
    if (df[i].ebitda > bestE) {
      bestE = df[i].ebitda;
      bestIdx = i;
    }
  }

  return {
    first_operating_profit_month: eb.month,
    first_operating_profit_rwf: eb.value,
    first_net_profit_month: ni.month,
    first_net_profit_rwf: ni.value,
    first_cumulative_net_positive_month: m_cni,
    first_cumulative_net_positive_rwf: v_cni,
    first_cumulative_ebitda_positive_month: m_ceb,
    first_cumulative_ebitda_positive_rwf: v_ceb,
    strongest_ebitda_month: df[bestIdx]?.month ?? null,
    strongest_ebitda_rwf: df[bestIdx]?.ebitda ?? null,
  };
}

export function replacePaygoInputs(inp, overrides) {
  return { ...inp, ...overrides };
}

export function leverScenarioRows(inp) {
  const rowFor = (label, modified) => {
    const d = runProjection(modified);
    const pm = profitMilestones(d);
    return {
      Scenario: label,
      "Operating profit starts (month)": pm.first_operating_profit_month,
      "That month EBITDA (RWF)": pm.first_operating_profit_rwf,
      "Net profit starts (month)": pm.first_net_profit_month,
      "That month net income (RWF)": pm.first_net_profit_rwf,
      "Cumulative net turns + (month)": pm.first_cumulative_net_positive_month,
    };
  };

  const rows = [];
  rows.push(rowFor("Current (inputs)", inp));
  rows.push(rowFor("Defaults −2 pp", replacePaygoInputs(inp, { def_rate: Math.max(0, inp.def_rate - 0.02) })));
  rows.push(
    rowFor(
      "All monthly fixed opex −10%",
      replacePaygoInputs(inp, {
        cloud_fix: inp.cloud_fix * 0.9,
        crm_fix: inp.crm_fix * 0.9,
        sup_fix: inp.sup_fix * 0.9,
        coll_fix: inp.coll_fix * 0.9,
        tech_fix: inp.tech_fix * 0.9,
        admin_fix: inp.admin_fix * 0.9,
        wh_fix: inp.wh_fix * 0.9,
      })
    )
  );
  rows.push(rowFor("Device cost −RWF 10,000", replacePaygoInputs(inp, { dev_cost: Math.max(50_000, inp.dev_cost - 10_000) })));
  rows.push(rowFor("Interest −2 pp", replacePaygoInputs(inp, { debt_rate: Math.max(0.05, inp.debt_rate - 0.02) })));
  rows.push(
    rowFor("Start smaller (50% mo-1 units)", replacePaygoInputs(inp, { dev_start: Math.max(0, Math.floor(inp.dev_start * 0.5)) }))
  );
  return rows;
}
