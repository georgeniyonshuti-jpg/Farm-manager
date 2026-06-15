/**
 * ClevaFarm sync diagnostics — all 23 registry entity types.
 *
 * Usage (from server/):
 *   npm run diagnose:clevafarm
 *   npm run diagnose:clevafarm -- --env-file=/path/to/clevafarm-render.env
 *   npm run diagnose:clevafarm -- --json
 *
 * Env:
 *   DATABASE_URL              Postgres counts + outbox breakdown
 *   CLEVAFARM_API_SECRET        Reconciliation API probe per entity type
 *   FARM_API_BASE_URL         default https://farmapi.clevacredit.com
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ENTITY_DEPENDENCY_ORDER, ENTITY_DEFS } from "../src/services/clevafarm/entityRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadDotEnvIfPresent() {
  loadEnvFile(path.resolve(__dirname, "../.env"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let envFile = null;
  let json = false;
  for (const a of args) {
    if (a === "--json") json = true;
    else if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
  }
  return { envFile, json };
}

function secretHeaders() {
  return {
    "Content-Type": "application/json",
    "X-ClevaFarm-Secret": process.env.CLEVAFARM_API_SECRET || "",
  };
}

async function pgTableCount(pool, table) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
    return r.rows[0]?.c ?? 0;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function outboxByEntity(pool) {
  try {
    const r = await pool.query(
      `SELECT entity_type,
              COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'processing')::int AS processing,
              COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed')::int AS failed,
              COUNT(*) FILTER (WHERE direction = 'inbound_logged')::int AS inbound_logged
         FROM clevafarm_sync_outbox
        GROUP BY entity_type`
    );
    const map = new Map();
    for (const row of r.rows) map.set(row.entity_type, row);
    return map;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function recentOutboxFailures(pool, limit = 15) {
  try {
    const r = await pool.query(
      `SELECT entity_type, entity_id, status, attempts, last_error, updated_at
         FROM clevafarm_sync_outbox
        WHERE direction = 'outbound' AND status = 'failed'
        ORDER BY updated_at DESC
        LIMIT $1`,
      [limit]
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function migrationMapDiagnostics(pool) {
  try {
    const counts = await pool.query(
      `SELECT erpnext_doctype, COUNT(*)::int AS c
         FROM farm_migration_map
        GROUP BY erpnext_doctype
        ORDER BY erpnext_doctype`
    );
    const missing = await pool.query(
      `SELECT o.entity_type, COUNT(*)::int AS c
         FROM clevafarm_sync_outbox o
        WHERE o.direction = 'outbound'
          AND o.status = 'sent'
          AND o.erpnext_ref IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM farm_migration_map m WHERE m.legacy_id = o.entity_id
          )
        GROUP BY o.entity_type
        ORDER BY o.entity_type`
    );
    return { counts: counts.rows, missingByType: missing.rows };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), counts: [], missingByType: [] };
  }
}

async function recentSyncLogFailures(pool, limit = 10) {
  try {
    const r = await pool.query(
      `SELECT entity_type, entity_id, event_type, status, error_message, created_at
         FROM erpnext_sync_log
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function probeReconciliation(farmBase, entityType) {
  const url = `${farmBase.replace(/\/+$/, "")}/api/entities/${entityType}?updatedSince=2020-01-01T00:00:00Z`;
  try {
    const res = await fetch(url, { headers: secretHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, http: res.status, error: body.error || res.statusText, count: null };
    }
    const count = Array.isArray(body.records) ? body.records.length : null;
    return { ok: true, http: res.status, count };
  } catch (e) {
    return { ok: false, http: 0, error: e instanceof Error ? e.message : String(e), count: null };
  }
}

function statusIcon(row) {
  if (row.pgCount === 0 && row.reconcileCount === 0) return "—";
  if (row.reconcileError) return "ERR";
  if (row.pgCount > 0 && row.sent === 0 && row.pending === 0 && row.failed === 0) return "GAP";
  if (row.failed > 0) return "FAIL";
  if (row.pending > 0 || row.processing > 0) return "WAIT";
  if (row.sent > 0 && row.reconcileOk) return "OK";
  if (row.sent > 0) return "SENT";
  return "?";
}

function pad(s, n) {
  const t = String(s ?? "");
  return t.length >= n ? t.slice(0, n) : t + " ".repeat(n - t.length);
}

async function main() {
  const { envFile, json } = parseArgs();
  loadDotEnvIfPresent();
  if (envFile) loadEnvFile(envFile);

  const farmBase = process.env.FARM_API_BASE_URL || "https://farmapi.clevacredit.com";
  const hasSecret = Boolean(process.env.CLEVAFARM_API_SECRET);
  const hasDb = Boolean(process.env.DATABASE_URL);

  let pool = null;
  let outboxMap = new Map();
  if (hasDb) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_URL.includes("render.com") || process.env.DATABASE_URL.includes("sslmode=require")
          ? { rejectUnauthorized: false }
          : undefined,
    });
    const ob = await outboxByEntity(pool);
    if (ob.error) {
      console.error("Outbox query failed:", ob.error);
    } else {
      outboxMap = ob;
    }
  }

  const rows = [];
  for (const entityType of ENTITY_DEPENDENCY_ORDER) {
    const def = ENTITY_DEFS[entityType];
    let pgCount = null;
    if (pool) {
      const c = await pgTableCount(pool, def.table);
      pgCount = typeof c === "number" ? c : null;
    }
    const ob = outboxMap.get(entityType) || {
      sent: 0,
      pending: 0,
      processing: 0,
      failed: 0,
      inbound_logged: 0,
    };
    let reconcile = { ok: false, count: null };
    if (hasSecret) {
      reconcile = await probeReconciliation(farmBase, entityType);
    }
    rows.push({
      entityType,
      table: def.table,
      pgCount,
      pgError: pgCount === null && pool ? "query failed" : null,
      sent: ob.sent ?? 0,
      pending: ob.pending ?? 0,
      processing: ob.processing ?? 0,
      failed: ob.failed ?? 0,
      inbound_logged: ob.inbound_logged ?? 0,
      reconcileOk: reconcile.ok,
      reconcileCount: reconcile.count,
      reconcileError: reconcile.error || (reconcile.http && !reconcile.ok ? `HTTP ${reconcile.http}` : null),
    });
  }

  for (const r of rows) {
    r.status = statusIcon({
      pgCount: r.pgCount ?? 0,
      sent: r.sent,
      pending: r.pending,
      failed: r.failed,
      reconcileOk: r.reconcileOk,
      reconcileCount: r.reconcileCount ?? 0,
      reconcileError: r.reconcileError,
    });
  }

  const failures = pool ? await recentOutboxFailures(pool) : [];
  const logFails = pool ? await recentSyncLogFailures(pool) : [];
  const migrationMap = pool ? await migrationMapDiagnostics(pool) : null;

  if (pool) await pool.end();

  if (json) {
    console.log(JSON.stringify({ farmBase, hasSecret, hasDb, rows, failures, logFails, migrationMap }, null, 2));
    return;
  }

  console.log("ClevaFarm sync diagnostics");
  console.log(`Farm API: ${farmBase}`);
  console.log(`Secret configured: ${hasSecret ? "yes" : "no — reconciliation columns skipped"}`);
  console.log(`DATABASE_URL: ${hasDb ? "yes" : "no — PG/outbox columns skipped"}`);
  console.log("");
  console.log(
    pad("Status", 6) +
      pad("Entity type", 28) +
      pad("PG rows", 10) +
      pad("Sent", 8) +
      pad("Pending", 10) +
      pad("Failed", 8) +
      pad("Recon", 8) +
      "Table"
  );
  console.log("-".repeat(100));

  for (const r of rows) {
    console.log(
      pad(r.status, 6) +
        pad(r.entityType, 28) +
        pad(r.pgCount ?? "—", 10) +
        pad(r.sent, 8) +
        pad(r.pending, 10) +
        pad(r.failed, 8) +
        pad(r.reconcileCount ?? (r.reconcileError ? "!" : "—"), 8) +
        r.table
    );
  }

  console.log("\nLegend: OK= sent+reconciliation | SENT= outbox sent | WAIT= pending | FAIL= outbox failed | GAP= data in PG but never enqueued | —= empty | ERR= API error");

  const gaps = rows.filter((r) => r.status === "GAP" && (r.pgCount ?? 0) > 0);
  const fails = rows.filter((r) => r.status === "FAIL" || r.failed > 0);
  const waits = rows.filter((r) => r.pending > 0 || r.processing > 0);

  if (gaps.length) {
    console.log("\n⚠️  GAP — rows in Postgres but no outbound outbox activity (run backfill):");
    for (const g of gaps) console.log(`   ${g.entityType} (${g.pgCount} rows)`);
  }
  if (waits.length) {
    console.log("\n⏳ WAIT — still in outbox queue (worker runs every ~45s):");
    for (const w of waits) console.log(`   ${w.entityType}: pending=${w.pending} processing=${w.processing}`);
  }
  if (fails.length) {
    console.log("\n❌ FAIL — check last_error:");
    for (const f of fails) console.log(`   ${f.entityType}: failed=${f.failed}`);
  }

  if (failures.length) {
    console.log("\nRecent outbox failures:");
    for (const f of failures) {
      console.log(`   ${f.entity_type} ${f.entity_id} attempts=${f.attempts} ${(f.last_error || "").slice(0, 120)}`);
    }
  }
  if (logFails.length) {
    console.log("\nRecent erpnext_sync_log failures:");
    for (const f of logFails) {
      console.log(`   ${f.entity_type || f.event_type} ${f.entity_id || ""} ${(f.error_message || "").slice(0, 100)}`);
    }
  }

  if (migrationMap && !migrationMap.error) {
    console.log("\nfarm_migration_map by DocType:");
    for (const row of migrationMap.counts) {
      console.log(`   ${row.erpnext_doctype}: ${row.c}`);
    }
    if (migrationMap.missingByType.length) {
      console.log("\n⚠️  Sent outbox rows missing migration map entry (run backfill-migration-map):");
      for (const m of migrationMap.missingByType) {
        console.log(`   ${m.entity_type}: ${m.c}`);
      }
    }
  } else if (migrationMap?.error) {
    console.log(`\nfarm_migration_map: query failed (${migrationMap.error})`);
  }

  if (!hasSecret) {
    console.log("\nTip: run with secret loaded:");
    console.log("  npm run diagnose:clevafarm -- --env-file=~/gitops/clevafarm-render.env");
  }
  if (gaps.length && hasDb) {
    console.log("\nBackfill gaps:");
    console.log("  DATABASE_URL=... node ../scripts/backfill-clevafarm-sync.js --since=2020-01-01T00:00:00Z");
    console.log("  npm run backfill:migration-map -- --env-file=/path/to/Farm-manager.env");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
