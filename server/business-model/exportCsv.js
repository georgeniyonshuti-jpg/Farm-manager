/**
 * CSV export utilities for business-model outputs.
 * Every export embeds run metadata as comment header rows.
 */

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function row(arr) {
  return arr.map(esc).join(",");
}

function num(v, decimals = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "";
  return Number(v).toFixed(decimals);
}

function buildRunMeta(runMeta) {
  return [
    `# ClevaCredit — Business Model Export`,
    `# Generated: ${runMeta.timestamp ?? new Date().toISOString()}`,
    `# Horizon: ${runMeta.horizonMonths ?? "—"} months`,
    `# Volume mode: ${runMeta.volumeMode ?? "—"}`,
    `# Volume multiplier: ${runMeta.volMult ?? "—"}`,
    `# Default rate: ${runMeta.defRatePct ?? "—"}%`,
    `# Cost of debt: ${runMeta.debtRatePct ?? "—"}%`,
    `# Device tier: ${runMeta.deviceTier ?? "—"}`,
    `# Device cost: ${runMeta.deviceCostRwf ?? "—"} RWF`,
    `# Investor equity target: ${runMeta.investorPct ?? "—"}%`,
    `# Creditor target: ${runMeta.creditorPct ?? "—"}%`,
    "#",
  ];
}

/**
 * Full monthly projection CSV with metadata header.
 */
export function projectionToCsv(series, summary, milestones, runMeta = {}) {
  const lines = [
    ...buildRunMeta(runMeta),
    "# KPI SUMMARY",
    row(["KPI", "Value", "Description"]),
    row(["Peak debt (RWF)", num(summary.peak_debt, 0), "Maximum cumulative facility drawdown"]),
    row(["Ending cash (RWF)", num(summary.ending_cash, 0), "Cash balance at end of horizon"]),
    row(["Cumulative EBITDA (RWF)", num(summary.cum_ebitda, 0), "Sum of all monthly EBITDA"]),
    row(["Cumulative net income (RWF)", num(summary.cum_ni, 0), "Sum of all monthly net income"]),
    row(["NPV of FCF (RWF)", num(summary.npv_fcf, 0), "Free cash flow NPV at hurdle rate"]),
    row(["IRR (annualized)", summary.irr_annualized != null ? `${(summary.irr_annualized * 100).toFixed(2)}%` : "N/A", "Internal rate of return"]),
    row(["Min DSCR", num(summary.min_dscr, 3), "Worst month debt service coverage ratio"]),
    row(["Gross contract / device (RWF)", num(summary.gross_contract, 0), "Revenue per device before defaults"]),
    row(["Contribution / device (RWF)", num(summary.contribution_per_device, 0), "Net after all variable costs"]),
    row(["Breakeven devices/mo", summary.breakeven_devices_mo != null && isFinite(summary.breakeven_devices_mo) ? num(summary.breakeven_devices_mo, 0) : "N/A", "Min monthly sales to cover fixed costs"]),
    row(["First EBITDA+ (month)", milestones?.first_operating_profit_month ?? "N/A", "First month with positive EBITDA"]),
    row(["First net profit (month)", milestones?.first_net_profit_month ?? "N/A", "First month with positive net income"]),
    row(["Cumulative NI positive (month)", milestones?.first_cumulative_net_positive_month ?? "N/A", "When cumulative NI turns positive"]),
    "#",
    "# MONTHLY PROJECTION",
  ];

  if (series?.length) {
    const headers = Object.keys(series[0]);
    lines.push(row(headers));
    for (const r of series) {
      lines.push(
        row(
          headers.map((h) => {
            const v = r[h];
            return v == null ? "" : typeof v === "number" ? num(v) : String(v);
          })
        )
      );
    }
  }

  return lines.join("\n");
}

/**
 * Variance dataset CSV.
 */
export function varianceToCsv(variance, runMeta = {}) {
  const lines = [
    ...buildRunMeta(runMeta),
    "# BUDGET vs ACTUALS vs MODEL VARIANCE",
    "#",
    "# kpi_key legend:",
    "#   units_sold           — devices/birds sold per month",
    "#   collections          — revenue/repayments collected",
    "#   yield_per_active     — revenue per active device/flock",
    "#   portfolio_par_pct    — modeled portfolio at risk %",
    "#",
    "# variance_actual_vs_budget: actual - budget target",
    "# variance_actual_vs_model: actual - model projection",
    "#",
  ];

  if (!variance?.length) {
    lines.push("# No variance data.");
    return lines.join("\n");
  }

  const headers = Object.keys(variance[0]);
  lines.push(row(headers));
  for (const r of variance) {
    lines.push(
      row(
        headers.map((h) => {
          const v = r[h];
          return v == null ? "" : typeof v === "number" ? num(v) : String(v);
        })
      )
    );
  }

  return lines.join("\n");
}

/**
 * Scenario comparison CSV (A vs B).
 */
export function compareToCsv(compareResult, runMeta = {}) {
  const lines = [...buildRunMeta(runMeta), "# SCENARIO A vs B COMPARISON", "#"];

  if (compareResult.assumptionDiffs?.length) {
    lines.push("# ASSUMPTION DIFFERENCES");
    lines.push(row(["Assumption", "Scenario A", "Scenario B", "Delta"]));
    for (const d of compareResult.assumptionDiffs) {
      const a = Number(d.A);
      const b = Number(d.B);
      const delta = Number.isFinite(a) && Number.isFinite(b) ? num(b - a) : "";
      lines.push(row([d.assumption, String(d.A), String(d.B), delta]));
    }
    lines.push("#");
  }

  lines.push("# SUMMARY COMPARISON");
  lines.push(row(["KPI", "Scenario A", "Scenario B", "Delta (B-A)", "Delta %"]));

  const pairs = [
    ["Cumulative EBITDA (RWF)", compareResult.summaryA?.cum_ebitda, compareResult.summaryB?.cum_ebitda],
    ["Cumulative net income (RWF)", compareResult.summaryA?.cum_ni, compareResult.summaryB?.cum_ni],
    ["Peak debt (RWF)", compareResult.summaryA?.peak_debt, compareResult.summaryB?.peak_debt],
    ["Ending cash (RWF)", compareResult.summaryA?.ending_cash, compareResult.summaryB?.ending_cash],
    [
      "IRR (annualized)",
      compareResult.summaryA?.irr_annualized != null ? compareResult.summaryA.irr_annualized * 100 : null,
      compareResult.summaryB?.irr_annualized != null ? compareResult.summaryB.irr_annualized * 100 : null,
    ],
    ["Min DSCR", compareResult.summaryA?.min_dscr, compareResult.summaryB?.min_dscr],
  ];

  for (const [kpi, a, b] of pairs) {
    const delta = a != null && b != null ? num(b - a) : "";
    const deltaPct =
      a != null && b != null && Number.isFinite(a) && a !== 0 ? `${(((b - a) / Math.abs(a)) * 100).toFixed(1)}%` : "";
    lines.push(row([kpi, a != null ? num(a) : "N/A", b != null ? num(b) : "N/A", delta, deltaPct]));
  }

  if (compareResult.seriesA?.length && compareResult.seriesB?.length) {
    lines.push("#");
    lines.push("# MONTHLY — SIDE BY SIDE (month, A fields…, B fields…)");
    const hdrs = Object.keys(compareResult.seriesA[0]);
    lines.push(row(["month", ...hdrs.filter((h) => h !== "month").map((h) => `A_${h}`), ...hdrs.filter((h) => h !== "month").map((h) => `B_${h}`)]));
    for (let i = 0; i < compareResult.seriesA.length; i++) {
      const a = compareResult.seriesA[i];
      const b = compareResult.seriesB[i] ?? {};
      lines.push(
        row([
          a.month,
          ...hdrs.filter((h) => h !== "month").map((h) => (a[h] != null ? num(a[h]) : "")),
          ...hdrs.filter((h) => h !== "month").map((h) => (b[h] != null ? num(b[h]) : "")),
        ])
      );
    }
  }

  return lines.join("\n");
}

/**
 * Sensitivity heatmap data CSV.
 */
export function heatmapsToCsv(heatmaps, runMeta = {}) {
  const lines = [...buildRunMeta(runMeta), "# SENSITIVITY HEATMAPS", "#"];

  for (const [blockName, block] of Object.entries(heatmaps ?? {})) {
    if (!block) continue;
    lines.push(`# BLOCK: ${block.title ?? blockName}`);
    lines.push(row(["", ...block.xLabels]));
    for (let yi = 0; yi < block.z.length; yi++) {
      lines.push(row([block.yLabels[yi], ...block.z[yi].map((v) => num(v))]));
    }
    lines.push("#");
  }

  return lines.join("\n");
}
