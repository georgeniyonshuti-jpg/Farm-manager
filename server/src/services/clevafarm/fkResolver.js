import { isUuidString } from "./inboundMappers.js";

/** ERPNext DocType hints for farm_migration_map lookups */
const COLUMN_DOCTYPE = {
  flock_id: "Flock",
  medicine_id: "Farm Medicine Item",
  barn_name_id: "Farm Barn",
  entered_by_user_id: "User",
  laborer_id: "User",
  actor_user_id: "User",
  administered_by_user_id: "User",
  approved_by_user_id: "User",
  feed_entry_id: "Feed Log",
  linked_checkin_id: "Farm Checkin",
};

/**
 * @param {{ field: string, value: unknown, dbQuery?: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} opts
 * @returns {Promise<string | null>}
 */
export async function resolvePostgresId({ field, value, dbQuery }) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (isUuidString(s)) return s;

  if (!dbQuery) return null;

  const doctype = COLUMN_DOCTYPE[field];
  if (doctype) {
    try {
      const r = await dbQuery(
        `SELECT legacy_id::text AS legacy_id
           FROM farm_migration_map
          WHERE erpnext_doctype = $1
            AND (erpnext_name = $2 OR legacy_id = $2)
          LIMIT 1`,
        [doctype, s]
      );
      const legacy = r.rows[0]?.legacy_id;
      if (legacy && isUuidString(String(legacy))) return String(legacy);
    } catch {
      /* table may be empty */
    }
  }

  if (field === "flock_id") {
    try {
      const r = await dbQuery(
        `SELECT id::text AS id FROM poultry_flocks WHERE id::text = $1 OR code = $1 LIMIT 1`,
        [s]
      );
      if (r.rows[0]?.id) return String(r.rows[0].id);
    } catch {
      /* ignore */
    }
  }

  if (field === "medicine_id") {
    try {
      const r = await dbQuery(
        `SELECT id::text AS id FROM medicine_inventory WHERE id::text = $1 OR lower(name) = lower($1) LIMIT 1`,
        [s]
      );
      if (r.rows[0]?.id) return String(r.rows[0].id);
    } catch {
      /* ignore */
    }
  }

  return null;
}

const FK_COLUMNS = new Set([
  "flock_id",
  "medicine_id",
  "barn_name_id",
  "entered_by_user_id",
  "laborer_id",
  "actor_user_id",
  "administered_by_user_id",
  "approved_by_user_id",
  "feed_entry_id",
  "linked_checkin_id",
]);

/**
 * Resolve ERPNext doc names to Postgres UUIDs on inbound rows.
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 */
export async function resolveInboundForeignKeys(entityType, row, dbQuery) {
  const out = { ...row };
  const invalid = [];

  for (const col of Object.keys(out)) {
    if (!FK_COLUMNS.has(col) || out[col] == null || out[col] === "") continue;
    const raw = String(out[col]);
    if (isUuidString(raw)) continue;

    const resolved = await resolvePostgresId({ field: col, value: raw, dbQuery });
    if (resolved) {
      out[col] = resolved;
    } else {
      invalid.push(col);
      delete out[col];
    }
  }

  return { row: out, invalidFkFields: invalid };
}
