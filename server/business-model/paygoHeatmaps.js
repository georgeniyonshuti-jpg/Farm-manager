/**
 * Sensitivity grids — mirrors Business Model / app.py `page_heatmaps`.
 */

import {
  runProjection,
  summarizeProjection,
  profitMilestones,
  replacePaygoInputs,
} from "./paygoCore.js";
import { PRESET_DEVICE_COSTS_RWF, HEATMAP_DEVICE_TIER_LABELS } from "./paygoBuilder.js";

export function buildPaygoHeatmaps(baseInp) {
  const defs = [1, 2, 3, 4, 5];
  const vols = [0.7, 0.85, 1.0, 1.15, 1.3];
  const z1 = defs.map((dr) =>
    vols.map((vm) => {
      const inp = replacePaygoInputs(baseInp, { def_rate: dr / 100.0, vol_mult: vm });
      const df = runProjection(inp);
      return df.reduce((s, r) => s + r.net_income, 0);
    })
  );

  const tiers = HEATMAP_DEVICE_TIER_LABELS;
  const debts = [10, 14, 18, 22, 26];
  const z2 = debts.map((dr) =>
    tiers.map((t) => {
      const dev = PRESET_DEVICE_COSTS_RWF[t];
      const inp = replacePaygoInputs(baseInp, { debt_rate: dr / 100.0, dev_cost: dev });
      const df = runProjection(inp);
      const irr = summarizeProjection(df, inp).irr_annualized;
      return irr != null ? irr * 100 : 0;
    })
  );

  const downs = [20, 25, 30, 35, 40];
  const mix12 = [30, 40, 50, 60, 70];
  const z3 = downs.map((dp) =>
    mix12.map((m12) => {
      const rest = 100 - m12;
      const p3 = (rest * 0.55) / 100;
      const p6 = (rest * 0.45) / 100;
      const p12 = m12 / 100;
      const inp = replacePaygoInputs(baseInp, {
        dep_pct: dp / 100.0,
        p3,
        p6,
        p12,
      });
      const df = runProjection(inp);
      const pm = profitMilestones(df);
      const m = pm.first_operating_profit_month;
      return m != null ? m : Number.NaN;
    })
  );

  return {
    cumulativeNetIncome: {
      title: "Cumulative net income — Default × Volume",
      yLabels: defs.map((d) => `${d}%`),
      xLabels: vols.map((v) => `${v.toFixed(2)}×`),
      z: z1,
      cellKind: "money",
    },
    irrDebtTier: {
      title: "IRR % — Cost of debt × Device tier",
      yLabels: debts.map((d) => `${d}%`),
      xLabels: tiers,
      z: z2,
      cellKind: "irr",
    },
    ebitdaBreakevenMonth: {
      title: "EBITDA breakeven month — Down payment × 12-mo mix",
      yLabels: downs.map((d) => `${d}%`),
      xLabels: mix12.map((m) => `${m}%`),
      z: z3,
      cellKind: "month",
    },
  };
}
