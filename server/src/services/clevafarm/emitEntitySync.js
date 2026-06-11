import { isClevaFarmInboundSync } from "./inboundContext.js";
import { loadEntityRow } from "./reconciliationQuery.js";
import { rowToPayload } from "./entitySerializers.js";
import { isValidEntityType } from "./entityRegistry.js";
import { enqueueClevaFarmSync } from "./syncOutbox.js";

let _dbQuery = null;
let _hasDb = null;

export function initClevaFarmEmit(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

/**
 * After a successful local write, enqueue outbound ERPNext entity sync.
 * @param {string} entityType
 * @param {string} entityId
 * @param {{ skipClevaFarmSync?: boolean }} [opts]
 */
export async function emitEntitySync(entityType, entityId, opts = {}) {
  if (opts.skipClevaFarmSync || isClevaFarmInboundSync()) return;
  if (!hasDb() || !_dbQuery) return;
  if (!isValidEntityType(entityType)) return;
  const id = entityId != null ? String(entityId) : "";
  if (!id) return;

  const row = await loadEntityRow(entityType, id, _dbQuery);
  if (!row) return;
  const payload = rowToPayload(entityType, row);
  if (!payload.id) payload.id = id;
  await enqueueClevaFarmSync({ entityType, entityId: id, payload });
}
