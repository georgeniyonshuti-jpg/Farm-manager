/**
 * Maps Streamlit-style control objects (ctl) to engine PaygoInputs — mirrors Business Model / app.py
 * `build_paygo_inputs`, `_scale_fixed_opex`, `ctl_to_inputs`, and related constants.
 */

import { defaultPaygoInputs, unitsForPaygo } from "./paygoCore.js";

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export const CUSTOM_DEVICE_TIER = "Custom (type RWF below)";

export const PRESET_DEVICE_COSTS_RWF = {
  "Budget (60k RWF)": 60_000,
  "Value (85k RWF)": 85_000,
  "Standard (100k RWF)": 100_000,
  "Mid (120k RWF)": 120_000,
  "Mid (144k RWF)": 144_000,
  "Upper mid (180k RWF)": 180_000,
  "High (220k RWF)": 220_000,
  "Premium (300k RWF)": 300_000,
};

export const DEVICE_TIER_OPTIONS = [...Object.keys(PRESET_DEVICE_COSTS_RWF), CUSTOM_DEVICE_TIER];

export const HEATMAP_DEVICE_TIER_LABELS = Object.keys(PRESET_DEVICE_COSTS_RWF);

const VOL_PRESETS = {
  Conservative: [200, 3000, 8, 3000],
  Base: [300, 5000, 6, 5000],
  Aggressive: [500, 8000, 4, 8000],
};

/** Keys passed through ctl / `build_paygo_inputs` (matches app.py BUILD_KEYS minus non-engine). */
export const BUILD_KEYS = [
  "proj_months",
  "volume_mode",
  "custom_monthly",
  "def_rate_pct",
  "debt_rate_pct",
  "device_tier_label",
  "custom_dev_cost_rwf",
  "customer_payback_multiple",
  "dep_pct",
  "disc3_pct",
  "disc6_pct",
  "disc12_pct",
  "mix_p3",
  "mix_p6",
  "mix_p12",
  "fixed_opex_per_device",
  "platform_cac_per_unit",
  "recovery_pct",
  "ltv_pct",
  "grace_mos",
  "amort_mos",
  "vol_mult",
];

const NON_ENGINE_BUILD_KEYS = new Set(["investor_capital_pct", "creditor_capital_pct"]);

function defaultFixedMonthly(inp) {
  return (
    inp.cloud_fix +
    inp.crm_fix +
    inp.sup_fix +
    inp.coll_fix +
    inp.tech_fix +
    inp.admin_fix +
    inp.wh_fix
  );
}

export function defaultFixedOpexPerDevice() {
  const ref = defaultPaygoInputs();
  return defaultFixedMonthly(ref) / Math.max(1.0, unitsForPaygo(ref));
}

export function scaleFixedOpex(inp, targetMonthly) {
  const base = defaultFixedMonthly(inp);
  if (base <= 0) return inp;
  const s = targetMonthly / base;
  return {
    ...inp,
    cloud_fix: inp.cloud_fix * s,
    crm_fix: inp.crm_fix * s,
    sup_fix: inp.sup_fix * s,
    coll_fix: inp.coll_fix * s,
    tech_fix: inp.tech_fix * s,
    admin_fix: inp.admin_fix * s,
    wh_fix: inp.wh_fix * s,
  };
}

/**
 * @param {Record<string, unknown>} kw — same kwargs as Python `build_paygo_inputs`
 */
export function buildPaygoInputs(kw) {
  let p = { ...defaultPaygoInputs() };

  const proj_months = clamp(Math.floor(num(kw.proj_months, 36)), 1, 120);
  const def_rate_pct = num(kw.def_rate_pct, 10);
  const debt_rate_pct = num(kw.debt_rate_pct, 18);
  const device_tier_label = String(kw.device_tier_label ?? "Mid (144k RWF)");
  const custom_dev_cost_rwf = num(kw.custom_dev_cost_rwf, 144_000);
  const customer_payback_multiple = num(kw.customer_payback_multiple, 1.7);
  const dep_pct = num(kw.dep_pct, 30);
  const disc3_pct = num(kw.disc3_pct, 30);
  const disc6_pct = num(kw.disc6_pct, 20);
  const disc12_pct = num(kw.disc12_pct, 0);
  const mix_p3 = num(kw.mix_p3, 30);
  const mix_p6 = num(kw.mix_p6, 20);
  const mix_p12 = num(kw.mix_p12, 50);
  const fixed_opex_per_device = num(kw.fixed_opex_per_device, defaultFixedOpexPerDevice());
  const platform_cac_per_unit = num(kw.platform_cac_per_unit, 22_750);
  const recovery_pct = num(kw.recovery_pct, 35);
  const ltv_pct = num(kw.ltv_pct, 70);
  const grace_mos = Math.floor(num(kw.grace_mos, 3));
  const amort_mos = Math.floor(num(kw.amort_mos, 33));
  const vol_mult_kw = num(kw.vol_mult, 1.0);
  const volume_mode = String(kw.volume_mode ?? "Base");
  const custom_monthly = Array.isArray(kw.custom_monthly) ? kw.custom_monthly.map((x) => num(x)) : null;

  let dev_cost;
  if (device_tier_label === CUSTOM_DEVICE_TIER) {
    dev_cost = clamp(custom_dev_cost_rwf, 25_000.0, 5_000_000.0);
  } else {
    dev_cost = PRESET_DEVICE_COSTS_RWF[device_tier_label] ?? 144_000.0;
  }

  p = {
    ...p,
    proj_months,
    def_rate: def_rate_pct / 100.0,
    debt_rate: debt_rate_pct / 100.0,
    dev_cost,
  };

  const dep_adv = clamp(dep_pct / 100.0, 0.05, 0.95);
  const dep_ltv = clamp(1.0 - ltv_pct / 100.0, 0.05, 0.95);
  const dep_eff = Math.max(dep_adv, dep_ltv);
  p = { ...p, dep_pct: dep_eff };

  const mult = clamp(customer_payback_multiple, 1.15, 2.5);
  const base_repay = clamp(dev_cost * mult, 50_000.0, 15_000_000.0);
  p = { ...p, base_repay };

  const d3 = clamp(disc3_pct / 100.0, 0.0, 0.95);
  const d6 = clamp(disc6_pct / 100.0, 0.0, 0.95);
  const d12 = clamp(disc12_pct / 100.0, 0.0, 0.95);
  p = { ...p, disc3: d3, disc6: d6, disc12: d12 };

  const s = Math.max(1e-9, mix_p3 + mix_p6 + mix_p12);
  p = { ...p, p3: mix_p3 / s, p6: mix_p6 / s, p12: mix_p12 / s };

  const rec = Math.max(5_000.0, dev_cost * (recovery_pct / 100.0) * 0.85);
  p = { ...p, rec_rwf: rec };

  let ds = VOL_PRESETS.Base[0];
  let dend = VOL_PRESETS.Base[1];
  let rmo = VOL_PRESETS.Base[2];
  let dm = VOL_PRESETS.Base[3];
  if (Object.prototype.hasOwnProperty.call(VOL_PRESETS, volume_mode)) {
    [ds, dend, rmo, dm] = VOL_PRESETS[volume_mode];
  } else if (volume_mode === "Custom" && custom_monthly && custom_monthly.length >= 12) {
    ds = Math.floor(custom_monthly[0]);
    dend = Math.floor(custom_monthly[11]);
    rmo = 12;
    dm = Math.floor(custom_monthly[11]);
  }

  p = {
    ...p,
    dev_start: Math.floor(ds * vol_mult_kw),
    dev_ramp_end: Math.floor(dend * vol_mult_kw),
    ramp_months: Math.floor(rmo),
    dev_m: Math.floor(dm * vol_mult_kw),
    vol_mult: 1.0,
  };

  p = {
    ...p,
    io_mos: Math.max(0, grace_mos),
    amort_mos: Math.max(1, amort_mos),
  };

  const steady_u = Math.max(1.0, unitsForPaygo(p));
  const implied_monthly_fixed = Math.max(0.0, fixed_opex_per_device) * steady_u;
  p = scaleFixedOpex(p, implied_monthly_fixed);

  const ref = defaultPaygoInputs();
  const base_cac = ref.cac_dev + ref.plat_act * 0.15;
  const cac_tgt = Math.max(0.0, platform_cac_per_unit);
  if (base_cac > 0) {
    const cf = cac_tgt / base_cac;
    p = {
      ...p,
      cac_dev: Math.max(0.0, p.cac_dev * cf),
      plat_act: Math.max(0.0, p.plat_act * cf),
    };
  }

  return p;
}

export function defaultPaygoCtl() {
  return {
    proj_months: 36,
    volume_mode: "Base",
    custom_monthly: null,
    def_rate_pct: 10,
    debt_rate_pct: 18,
    device_tier_label: "Mid (144k RWF)",
    custom_dev_cost_rwf: 144_000,
    customer_payback_multiple: 1.7,
    dep_pct: 30,
    disc3_pct: 30,
    disc6_pct: 20,
    disc12_pct: 0,
    mix_p3: 30,
    mix_p6: 20,
    mix_p12: 50,
    fixed_opex_per_device: defaultFixedOpexPerDevice(),
    platform_cac_per_unit: 22_750,
    recovery_pct: 35,
    ltv_pct: 70,
    grace_mos: 3,
    amort_mos: 33,
    dscr_floor: 1.25,
    vol_mult: 1.0,
    investor_capital_pct: 30,
    creditor_capital_pct: 70,
    confidence: false,
    comparison: false,
  };
}

/**
 * @param {Record<string, unknown>} ctl
 */
export function ctlToInputs(ctl) {
  const kw = {};
  for (const k of BUILD_KEYS) {
    if (ctl && Object.prototype.hasOwnProperty.call(ctl, k) && !NON_ENGINE_BUILD_KEYS.has(k)) {
      kw[k] = ctl[k];
    }
  }
  if (kw.custom_dev_cost_rwf == null) {
    const lbl = String(kw.device_tier_label ?? "Mid (144k RWF)");
    if (lbl === CUSTOM_DEVICE_TIER) {
      kw.custom_dev_cost_rwf = num(ctl?.custom_dev_cost_rwf, 144_000);
    } else if (PRESET_DEVICE_COSTS_RWF[lbl] != null) {
      kw.custom_dev_cost_rwf = PRESET_DEVICE_COSTS_RWF[lbl];
    } else {
      kw.custom_dev_cost_rwf = 144_000.0;
    }
  }
  if (kw.customer_payback_multiple == null) {
    kw.customer_payback_multiple = num(ctl?.customer_payback_multiple, 1.7);
  }
  return buildPaygoInputs(kw);
}

/** Merge partial ctl onto defaults (for PATCH-style updates). */
export function mergePaygoCtl(partial) {
  const base = defaultPaygoCtl();
  if (!partial || typeof partial !== "object") return base;
  const out = { ...base };
  for (const k of Object.keys(partial)) {
    if (partial[k] !== undefined && partial[k] !== null) {
      out[k] = partial[k];
    }
  }
  if (out.custom_monthly != null && !Array.isArray(out.custom_monthly)) {
    out.custom_monthly = null;
  }
  return out;
}
