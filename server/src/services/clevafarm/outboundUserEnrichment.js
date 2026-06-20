import { isUuidString } from "./inboundMappers.js";
import { computePayloadContentHash } from "./entitySerializers.js";

/** @typedef {{ column: string, uuidKey: string, emailKey: string, recordedByAlias?: boolean }} UserFieldSpec */

/** @type {Record<string, UserFieldSpec>} */
export const OUTBOUND_USER_ENTITIES = {
  feed_log: {
    column: "entered_by_user_id",
    uuidKey: "enteredByUserId",
    emailKey: "enteredByEmail",
    recordedByAlias: true,
  },
  feed_inventory_transaction: {
    column: "actor_user_id",
    uuidKey: "actorUserId",
    emailKey: "actorUserEmail",
    recordedByAlias: true,
  },
  farm_checkin: {
    column: "laborer_id",
    uuidKey: "laborerId",
    emailKey: "laborerEmail",
    recordedByAlias: true,
  },
  farm_vet_log: {
    column: "author_user_id",
    uuidKey: "authorUserId",
    emailKey: "authorUserEmail",
    recordedByAlias: true,
  },
  farm_weigh_in: {
    column: "recorded_by",
    uuidKey: "recordedBy",
    emailKey: "recordedByEmail",
    recordedByAlias: false,
  },
  farm_payroll_impact: {
    column: "user_id",
    uuidKey: "userId",
    emailKey: "userEmail",
    recordedByAlias: false,
  },
  slaughter_record: {
    column: "entered_by_user_id",
    uuidKey: "enteredByUserId",
    emailKey: "enteredByEmail",
    recordedByAlias: true,
  },
  mortality_log: {
    column: "laborer_id",
    uuidKey: "laborerId",
    emailKey: "laborerEmail",
    recordedByAlias: true,
  },
};

const INVALID_USER_TOKENS = new Set(["user", "unknown", ""]);

/**
 * @param {unknown} val
 * @returns {string | null}
 */
export function normalizeOutboundUserId(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s || INVALID_USER_TOKENS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 * @param {string} userId
 */
async function lookupUserEmail(userId, dbQuery) {
  if (!dbQuery || !isUuidString(userId)) return null;
  try {
    const r = await dbQuery(`SELECT email FROM users WHERE id = $1::uuid LIMIT 1`, [userId]);
    const email = r.rows[0]?.email;
    if (email == null) return null;
    const s = String(email).trim();
    return s || null;
  } catch {
    return null;
  }
}

/**
 * Add ERPNext-facing user aliases (recordedBy, *Email) and feed_log logDate.
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} payload
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} [dbQuery]
 */
export async function enrichOutboundUserFields(entityType, row, payload, dbQuery) {
  if (!payload || typeof payload !== "object") return payload;
  let dirty = false;

  if (entityType === "feed_log" && payload.recordedAt && !payload.logDate) {
    payload.logDate = payload.recordedAt;
    dirty = true;
  }

  const spec = OUTBOUND_USER_ENTITIES[entityType];
  if (!spec) {
    if (dirty && payload.contentHash != null) {
      payload.contentHash = computePayloadContentHash(payload);
    }
    return payload;
  }

  const rawUserId =
    row?.[spec.column] ?? payload[spec.uuidKey] ?? payload.recordedBy ?? null;
  const userId = normalizeOutboundUserId(rawUserId);
  if (!userId) {
    if (dirty && payload.contentHash != null) {
      payload.contentHash = computePayloadContentHash(payload);
    }
    return payload;
  }

  if (payload[spec.uuidKey] !== userId) {
    payload[spec.uuidKey] = userId;
    dirty = true;
  }

  if (spec.recordedByAlias && payload.recordedBy !== userId) {
    payload.recordedBy = userId;
    dirty = true;
  }

  if (dbQuery) {
    const email = await lookupUserEmail(userId, dbQuery);
    if (email && payload[spec.emailKey] !== email) {
      payload[spec.emailKey] = email;
      dirty = true;
    }
  }

  if (dirty) {
    payload.contentHash = computePayloadContentHash(payload);
  }

  return payload;
}
