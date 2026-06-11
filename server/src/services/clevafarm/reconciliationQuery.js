import { getEntityDef, isValidEntityType } from "./entityRegistry.js";
import { rowToPayload } from "./entitySerializers.js";

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 */
export async function loadEntityRow(entityType, entityId, dbQuery) {
  const def = getEntityDef(entityType);
  if (!def) return null;
  const r = await dbQuery(`SELECT * FROM ${def.table} WHERE ${def.idColumn} = $1::uuid LIMIT 1`, [
    String(entityId),
  ]);
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
  return r.rows.map((row) => rowToPayload(entityType, row));
}
