import { getEntityDef, TEXT_PK_ENTITIES } from "./entityRegistry.js";
import {
  mapInboundPayload,
  applyInsertDefaults,
  REQUIRED_FOR_INSERT,
  INBOUND_ERPNEXT_ENTITY_TYPES,
} from "./inboundMappers.js";
import { resolveInboundForeignKeys } from "./fkResolver.js";
import { InboundValidationError, sanitizePostgresInboundError } from "./inboundErrors.js";

const NO_UPDATED_AT = new Set(["farm_treatment_round_event"]);

function coerceDbValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && !(val instanceof Date)) return JSON.stringify(val);
  return val;
}

function idParam(id, entityType) {
  if (TEXT_PK_ENTITIES.has(entityType)) return id;
  return id;
}

function missingRequired(entityType, row) {
  const required = REQUIRED_FOR_INSERT[entityType] || [];
  return required.filter((col) => row[col] === undefined || row[col] === null || row[col] === "");
}

/**
 * Idempotent upsert by payload.id for inbound ERPNext entity webhooks.
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>} dbQuery
 */
export async function upsertEntityFromPayload(entityType, payload, dbQuery) {
  const def = getEntityDef(entityType);
  if (!def) throw new InboundValidationError(`Unknown entityType: ${entityType}`, { code: "UNKNOWN_TYPE" });

  const id = payload?.id != null ? String(payload.id) : null;
  if (!id) throw new InboundValidationError("payload.id is required", { code: "MISSING_ID" });

  if (INBOUND_ERPNEXT_ENTITY_TYPES.includes(entityType)) {
    return upsertMappedEntity(entityType, def, id, payload, dbQuery);
  }

  return upsertGenericEntity(entityType, def, id, payload, dbQuery);
}

async function upsertMappedEntity(entityType, def, id, payload, dbQuery) {
  let row = mapInboundPayload(entityType, payload);
  const { row: resolved, invalidFkFields } = await resolveInboundForeignKeys(entityType, row, dbQuery);
  row = resolved;

  if (invalidFkFields.length > 0) {
    throw new InboundValidationError(
      `Could not resolve foreign keys: ${invalidFkFields.join(", ")}`,
      { code: "INVALID_FK", invalidFkFields }
    );
  }

  const exists = await rowExists(def, id, entityType, dbQuery);

  if (exists) {
    if (Object.keys(row).length === 0) return { id, action: "noop" };
    try {
      await runUpdate(def, entityType, id, row, dbQuery);
      return { id, action: "updated" };
    } catch (e) {
      throw sanitizePostgresInboundError(e);
    }
  }

  row = applyInsertDefaults(entityType, row);
  const missing = missingRequired(entityType, row);
  if (missing.length > 0) {
    throw new InboundValidationError(
      `Cannot insert ${entityType}: missing required fields (${missing.join(", ")}). ` +
        "ERPNext should send a full row or update an existing PWA record by id.",
      { code: "MISSING_REQUIRED", missingFields: missing }
    );
  }

  try {
    await runInsert(def, entityType, id, row, dbQuery);
    return { id, action: "inserted" };
  } catch (e) {
    throw sanitizePostgresInboundError(e);
  }
}

async function upsertGenericEntity(entityType, def, id, payload, dbQuery) {
  const { payloadToRow } = await import("./entitySerializers.js");
  const row = payloadToRow(entityType, payload);
  delete row.id;
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  const exists = await dbQuery(
    `SELECT 1 AS ok FROM ${def.table} WHERE ${def.idColumn} = $1::uuid LIMIT 1`,
    [id]
  );
  if (exists.rows.length > 0) {
    if (cols.length === 0) return { id, action: "noop" };
    try {
      await runUpdate(def, entityType, id, row, dbQuery);
      return { id, action: "updated" };
    } catch (e) {
      throw sanitizePostgresInboundError(e);
    }
  }
  try {
    await runInsert(def, entityType, id, row, dbQuery);
    return { id, action: "inserted" };
  } catch (e) {
    throw sanitizePostgresInboundError(e);
  }
}

async function rowExists(def, id, entityType, dbQuery) {
  if (TEXT_PK_ENTITIES.has(entityType)) {
    const r = await dbQuery(`SELECT 1 AS ok FROM ${def.table} WHERE ${def.idColumn} = $1 LIMIT 1`, [id]);
    return r.rows.length > 0;
  }
  const r = await dbQuery(
    `SELECT 1 AS ok FROM ${def.table} WHERE ${def.idColumn} = $1::uuid LIMIT 1`,
    [id]
  );
  return r.rows.length > 0;
}

async function runUpdate(def, entityType, id, row, dbQuery) {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`);
  const vals = cols.map((c) => coerceDbValue(row[c]));
  const touchUpdated = !NO_UPDATED_AT.has(entityType);
  const where =
    TEXT_PK_ENTITIES.has(entityType) ? `${def.idColumn} = $1` : `${def.idColumn} = $1::uuid`;
  const sql = `UPDATE ${def.table} SET ${sets.join(", ")}${
    touchUpdated ? ", updated_at = now()" : ""
  } WHERE ${where}`;
  await dbQuery(sql, [idParam(id, entityType), ...vals]);
}

async function runInsert(def, entityType, id, row, dbQuery) {
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  const insertCols = [def.idColumn, ...cols];
  const insertVals = [id, ...cols.map((c) => coerceDbValue(row[c]))];
  const ph = insertCols.map((_, i) => {
    if (i === 0 && !TEXT_PK_ENTITIES.has(entityType)) return `$${i + 1}::uuid`;
    return `$${i + 1}`;
  });
  await dbQuery(
    `INSERT INTO ${def.table} (${insertCols.join(", ")}) VALUES (${ph.join(", ")})`,
    insertVals
  );
}

export { InboundValidationError };
