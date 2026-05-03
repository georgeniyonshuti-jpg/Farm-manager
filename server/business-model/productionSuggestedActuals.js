/**
 * Optional feed of portfolio “actuals” for budget reconciliation.
 * Reads CLEVA_ACTUALS_JSON (path to JSON file) or CLEVA_ACTUALS_JSON_INLINE if set; otherwise returns guidance only.
 */

import fs from "node:fs";

/** @returns {{ source: string, rows: { month: number, kpi_key: string, value: number }[], hint: string }} */
export function loadSuggestedActuals() {
  const hint =
    "Connect Cleva portfolio systems by setting CLEVA_ACTUALS_JSON to a JSON file of { month, kpi_key, value }[], " +
    "or import CSV / enter actuals under Budget. Portfolio UI in Farm Manager remains a stub until APIs are wired.";
  const inline = process.env.CLEVA_ACTUALS_JSON_INLINE;
  if (inline) {
    try {
      const rows = JSON.parse(inline);
      if (Array.isArray(rows)) {
        return { source: "CLEVA_ACTUALS_JSON_INLINE", rows: rows.filter(Boolean), hint };
      }
    } catch {
      /* fall through */
    }
  }
  const p = process.env.CLEVA_ACTUALS_JSON;
  if (p && fs.existsSync(p)) {
    try {
      const rows = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(rows)) {
        return { source: `file:${p}`, rows: rows.filter(Boolean), hint };
      }
    } catch {
      /* fall through */
    }
  }
  return { source: "none", rows: [], hint };
}
