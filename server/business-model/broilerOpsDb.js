/**
 * Broiler operational logs — user-scoped SQLite (mirrors broiler_ops.py).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "broiler-operations.sqlite");

let _db;

function getDb() {
  if (!_db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS broiler_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        check_date TEXT NOT NULL,
        feed_ok INTEGER NOT NULL DEFAULT 1,
        water_ok INTEGER NOT NULL DEFAULT 1,
        photo_ok INTEGER NOT NULL DEFAULT 0,
        notes TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS broiler_mortality_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        event_date TEXT NOT NULL,
        birds_lost INTEGER NOT NULL DEFAULT 0,
        notes TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS broiler_vet_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        report_date TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Good'
      );
      CREATE TABLE IF NOT EXISTS broiler_cycle_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        label TEXT NOT NULL,
        inputs_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_checkins_user_cycle ON broiler_checkins(user_id, cycle_id);
      CREATE INDEX IF NOT EXISTS idx_mort_user_cycle ON broiler_mortality_events(user_id, cycle_id);
      CREATE INDEX IF NOT EXISTS idx_vet_user_cycle ON broiler_vet_reports(user_id, cycle_id);
    `);
  }
  return _db;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addCheckin(userId, cycleId, { feedOk = true, waterOk = true, photoOk = false, notes = "", onDate = null }) {
  const db = getDb();
  const d = onDate || todayIso();
  const r = db
    .prepare(
      `INSERT INTO broiler_checkins (user_id, cycle_id, check_date, feed_ok, water_ok, photo_ok, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(String(userId), String(cycleId), d, feedOk ? 1 : 0, waterOk ? 1 : 0, photoOk ? 1 : 0, String(notes).slice(0, 2000));
  return r.lastInsertRowid;
}

export function addMortalityEvent(userId, cycleId, birdsLost, notes = "", onDate = null) {
  const db = getDb();
  const d = onDate || todayIso();
  const r = db
    .prepare(
      `INSERT INTO broiler_mortality_events (user_id, cycle_id, event_date, birds_lost, notes)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(String(userId), String(cycleId), d, Math.floor(Number(birdsLost)) || 0, String(notes).slice(0, 2000));
  return r.lastInsertRowid;
}

export function addVetReport(userId, cycleId, summary, status = "Moderate", onDate = null) {
  const db = getDb();
  const d = onDate || todayIso();
  const st = ["Good", "Moderate", "Risk"].includes(status) ? status : "Moderate";
  const r = db
    .prepare(
      `INSERT INTO broiler_vet_reports (user_id, cycle_id, report_date, summary, status)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(String(userId), String(cycleId), d, String(summary).slice(0, 4000), st);
  return r.lastInsertRowid;
}

export function listCheckins(userId, cycleId) {
  return getDb()
    .prepare(
      "SELECT * FROM broiler_checkins WHERE user_id = ? AND cycle_id = ? ORDER BY check_date DESC LIMIT 200"
    )
    .all(String(userId), String(cycleId));
}

export function listMortality(userId, cycleId) {
  return getDb()
    .prepare(
      "SELECT * FROM broiler_mortality_events WHERE user_id = ? AND cycle_id = ? ORDER BY event_date DESC LIMIT 200"
    )
    .all(String(userId), String(cycleId));
}

export function listVetReports(userId, cycleId) {
  return getDb()
    .prepare(
      "SELECT * FROM broiler_vet_reports WHERE user_id = ? AND cycle_id = ? ORDER BY report_date DESC LIMIT 200"
    )
    .all(String(userId), String(cycleId));
}

export function complianceScore(userId, cycleId, cycleDays, windowDays = 7) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const rows = listCheckins(userId, cycleId);
  if (!rows.length) {
    return { score: 0, expected: Math.min(windowDays, Math.max(1, cycleDays)), done: 0 };
  }
  const have = new Set();
  for (const r of rows) {
    const dt = new Date(r.check_date + "T12:00:00Z");
    if (dt >= start && dt <= end) {
      have.add(r.check_date.slice(0, 10));
    }
  }
  const expected = Math.min(windowDays, Math.max(1, cycleDays));
  const done = have.size;
  const score = Math.min(100, (100 * done) / expected);
  return { score, expected, done };
}

export function healthStatusFromVet(userId, cycleId) {
  const rows = listVetReports(userId, cycleId);
  if (!rows.length) return "Good";
  const st = String(rows[0].status);
  return ["Good", "Moderate", "Risk"].includes(st) ? st : "Moderate";
}

export function saveCycleSnapshot(userId, label, inputsJson) {
  const db = getDb();
  const r = db
    .prepare(
      "INSERT INTO broiler_cycle_snapshots (user_id, saved_at, label, inputs_json) VALUES (?, ?, ?, ?)"
    )
    .run(String(userId), new Date().toISOString(), String(label).slice(0, 200), String(inputsJson));
  return r.lastInsertRowid;
}

export function listSnapshots(userId, limit = 24) {
  return getDb()
    .prepare(
      "SELECT id, saved_at, label, inputs_json FROM broiler_cycle_snapshots WHERE user_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(String(userId), Math.min(200, Math.floor(limit)));
}

export function seedDemoDataIfEmpty(userId, cycleId) {
  const db = getDb();
  const n = db
    .prepare("SELECT COUNT(*) AS c FROM broiler_checkins WHERE user_id = ? AND cycle_id = ?")
    .get(String(userId), String(cycleId));
  if (n.c > 0) return false;
  const today = new Date();
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    addCheckin(userId, cycleId, {
      feedOk: true,
      waterOk: true,
      photoOk: i % 2 === 0,
      notes: "Demo check-in",
      onDate: iso,
    });
  }
  const v = new Date(today);
  v.setUTCDate(v.getUTCDate() - 2);
  addVetReport(userId, cycleId, "Routine flock inspection; no acute disease signs.", "Good", v.toISOString().slice(0, 10));
  return true;
}
