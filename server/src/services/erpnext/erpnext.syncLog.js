import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, "../../../data/erpnext-sync-log.json");
const MAX_ENTRIES = 200;

let _dbQuery = null;

export function initErpnextDb(dbQuery) {
  _dbQuery = dbQuery;
}

function readFileLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const raw = fs.readFileSync(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFileLog(entries) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2));
}

function rowToEntry(row) {
  return {
    id: row.id,
    at: row.created_at || row.at,
    status: row.status,
    eventType: row.event_type || row.eventType,
    entityType: row.entity_type || null,
    sourceTable: row.entity_type || row.sourceTable || null,
    sourceId: row.entity_id || row.sourceId || null,
    erpnextRef: row.erpnext_ref || row.erpnextRef || null,
    erpnextDoctype: row.erpnext_doctype || null,
    error: row.error_message || row.error || null,
    payload: row.payload || null,
  };
}

export async function appendErpnextSyncLog(entry) {
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    status: entry.status || "success",
    eventType: entry.eventType || entry.event_type || "unknown",
    entityType: entry.entityType || entry.entity_type || entry.sourceTable || null,
    sourceTable: entry.sourceTable || entry.entity_type || null,
    sourceId: entry.sourceId || entry.entity_id || null,
    erpnextRef: entry.erpnextRef || entry.erpnext_ref || null,
    erpnextDoctype: entry.erpnextDoctype || entry.erpnext_doctype || null,
    error: entry.error || entry.error_message || null,
    payload: entry.payload || null,
    companyId: entry.companyId || entry.company_id || null,
  };

  if (_dbQuery) {
    try {
      const r = await _dbQuery(
        `INSERT INTO erpnext_sync_log
          (company_id, entity_type, entity_id, event_type, erpnext_doctype, erpnext_ref, status, error_message, payload)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         RETURNING id, created_at`,
        [
          row.companyId,
          row.entityType,
          row.sourceId,
          row.eventType,
          row.erpnextDoctype,
          row.erpnextRef,
          row.status,
          row.error,
          row.payload ? JSON.stringify(row.payload) : null,
        ]
      );
      const dbRow = r.rows[0];
      if (dbRow) {
        return rowToEntry({ ...row, id: dbRow.id, created_at: dbRow.created_at });
      }
    } catch (e) {
      console.error("[erpnext] sync log DB insert failed:", e instanceof Error ? e.message : e);
    }
  }

  const entries = readFileLog();
  entries.unshift(row);
  writeFileLog(entries);
  return row;
}

export async function listErpnextSyncLog(limit = 20, companyId = null) {
  const capped = Math.min(limit, MAX_ENTRIES);
  if (_dbQuery) {
    try {
      const params = [capped];
      let sql = `SELECT id, company_id, entity_type, entity_id, event_type, erpnext_doctype, erpnext_ref,
                        status, error_message, payload, created_at
                 FROM erpnext_sync_log`;
      if (companyId) {
        sql += ` WHERE company_id = $2::uuid`;
        params.push(companyId);
      }
      sql += ` ORDER BY created_at DESC LIMIT $1`;
      const r = await _dbQuery(sql, params);
      return r.rows.map(rowToEntry);
    } catch (e) {
      console.error("[erpnext] sync log DB read failed:", e instanceof Error ? e.message : e);
    }
  }
  return readFileLog().slice(0, capped);
}

export async function listFailedErpnextSyncLog(companyId = null) {
  if (_dbQuery) {
    try {
      const params = [];
      let sql = `SELECT id, company_id, entity_type, entity_id, event_type, erpnext_doctype, erpnext_ref,
                        status, error_message, payload, created_at
                 FROM erpnext_sync_log WHERE status = 'failed'`;
      if (companyId) {
        sql += ` AND company_id = $1::uuid`;
        params.push(companyId);
      }
      sql += ` ORDER BY created_at DESC LIMIT 100`;
      const r = await _dbQuery(sql, params);
      return r.rows.map(rowToEntry);
    } catch (e) {
      console.error("[erpnext] failed sync log read:", e instanceof Error ? e.message : e);
    }
  }
  return readFileLog().filter((e) => e.status === "failed");
}

export async function getErpnextSyncStats(companyId = null) {
  const stats = {
    failedLast24h: 0,
    pendingCount: 0,
    lastSuccessAt: null,
  };
  if (!_dbQuery) return stats;

  try {
    const params = companyId ? [companyId] : [];
    const companyFilter = companyId ? " AND company_id = $1::uuid" : "";
    const failed = await _dbQuery(
      `SELECT COUNT(*)::int AS c FROM erpnext_sync_log
       WHERE status = 'failed' AND created_at > now() - interval '24 hours'${companyFilter}`,
      params
    );
    stats.failedLast24h = failed.rows[0]?.c ?? 0;

    const lastOk = await _dbQuery(
      `SELECT created_at FROM erpnext_sync_log
       WHERE status = 'success'${companyFilter}
       ORDER BY created_at DESC LIMIT 1`,
      params
    );
    stats.lastSuccessAt = lastOk.rows[0]?.created_at ?? null;

    const pendingTables = [
      "flock_feed_entries",
      "flock_mortality_events",
      "flock_slaughter_events",
      "flock_treatments",
    ];
    for (const table of pendingTables) {
      const q = await _dbQuery(
        `SELECT COUNT(*)::int AS c FROM ${table} WHERE erpnext_sync_status = 'pending'`
      );
      stats.pendingCount += q.rows[0]?.c ?? 0;
    }
  } catch (e) {
    console.error("[erpnext] sync stats failed:", e instanceof Error ? e.message : e);
  }
  return stats;
}

export async function getClevaFarmInboundStats() {
  const stats = {
    inbound_failed_24h: 0,
    last_inbound_errors: [],
  };
  if (!_dbQuery) return stats;

  try {
    const failed = await _dbQuery(
      `SELECT COUNT(*)::int AS c FROM erpnext_sync_log
       WHERE status = 'failed'
         AND event_type = 'webhook_entity'
         AND created_at > now() - interval '24 hours'`
    );
    stats.inbound_failed_24h = failed.rows[0]?.c ?? 0;

    const recent = await _dbQuery(
      `SELECT entity_type, entity_id, error_message, created_at
         FROM erpnext_sync_log
        WHERE status = 'failed' AND event_type = 'webhook_entity'
        ORDER BY created_at DESC
        LIMIT 5`
    );
    stats.last_inbound_errors = recent.rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      error: r.error_message,
      at: r.created_at,
    }));
  } catch (e) {
    console.error("[erpnext] inbound stats failed:", e instanceof Error ? e.message : e);
  }
  return stats;
}

export async function updateEntitySyncStatus({ table, entityId, erpnextRef, status, pendingRef }) {
  if (!_dbQuery || !table || !entityId) return;
  const allowed = new Set([
    "flock_feed_entries",
    "flock_mortality_events",
    "flock_slaughter_events",
    "flock_treatments",
  ]);
  if (!allowed.has(table)) return;

  await _dbQuery(
    `UPDATE ${table}
     SET erpnext_ref = COALESCE($2, erpnext_ref),
         erpnext_pending_ref = COALESCE($3, erpnext_pending_ref),
         erpnext_sync_status = $4,
         erpnext_synced_at = CASE WHEN $4 = 'confirmed' OR $4 = 'success' THEN now() ELSE erpnext_synced_at END
     WHERE id::text = $1 OR id = $1`,
    [String(entityId), erpnextRef, pendingRef, status]
  );
}
