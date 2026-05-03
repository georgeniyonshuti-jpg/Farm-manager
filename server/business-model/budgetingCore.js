/**
 * Budget vs model vs actual — mirrors Business Model / budgeting_service.py
 * `extract_model_kpis` and `build_variance_frame` (in-memory, no SQLite).
 */

export const KPI_COLUMN_ORDER = ["units_sold", "collections", "yield_per_active", "portfolio_par_pct"];

const KPI_LABELS = {
  units_sold: "Sales volume",
  collections: "Collections",
  yield_per_active: "Yield / active device",
  portfolio_par_pct: "Portfolio PAR %",
};

/** @param {Record<string, number | null>[]} series */
export function extractModelKpis(series, inp) {
  const rows = [];
  const parPct = (Number(inp.def_rate) || 0) * 100.0;
  for (const r of series) {
    const m = Math.floor(Number(r.month));
    const c = Number(r.collections) || 0;
    const ad = Math.max(Number(r.active_devices) || 0, 1.0);
    rows.push({ month: m, kpi_key: "units_sold", model: Number(r.units_sold) || 0 });
    rows.push({ month: m, kpi_key: "collections", model: c });
    rows.push({ month: m, kpi_key: "yield_per_active", model: c / ad });
    rows.push({ month: m, kpi_key: "portfolio_par_pct", model: parPct });
  }
  return rows;
}

function indexLong(rows, valueKey) {
  const map = new Map();
  for (const row of rows) {
    const k = `${row.month}|${row.kpi_key}`;
    map.set(k, Number(row[valueKey]));
  }
  return map;
}

/** @param {Record<string, number | null>[]} dfModel */
export function buildVarianceFrame(dfModel, inp, targetsLong = [], actualsLong = []) {
  const mlong = extractModelKpis(dfModel, inp);
  const budgetMap = indexLong(targetsLong, "value");
  const actualMap = indexLong(actualsLong, "value");

  const out = [];
  for (const row of mlong) {
    const k = `${row.month}|${row.kpi_key}`;
    const budget = budgetMap.has(k) ? budgetMap.get(k) : null;
    const actual = actualMap.has(k) ? actualMap.get(k) : null;
    const variance_actual_vs_budget = actual != null && budget != null ? actual - budget : null;
    const variance_actual_vs_model = actual != null ? actual - row.model : null;
    out.push({
      month: row.month,
      kpi_key: row.kpi_key,
      kpi_label: KPI_LABELS[row.kpi_key] ?? row.kpi_key,
      model: row.model,
      budget,
      actual,
      variance_actual_vs_budget,
      variance_actual_vs_model,
    });
  }
  return out.sort((a, b) => (a.kpi_key === b.kpi_key ? a.month - b.month : a.kpi_key.localeCompare(b.kpi_key)));
}
