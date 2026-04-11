/**
 * Operational budgeting SQLite — user-scoped (mirrors Business Model budgeting_service.py).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "business-model-budget.sqlite");

export const KPI_COLUMN_ORDER = ["units_sold", "collections", "yield_per_active", "portfolio_par_pct"];

let _db;

function getDb() {
  if (!_db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS budget_actuals (
        user_id TEXT NOT NULL,
        month INTEGER NOT NULL,
        kpi_key TEXT NOT NULL,
        value REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        updated_utc TEXT NOT NULL,
        PRIMARY KEY (user_id, month, kpi_key)
      );
      CREATE TABLE IF NOT EXISTS budget_targets (
        user_id TEXT NOT NULL,
        month INTEGER NOT NULL,
        kpi_key TEXT NOT NULL,
        value REAL NOT NULL,
        updated_utc TEXT NOT NULL,
        PRIMARY KEY (user_id, month, kpi_key)
      );
    `);
  }
  return _db;
}

function nowUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function listActualsLong(userId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT month, kpi_key, value, source, updated_utc FROM budget_actuals WHERE user_id = ? ORDER BY kpi_key, month"
    )
    .all(String(userId));
}

export function listTargetsLong(userId) {
  const db = getDb();
  return db
    .prepare("SELECT month, kpi_key, value, updated_utc FROM budget_targets WHERE user_id = ? ORDER BY kpi_key, month")
    .all(String(userId));
}

export function upsertActual(userId, month, kpiKey, value, source = "manual") {
  const db = getDb();
  db.prepare(
    `INSERT INTO budget_actuals (user_id, month, kpi_key, value, source, updated_utc)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, month, kpi_key) DO UPDATE SET
       value = excluded.value,
       source = excluded.source,
       updated_utc = excluded.updated_utc`
  ).run(String(userId), Math.floor(month), String(kpiKey), Number(value), String(source), nowUtc());
}

export function upsertTarget(userId, month, kpiKey, value) {
  const db = getDb();
  db.prepare(
    `INSERT INTO budget_targets (user_id, month, kpi_key, value, updated_utc)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, month, kpi_key) DO UPDATE SET
       value = excluded.value,
       updated_utc = excluded.updated_utc`
  ).run(String(userId), Math.floor(month), String(kpiKey), Number(value), nowUtc());
}

/** @param {{ month: number, kpi_key: string, model: number }[]} modelKpiRows */
export function replaceTargetsFromModelKpis(userId, modelKpiRows) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM budget_targets WHERE user_id = ?").run(String(userId));
    const ins = db.prepare(
      `INSERT INTO budget_targets (user_id, month, kpi_key, value, updated_utc) VALUES (?, ?, ?, ?, ?)`
    );
    for (const r of modelKpiRows) {
      ins.run(String(userId), Math.floor(r.month), String(r.kpi_key), Number(r.model), nowUtc());
    }
  });
  tx();
  return modelKpiRows.length;
}

export function bulkUpsertActuals(userId, rows, source = "import") {
  const db = getDb();
  let n = 0;
  const tx = db.transaction(() => {
    const ins = db.prepare(
      `INSERT INTO budget_actuals (user_id, month, kpi_key, value, source, updated_utc)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, month, kpi_key) DO UPDATE SET
         value = excluded.value,
         source = excluded.source,
         updated_utc = excluded.updated_utc`
    );
    for (const r of rows) {
      if (!KPI_COLUMN_ORDER.includes(r.kpi_key)) continue;
      ins.run(String(userId), Math.floor(r.month), String(r.kpi_key), Number(r.value), source, nowUtc());
      n += 1;
    }
  });
  tx();
  return n;
}
