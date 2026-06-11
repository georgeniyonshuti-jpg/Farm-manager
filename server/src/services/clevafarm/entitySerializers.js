import { getEntityDef } from "./entityRegistry.js";

/** @typedef {{ table: string; idColumn: string; updatedSinceSql: string; omitPayloadFields?: string[] }} EntityDef */

const FLOCK_STATUS_OUT = {
  active: "Active",
  planned: "Planned",
  slaughtered: "Slaughtered",
  archived: "Completed",
  completed: "Completed",
  failed: "Closed",
  closed: "Closed",
};

const FLOCK_STATUS_IN = Object.fromEntries(
  Object.entries(FLOCK_STATUS_OUT).map(([k, v]) => [v, k])
);
FLOCK_STATUS_IN.Completed = "archived";

function snakeToCamel(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(key) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function stringifyUuid(val) {
  if (val == null) return null;
  return String(val);
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ omit?: string[] }} opts
 */
export function pgRowToCamelPayload(row, { omit = [] } = {}) {
  if (!row || typeof row !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (omit.includes(k)) continue;
    if (v === undefined) continue;
    const camel = snakeToCamel(k);
    if (k === "id") {
      out.id = stringifyUuid(v);
    } else if (k.endsWith("_id")) {
      out[camel] = stringifyUuid(v);
    } else if (v instanceof Date) {
      out[camel] = v.toISOString();
    } else {
      out[camel] = v;
    }
  }
  if (!out.id && row.id != null) out.id = stringifyUuid(row.id);
  return out;
}

/**
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 */
export function rowToPayload(entityType, row) {
  const def = getEntityDef(entityType);
  if (!def || !row) return {};
  const omit = [...(def.omitPayloadFields || [])];
  const payload = pgRowToCamelPayload(row, { omit });

  if (entityType === "flock" && row.status != null) {
    const s = String(row.status).toLowerCase();
    payload.status = FLOCK_STATUS_OUT[s] || row.status;
  }

  if (entityType === "farm_checkin") {
    payload.hasPhotos = Boolean(row.photo_url || (Array.isArray(row.photo_urls) && row.photo_urls.length));
  }

  if (entityType === "farm_company") {
    payload.companyId = payload.id;
  }

  if (entityType === "farm_barn") {
    payload.barnNameId = payload.id;
  }

  if (entityType === "farm_migration_map" && row.legacy_id != null) {
    payload.legacyId = String(row.legacy_id);
  }

  return payload;
}

/**
 * @param {string} entityType
 * @param {Record<string, unknown>} payload
 */
export function payloadToRow(entityType, payload) {
  if (!payload || typeof payload !== "object") return {};
  const row = {};
  const skip = new Set(["entityType", "event", "hasPhotos", "companyId", "barnNameId"]);
  for (const [k, v] of Object.entries(payload)) {
    if (skip.has(k) || v === undefined) continue;
    if (k === "submissionStatus") {
      row.submission_status = v;
      continue;
    }
    if (k === "legacyId") {
      row.legacy_id = v;
      continue;
    }
    row[camelToSnake(k)] = v;
  }

  if (entityType === "flock" && payload.status != null) {
    const s = String(payload.status);
    row.status = FLOCK_STATUS_IN[s] || String(payload.status).toLowerCase();
  }

  return row;
}

export { FLOCK_STATUS_OUT, FLOCK_STATUS_IN };
