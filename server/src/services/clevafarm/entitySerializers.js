import crypto from "node:crypto";
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

function pickUpdatedAtIso(row) {
  const candidates = [row.updated_at, row.created_at, row.recorded_at, row.at, row.log_date, row.weighed_at];
  for (const val of candidates) {
    if (val == null) continue;
    const d = val instanceof Date ? val : new Date(String(val));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function hashPayload(payload) {
  const keys = Object.keys(payload).sort();
  const stable = JSON.stringify(payload, keys);
  return crypto.createHash("sha256").update(stable).digest("hex");
}

/** @param {string} farmStatus */
export function resolveFlockStatusOut(farmStatus) {
  const s = String(farmStatus ?? "").toLowerCase();
  return FLOCK_STATUS_OUT[s] || "Closed";
}

/** Stable sha256 for outbound payloads; strips internal sync-only fields. */
export function computePayloadContentHash(payload) {
  const copy = { ...payload };
  delete copy.__syncEvent;
  delete copy.contentHash;
  return hashPayload(copy);
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
    payload.status = resolveFlockStatusOut(row.status);
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

  const updatedAt = pickUpdatedAtIso(row);
  if (updatedAt) payload.updatedAt = updatedAt;
  payload.contentHash = computePayloadContentHash(payload);

  return payload;
}

/**
 * Legacy naive camelCase → snake_case (outbound reconciliation and non-ERPNext entity types only).
 * Inbound ERPNext webhooks use mapInboundPayload in inboundMappers.js.
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
