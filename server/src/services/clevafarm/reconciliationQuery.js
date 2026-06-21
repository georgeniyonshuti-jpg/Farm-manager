import { getEntityDef, isValidEntityType, isTextPkEntity } from "./entityRegistry.js";
import { rowToPayload } from "./entitySerializers.js";
import { enrichOutboundUserFields } from "./outboundUserEnrichment.js";
import { enrichOutboundInventoryFields } from "./outboundInventoryEnrichment.js";

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 */
export async function loadEntityRow(entityType, entityId, dbQuery) {
  const def = getEntityDef(entityType);
  if (!def) return null;
  const id = String(entityId);
  const sql = isTextPkEntity(entityType)
    ? `SELECT * FROM ${def.table} WHERE ${def.idColumn} = $1 LIMIT 1`
    : `SELECT * FROM ${def.table} WHERE ${def.idColumn} = $1::uuid LIMIT 1`;
  const r = await dbQuery(sql, [id]);
  return r.rows[0] || null;
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 */
export async function listEntitiesSince(entityType, updatedSince, dbQuery) {
  if (!isValidEntityType(entityType)) {
    throw new Error(`Unknown entityType: ${entityType}`);
  }
  const def = getEntityDef(entityType);
  const since = updatedSince ? new Date(updatedSince) : null;
  if (since && Number.isNaN(since.getTime())) {
    throw new Error("Invalid updatedSince timestamp");
  }

  const params = [];
  let where = "";
  if (since) {
    params.push(since.toISOString());
    where = `WHERE ${def.updatedSinceSql} >= $1::timestamptz`;
  }

  const r = await dbQuery(
    `SELECT * FROM ${def.table} ${where} ORDER BY ${def.updatedSinceSql} ASC`,
    params
  );
  const records = [];
  for (const row of r.rows) {
    let payload = rowToPayload(entityType, row);
    payload = await enrichOutboundUserFields(entityType, row, payload, dbQuery);
    payload = await enrichOutboundInventoryFields(entityType, row, payload, dbQuery);
    records.push(payload);
  }
  return records;
}
