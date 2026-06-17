import { isClevaFarmInboundSync } from "./inboundContext.js";
import { loadEntityRow } from "./reconciliationQuery.js";
import { rowToPayload, computePayloadContentHash } from "./entitySerializers.js";
import { enqueueClevaFarmSync } from "./syncOutbox.js";

let _dbQuery = null;
let _hasDb = null;

export function initFlockLifecycleSync(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

/**
 * Build outbound tombstone payload for a flock row (snake_case DB shape).
 * @param {Record<string, unknown>} flockRow
 * @param {{ terminalStatus?: string, reason?: string }} [opts]
 */
export function buildFlockTombstonePayload(flockRow, opts = {}) {
  const { terminalStatus = "closed", reason = "purged" } = opts;
  const syntheticRow = {
    ...flockRow,
    status: terminalStatus,
    updated_at: new Date(),
  };
  const id = String(flockRow?.id ?? "");
  const payload = rowToPayload("flock", syntheticRow);
  if (!payload.id && id) payload.id = id;
  payload.farmRecordDeleted = true;
  payload.lifecycleReason = reason;
  payload.contentHash = computePayloadContentHash(payload);
  return payload;
}

/**
 * Enqueue ERPNext sync before Farm hard-deletes a flock row.
 * @param {string} flockId
 * @param {{ terminalStatus?: string, reason?: string, event?: string }} [opts]
 */
export async function enqueueFlockTombstoneSync(flockId, opts = {}) {
  if (isClevaFarmInboundSync()) return;
  if (!hasDb() || !_dbQuery) return;
  const id = String(flockId ?? "").trim();
  if (!id) return;

  const {
    terminalStatus = "closed",
    reason = "purged",
    event = "on_delete",
  } = opts;

  const row = await loadEntityRow("flock", id, _dbQuery);
  if (!row) return;

  const payload = buildFlockTombstonePayload(row, { terminalStatus, reason });
  await enqueueClevaFarmSync({ entityType: "flock", entityId: id, payload, event });
}
