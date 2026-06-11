import { getEntityDef } from "./entityRegistry.js";
import { payloadToRow } from "./entitySerializers.js";

const NO_UPDATED_AT = new Set(["farm_treatment_round_event"]);

function coerceDbValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && !(val instanceof Date)) return JSON.stringify(val);
  return val;
}

/**
 * Idempotent upsert by payload.id for inbound ERPNext entity webhooks.
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>} dbQuery
 */
export async function upsertEntityFromPayload(entityType, payload, dbQuery) {
  const def = getEntityDef(entityType);
  if (!def) throw new Error(`Unknown entityType: ${entityType}`);
  const id = payload?.id != null ? String(payload.id) : null;
  if (!id) throw new Error("payload.id is required");

  const row = payloadToRow(entityType, payload);
  delete row.id;
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);

  const exists = await dbQuery(
    `SELECT 1 AS ok FROM ${def.table} WHERE ${def.idColumn} = $1::uuid LIMIT 1`,
    [id]
  );

  if (exists.rows.length > 0) {
    if (cols.length === 0) return { id, action: "noop" };
    const sets = cols.map((c, i) => `${c} = $${i + 2}`);
    const vals = cols.map((c) => coerceDbValue(row[c]));
    const touchUpdated = !NO_UPDATED_AT.has(entityType);
    const sql = `UPDATE ${def.table} SET ${sets.join(", ")}${
      touchUpdated ? ", updated_at = now()" : ""
    } WHERE ${def.idColumn} = $1::uuid`;
    await dbQuery(sql, [id, ...vals]);
    return { id, action: "updated" };
  }

  const insertCols = [def.idColumn, ...cols];
  const insertVals = [id, ...cols.map((c) => coerceDbValue(row[c]))];
  const ph = insertCols.map((_, i) => `$${i + 1}`);
  await dbQuery(
    `INSERT INTO ${def.table} (${insertCols.join(", ")}) VALUES (${ph.join(", ")})`,
    insertVals
  );
  return { id, action: "inserted" };
}
