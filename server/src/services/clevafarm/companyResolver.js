/**
 * Resolve Farm Manager company_id for ClevaFarm entity sync rows.
 */

/** Entity types with no company scope (shared master data). */
const SHARED_MASTER_ENTITIES = new Set([
  "farm_barn",
  "farm_supplier",
  "poultry_breed_standard",
  "farm_medicine_item",
  "farm_medicine_lot",
  "feed_inventory_transaction",
  "farm_migration_map",
]);

/**
 * @param {string} entityType
 * @param {Record<string, unknown>} row
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>} dbQuery
 * @returns {Promise<string | null>}
 */
export async function resolveCompanyIdForEntity(entityType, row, dbQuery) {
  if (!row || typeof row !== "object") return null;
  if (SHARED_MASTER_ENTITIES.has(entityType)) return null;

  if (row.company_id != null) {
    return String(row.company_id);
  }

  const flockId = row.flock_id ?? row.flockId;
  if (flockId && dbQuery) {
    try {
      const r = await dbQuery(
        `SELECT company_id::text AS id FROM poultry_flocks WHERE id = $1::uuid LIMIT 1`,
        [String(flockId)]
      );
      if (r.rows[0]?.id) return String(r.rows[0].id);
    } catch {
      /* ignore lookup errors */
    }
  }

  if (entityType === "farm_company" && row.id != null) {
    return String(row.id);
  }

  return null;
}
