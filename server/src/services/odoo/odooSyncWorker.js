/**
 * Odoo Sync Worker.
 *
 * Reads pending rows from odoo_sync_outbox, dispatches them to Odoo as drafts,
 * and marks them sent or failed with retry backoff.
 *
 * Designed to be called:
 *  - from approval handlers (immediate trigger)
 *  - or by a periodic setInterval as a background job
 *
 * Idempotency: each outbox row carries the Odoo externalRef in the payload.
 * Duplicate pushes are safe because Odoo deduplicates by ref field.
 */

import { dispatchFarmAccountingEvent } from "./odooAccounting.js";
import { logOdooCall, mapOdooError } from "./odooHelpers.js";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30 s, doubles each attempt

let _dbQuery = null;
let _hasDb = null;

export function initOdooSyncWorker(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("OdooSyncWorker: dbQuery not initialized. Call initOdooSyncWorker first.");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

/**
 * Enqueue an accounting event for Odoo sync.
 * Called from approval hooks immediately after DB state change.
 * Safe to call multiple times — unique constraint on (source_table, source_id) prevents duplicates.
 *
 * @param {{ sourceTable: string, sourceId: string, eventType: string, payload: object, triggeredByUserId: string, triggeredByRole: string }} opts
 */
export async function enqueueOdooSync({ sourceTable, sourceId, eventType, payload, triggeredByUserId, triggeredByRole }) {
  if (!hasDb()) return;
  try {
    await dbQuery(
      `INSERT INTO odoo_sync_outbox
         (source_table, source_id, event_type, payload, status, next_retry_at, triggered_by_user_id, triggered_by_role)
       VALUES ($1, $2, $3, $4::jsonb, 'pending', now(), $5, $6)
       ON CONFLICT (source_table, source_id) DO NOTHING`,
      [sourceTable, sourceId, eventType, JSON.stringify(payload), triggeredByUserId ?? null, triggeredByRole ?? null]
    );
    logOdooCall(`enqueue(${eventType}:${sourceId})`, "queued", true);
  } catch (err) {
    logOdooCall(`enqueue(${eventType}:${sourceId})`, mapOdooError(err), false);
  }
}

/**
 * Process up to `limit` pending outbox rows now.
 * Returns { processed, succeeded, failed }.
 */
export async function processOdooSyncOutbox(limit = 20) {
  if (!hasDb()) return { processed: 0, succeeded: 0, failed: 0 };

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  let rows;
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, source_table AS "sourceTable", source_id AS "sourceId",
              event_type AS "eventType", payload, attempts
         FROM odoo_sync_outbox
        WHERE status IN ('pending','failed')
          AND next_retry_at <= now()
          AND attempts < $1
        ORDER BY next_retry_at ASC
        LIMIT $2`,
      [MAX_ATTEMPTS, limit]
    );
    rows = r.rows;
  } catch (err) {
    console.error("[ERROR]", "[odoo-worker] fetch outbox:", err instanceof Error ? err.message : err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  for (const row of rows) {
    processed += 1;
    const action = `${row.eventType}:${row.sourceId}`;

    // Mark as processing
    try {
      await dbQuery(
        `UPDATE odoo_sync_outbox
            SET status = 'processing', last_attempted_at = now(), attempts = attempts + 1, updated_at = now()
          WHERE id = $1::uuid`,
        [row.id]
      );
    } catch (e) {
      console.error("[ERROR]", "[odoo-worker] mark processing:", e instanceof Error ? e.message : e);
      continue;
    }

    try {
      const result = await dispatchFarmAccountingEvent(row.eventType, row.payload ?? {}, { draft: true });
      // Success
      await dbQuery(
        `UPDATE odoo_sync_outbox
            SET status = 'sent',
                odoo_move_id = $2,
                odoo_move_name = $3,
                odoo_move_state = $4,
                last_error = NULL,
                updated_at = now()
          WHERE id = $1::uuid`,
        [row.id, result.odooMoveId ?? null, result.odooMoveName ?? null, result.state ?? null]
      );
      // Store link back
      await dbQuery(
        `INSERT INTO odoo_sync_links
           (source_table, source_id, odoo_move_id, odoo_move_name, odoo_move_type, odoo_move_state)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (source_table, source_id) DO UPDATE
           SET odoo_move_id = EXCLUDED.odoo_move_id,
               odoo_move_name = EXCLUDED.odoo_move_name,
               odoo_move_state = EXCLUDED.odoo_move_state,
               synced_at = now()`,
        [row.sourceTable, row.sourceId, result.odooMoveId ?? 0, result.odooMoveName ?? null, row.eventType, result.state ?? null]
      );
      // Update source record accounting_status
      await markSourceSentToOdoo(row.sourceTable, row.sourceId);
      logOdooCall(`worker.success(${action})`, result, true);
      succeeded += 1;
    } catch (err) {
      const errMsg = mapOdooError(err);
      const nextAttempt = row.attempts + 1;
      const backoff = BACKOFF_BASE_MS * (2 ** Math.min(nextAttempt - 1, 6));
      await dbQuery(
        `UPDATE odoo_sync_outbox
            SET status = CASE WHEN $2 >= $3 THEN 'failed' ELSE 'pending' END,
                last_error = $4,
                next_retry_at = now() + ($5 || ' milliseconds')::interval,
                updated_at = now()
          WHERE id = $1::uuid`,
        [row.id, nextAttempt, MAX_ATTEMPTS, errMsg, String(backoff)]
      ).catch(() => {});
      logOdooCall(`worker.fail(${action})`, errMsg, false);
      failed += 1;
    }
  }

  return { processed, succeeded, failed };
}

async function markSourceSentToOdoo(sourceTable, sourceId) {
  const tableMap = {
    farm_inventory_transactions: {
      pk: "id",
      cast: "::uuid",
      field: "accounting_status",
    },
    medicine_lots: {
      pk: "id",
      cast: "::uuid",
      field: "accounting_status",
    },
    flock_slaughter_events: {
      pk: "id",
      cast: "",
      field: "accounting_status",
    },
    poultry_sales_orders: {
      pk: "id",
      cast: "::uuid",
      field: "accounting_status",
    },
    flock_valuation_snapshots: {
      pk: "id",
      cast: "::uuid",
      field: "status",
      value: "posted",
    },
    payroll_period_closures: {
      pk: "id",
      cast: "::uuid",
      field: "accounting_status",
    },
    poultry_flocks: {
      pk: "id",
      cast: "::uuid",
      field: "bio_asset_accounting_status",
    },
    flock_mortality_events: {
      pk: "id",
      cast: "::uuid",
      field: "accounting_status",
    },
  };

  const meta = tableMap[sourceTable];
  if (!meta) return;

  const value = meta.value ?? "sent_to_odoo";
  try {
    await dbQuery(
      `UPDATE ${sourceTable} SET ${meta.field} = $1, updated_at = now() WHERE ${meta.pk} = $2${meta.cast}`,
      [value, sourceId]
    );
  } catch (e) {
    console.error("[ERROR]", "[odoo-worker] markSourceSentToOdoo:", e instanceof Error ? e.message : e);
  }
}

/**
 * Manually retry a specific failed outbox row.
 * @param {string} outboxId
 */
export async function retryOutboxRow(outboxId) {
  if (!hasDb()) return;
  await dbQuery(
    `UPDATE odoo_sync_outbox
        SET status = 'pending', next_retry_at = now(), last_error = NULL, updated_at = now()
      WHERE id = $1::uuid AND status = 'failed'`,
    [outboxId]
  );
  return processOdooSyncOutbox(1);
}
