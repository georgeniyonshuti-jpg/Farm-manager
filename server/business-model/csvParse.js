/**
 * Parse actuals CSV — mirrors budgeting_service.read_actuals_csv.
 */

import { KPI_COLUMN_ORDER } from "./budgetDb.js";

const VALID = new Set(KPI_COLUMN_ORDER);

/** @returns {{ month: number, kpi_key: string, value: number }[]} */
export function parseActualsCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("CSV is empty");
  const headerLine = lines[0];
  const sep = headerLine.includes("\t") && !headerLine.includes(",") ? "\t" : ",";
  const headers = headerLine.split(sep).map((h) => h.trim());
  const lowerMap = {};
  for (const h of headers) {
    lowerMap[String(h).toLowerCase()] = h;
  }
  function resolve(name) {
    if (headers.includes(name)) return name;
    const k = name.toLowerCase();
    if (lowerMap[k]) return lowerMap[k];
    throw new Error(`CSV must include column: ${name}`);
  }
  for (const req of ["month", "kpi_key", "value"]) {
    resolve(req);
  }
  const mcol = resolve("month");
  const kcol = resolve("kpi_key");
  const vcol = resolve("value");
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cells[j];
    }
    const month = Math.floor(Number(row[mcol]));
    const kpi_key = String(row[kcol] || "").trim();
    const value = Number(row[vcol]);
    if (!Number.isFinite(month) || !Number.isFinite(value)) continue;
    if (!VALID.has(kpi_key)) continue;
    out.push({ month, kpi_key, value });
  }
  return out;
}
