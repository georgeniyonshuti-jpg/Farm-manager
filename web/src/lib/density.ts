const KEY = "cleva-farm-density";
const LEGACY_TABLE_KEY = "cleva-farm-table-density";

export type AppDensity = "comfortable" | "compact";

export function readDensity(): AppDensity {
  try {
    const next = localStorage.getItem(KEY);
    if (next === "compact" || next === "comfortable") return next;
    // Migrate legacy table-only density preference.
    return localStorage.getItem(LEGACY_TABLE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function writeDensity(d: AppDensity): void {
  try {
    localStorage.setItem(KEY, d);
    // Keep legacy key in sync so older table listeners still work during migration.
    localStorage.setItem(LEGACY_TABLE_KEY, d);
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.density = d;
  document.documentElement.dataset.tableDensity = d;
  window.dispatchEvent(new Event("cleva-density"));
  window.dispatchEvent(new Event("cleva-table-density"));
}

/** @deprecated Prefer readDensity / writeDensity. Kept for DataTable callers during migration. */
export type TableDensity = AppDensity;
export const readTableDensity = readDensity;
export const writeTableDensity = writeDensity;
