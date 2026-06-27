import { appendErpnextSyncLog } from "../erpnext/erpnext.syncLog.js";
import { getErpnextConfig } from "../erpnext/erpnext.config.js";
import { pushEntityToErpnext } from "./outboundClient.js";
import { getErpnextDoctypeForEntity, upsertMigrationMapEntry } from "./migrationMap.js";

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 30_000;

let _dbQuery = null;
let _hasDb = null;

export function initClevaFarmSyncWorker(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("ClevaFarm sync: dbQuery not initialized");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

export async function enqueueClevaFarmSync({
  entityType,
  entityId,
  payload,
  direction = "outbound",
  event = "on_update",
  companyId = null,
}) {
  if (!hasDb()) return;
  const id = String(entityId);
  const stored = { ...payload };
  if (event && event !== "on_update") {
    stored.__syncEvent = event;
  }
  const companyIdParam = companyId ? String(companyId) : null;
  try {
    if (direction === "inbound_logged") {
      await dbQuery(
        `INSERT INTO clevafarm_sync_outbox
           (entity_type, entity_id, payload, direction, status, next_retry_at, company_id)
         VALUES ($1, $2, $3::jsonb, 'inbound_logged', 'sent', now(), $4::uuid)
         ON CONFLICT (entity_type, entity_id) DO NOTHING`,
        [entityType, id, JSON.stringify(stored), companyIdParam]
      );
      return;
    }
    await dbQuery(
      `INSERT INTO clevafarm_sync_outbox
         (entity_type, entity_id, payload, direction, status, next_retry_at, company_id)
       VALUES ($1, $2, $3::jsonb, 'outbound', 'pending', now(), $4::uuid)
       ON CONFLICT (entity_type, entity_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             company_id = COALESCE(EXCLUDED.company_id, clevafarm_sync_outbox.company_id),
             status = CASE
               WHEN clevafarm_sync_outbox.direction = 'outbound' AND clevafarm_sync_outbox.status = 'sent' THEN 'pending'
               WHEN clevafarm_sync_outbox.direction = 'outbound' THEN clevafarm_sync_outbox.status
               ELSE 'pending'
             END,
             next_retry_at = now(),
             updated_at = now()
       WHERE clevafarm_sync_outbox.direction = 'outbound'`,
      [entityType, id, JSON.stringify(stored), companyIdParam]
    );
  } catch (err) {
    console.error(
      "[clevafarm-sync]",
      `enqueue failed entityType=${entityType} id=${id}:`,
      err instanceof Error ? err.message : err
    );
  }
}

export async function getClevaFarmOutboxStats() {
  if (!hasDb()) {
    return { pending: 0, failed: 0, heldNoLink: 0, lastOutboundSuccessAt: null };
  }
  try {
    const pending = await dbQuery(
      `SELECT COUNT(*)::int AS c FROM clevafarm_sync_outbox WHERE status IN ('pending','processing') AND direction = 'outbound'`
    );
    const failed = await dbQuery(
      `SELECT COUNT(*)::int AS c FROM clevafarm_sync_outbox WHERE status = 'failed' AND direction = 'outbound'`
    );
    const heldNoLink = await dbQuery(
      `SELECT COUNT(*)::int AS c FROM clevafarm_sync_outbox
        WHERE direction = 'outbound'
          AND status IN ('pending', 'failed')
          AND company_id IS NOT NULL
          AND last_error = 'No ERPNext company linked'`
    );
    const lastOk = await dbQuery(
      `SELECT updated_at FROM clevafarm_sync_outbox WHERE status = 'sent' AND direction = 'outbound' ORDER BY updated_at DESC LIMIT 1`
    );
    return {
      pending: pending.rows[0]?.c ?? 0,
      failed: failed.rows[0]?.c ?? 0,
      heldNoLink: heldNoLink.rows[0]?.c ?? 0,
      lastOutboundSuccessAt: lastOk.rows[0]?.updated_at ?? null,
    };
  } catch {
    return { pending: 0, failed: 0, heldNoLink: 0, lastOutboundSuccessAt: null };
  }
}

export async function processClevaFarmOutbox(limit = 25) {
  if (!hasDb()) return { processed: 0, succeeded: 0, failed: 0 };

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    await dbQuery(
      `UPDATE clevafarm_sync_outbox
          SET status = 'pending', next_retry_at = now(), updated_at = now()
        WHERE status = 'processing'
          AND direction = 'outbound'
          AND (last_attempted_at IS NULL OR last_attempted_at < now() - interval '15 minutes')`
    );
  } catch (e) {
    console.error("[clevafarm-sync] stale processing reset:", e instanceof Error ? e.message : e);
  }

  let rows;
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, entity_type AS "entityType", entity_id AS "entityId", payload, attempts,
              company_id::text AS "companyId"
         FROM clevafarm_sync_outbox
        WHERE direction = 'outbound'
          AND status IN ('pending', 'failed')
          AND next_retry_at <= now()
          AND attempts < $1
        ORDER BY next_retry_at ASC
        LIMIT $2`,
      [MAX_ATTEMPTS, limit]
    );
    rows = r.rows;
  } catch (err) {
    console.error("[clevafarm-sync] fetch outbox:", err instanceof Error ? err.message : err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  for (const row of rows) {
    processed += 1;
    const { entityType, entityId, companyId } = row;
    const rawPayload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const syncEvent = typeof rawPayload.__syncEvent === "string" ? rawPayload.__syncEvent : "on_update";
    const { __syncEvent: _ignored, ...payload } = rawPayload;

    let erpnextCompany = null;
    if (companyId) {
      try {
        const cfg = await getErpnextConfig(companyId);
        erpnextCompany = cfg?.erpnextCompany || null;
      } catch (cfgErr) {
        console.error(
          "[clevafarm-sync]",
          `erpnext_config lookup failed companyId=${companyId}:`,
          cfgErr instanceof Error ? cfgErr.message : cfgErr
        );
      }
      if (!erpnextCompany) {
        const holdMsg = "No ERPNext company linked";
        try {
          await dbQuery(
            `UPDATE clevafarm_sync_outbox
                SET status = 'pending',
                    last_error = $2,
                    next_retry_at = now() + interval '15 minutes',
                    updated_at = now()
              WHERE id = $1::uuid`,
            [row.id, holdMsg]
          );
        } catch (e) {
          console.error("[clevafarm-sync] hold no-link:", e instanceof Error ? e.message : e);
        }
        console.warn(
          "[clevafarm-sync]",
          `held entityType=${entityType} id=${entityId} companyId=${companyId} reason=${holdMsg}`
        );
        continue;
      }
    }

    try {
      await dbQuery(
        `UPDATE clevafarm_sync_outbox
            SET status = 'processing', last_attempted_at = now(), attempts = attempts + 1, updated_at = now()
          WHERE id = $1::uuid`,
        [row.id]
      );
    } catch (e) {
      console.error("[clevafarm-sync] mark processing:", e instanceof Error ? e.message : e);
      continue;
    }

    try {
      const correlationId = row.id;
      const result = await pushEntityToErpnext(entityType, payload, {
        correlationId,
        outboxId: row.id,
        entityType,
        entityId,
        event: syncEvent,
        erpnextCompany,
      });
      const erpnextDoctype = getErpnextDoctypeForEntity(entityType, result.doctype);
      await dbQuery(
        `UPDATE clevafarm_sync_outbox
            SET status = 'sent', last_error = NULL, erpnext_ref = $2, erpnext_doctype = $3, updated_at = now()
          WHERE id = $1::uuid`,
        [row.id, result.name, erpnextDoctype]
      );
      if (result.name && erpnextDoctype) {
        try {
          await upsertMigrationMapEntry({
            legacyId: entityId,
            erpnextDoctype,
            erpnextName: result.name,
            dbQuery,
          });
          console.log(
            "[clevafarm-sync]",
            `migration_map entityType=${entityType} legacyId=${entityId} erpnextName=${result.name}`
          );
        } catch (mapErr) {
          console.error(
            "[clevafarm-sync]",
            `migration_map failed entityType=${entityType} id=${entityId}:`,
            mapErr instanceof Error ? mapErr.message : mapErr
          );
        }
      }
      await appendErpnextSyncLog({
        eventType: "outbound_entity",
        entityType,
        sourceId: entityId,
        erpnextRef: result.name,
        erpnextDoctype,
        status: "success",
        payload: { ...payload, _meta: { correlationId, outboxId: row.id } },
      });
      console.log(
        "[clevafarm-sync]",
        `direction=outbound entityType=${entityType} id=${entityId} correlationId=${correlationId} erpnextRef=${result.name || ""} status=success`
      );
      succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fatal = err?.fatal === true || err?.status === 403;
      const nextAttempt = (row.attempts ?? 0) + 1;
      const backoffMs = BACKOFF_BASE_MS * 2 ** Math.min(nextAttempt - 1, 6);

      if (fatal) {
        await dbQuery(
          `UPDATE clevafarm_sync_outbox
              SET status = 'failed', last_error = $2, updated_at = now()
            WHERE id = $1::uuid`,
          [row.id, msg.slice(0, 2000)]
        );
      } else {
        await dbQuery(
          `UPDATE clevafarm_sync_outbox
              SET status = CASE WHEN $2 >= $3 THEN 'failed' ELSE 'pending' END,
                  last_error = $4,
                  next_retry_at = now() + ($5 || ' milliseconds')::interval,
                  updated_at = now()
            WHERE id = $1::uuid`,
          [row.id, nextAttempt, MAX_ATTEMPTS, msg.slice(0, 2000), String(backoffMs)]
        );
      }
      await appendErpnextSyncLog({
        eventType: "outbound_entity",
        entityType,
        sourceId: entityId,
        status: "failed",
        error: msg,
        payload,
      });
      console.error(
        "[clevafarm-sync]",
        `direction=outbound entityType=${entityType} id=${entityId} status=failed error=${msg}`
      );
      failed += 1;
    }
  }

  return { processed, succeeded, failed };
}
