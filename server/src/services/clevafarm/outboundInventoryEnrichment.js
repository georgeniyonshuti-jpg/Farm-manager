import { isUuidString } from "./inboundMappers.js";
import { computePayloadContentHash } from "./entitySerializers.js";
import { normalizeInventoryTxnType } from "../feedStockService.js";

/** Farm Postgres transaction_type → ERPNext Feed Inventory Transaction Select label. */
const INVENTORY_TXN_TYPE_OUT = {
  procurement_receipt: "Procurement Receipt",
  feed_consumption: "Feed Consumption",
  adjustment: "Adjustment",
};

/**
 * @param {unknown} raw Farm Postgres or inbound alias value
 * @returns {string | null} ERPNext Select label
 */
export function inventoryTxnTypeForErpNext(raw) {
  if (raw == null || raw === "") return null;
  const normalized = normalizeInventoryTxnType(raw);
  if (!normalized) return null;
  return INVENTORY_TXN_TYPE_OUT[normalized] ?? null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function feedTypeForErpNext(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 * @param {Record<string, unknown>} row
 */
async function lookupCompanyId(row, dbQuery) {
  if (!dbQuery) return null;
  const flockId = row.flock_id ?? row.flockId;
  if (flockId != null && isUuidString(String(flockId))) {
    try {
      const r = await dbQuery(
        `SELECT company_id::text AS id FROM poultry_flocks WHERE id = $1::uuid LIMIT 1`,
        [String(flockId)]
      );
      const id = r.rows[0]?.id;
      if (id != null && String(id).trim()) return String(id);
    } catch {
      /* ignore */
    }
  }
  const actorId = row.actor_user_id ?? row.actorUserId;
  if (actorId != null && isUuidString(String(actorId))) {
    try {
      const r = await dbQuery(
        `SELECT company_id::text AS id FROM users WHERE id = $1::uuid LIMIT 1`,
        [String(actorId)]
      );
      const id = r.rows[0]?.id;
      if (id != null && String(id).trim()) return String(id);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * ERPNext-facing fields for feed_inventory_transaction outbound payloads.
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} payload
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} [dbQuery]
 */
export async function enrichOutboundInventoryFields(entityType, row, payload, dbQuery) {
  if (entityType !== "feed_inventory_transaction" || !payload || typeof payload !== "object") {
    return payload;
  }

  let dirty = false;
  const rawType = row?.transaction_type ?? payload.transactionType;
  const erpType = inventoryTxnTypeForErpNext(rawType);
  if (erpType && payload.transactionType !== erpType) {
    payload.transactionType = erpType;
    dirty = true;
  }

  const rawFeedType = row?.feed_type ?? payload.feedType;
  const erpFeedType = feedTypeForErpNext(rawFeedType);
  if (erpFeedType && payload.feedType !== erpFeedType) {
    payload.feedType = erpFeedType;
    dirty = true;
  }

  const feedEntryId = payload.feedEntryId ?? row?.feed_entry_id;
  if (feedEntryId != null && String(feedEntryId).trim()) {
    const id = String(feedEntryId);
    if (payload.feedLogId !== id) {
      payload.feedLogId = id;
      dirty = true;
    }
  }

  if (dbQuery) {
    const companyId = await lookupCompanyId(row, dbQuery);
    if (companyId && payload.companyId !== companyId) {
      payload.companyId = companyId;
      dirty = true;
    }
  }

  if (dirty && payload.contentHash != null) {
    payload.contentHash = computePayloadContentHash(payload);
  }

  return payload;
}
