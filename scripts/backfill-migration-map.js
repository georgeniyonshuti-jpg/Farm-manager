#!/usr/bin/env node
/**
 * Backfill farm_migration_map from successful clevafarm_sync_outbox rows.
 *
 * Usage:
 *   node scripts/backfill-migration-map.js [--dry-run]
 *
 * Requires DATABASE_URL and migration 047 applied.
 */

import pg from "pg";
import {
  getErpnextDoctypeForEntity,
  upsertMigrationMapEntry,
} from "../server/src/services/clevafarm/migrationMap.js";

const dryRun = process.argv.includes("--dry-run");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const r = await dbQuery(
    `SELECT entity_type, entity_id, erpnext_ref, erpnext_doctype
       FROM clevafarm_sync_outbox
      WHERE direction = 'outbound'
        AND status = 'sent'
        AND erpnext_ref IS NOT NULL
      ORDER BY entity_type, entity_id`
  );

  let upserted = 0;
  let skipped = 0;

  for (const row of r.rows) {
    const doctype = getErpnextDoctypeForEntity(row.entity_type, row.erpnext_doctype);
    if (!doctype) {
      console.warn(`  skip ${row.entity_type} ${row.entity_id}: unknown doctype`);
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`  dry-run map ${row.entity_type} ${row.entity_id} → ${doctype}/${row.erpnext_ref}`);
      upserted += 1;
      continue;
    }
    await upsertMigrationMapEntry({
      legacyId: row.entity_id,
      erpnextDoctype: doctype,
      erpnextName: row.erpnext_ref,
      dbQuery,
    });
    upserted += 1;
  }

  console.log(
    dryRun
      ? `Dry run: would upsert ${upserted} map entries (${skipped} skipped)`
      : `Upserted ${upserted} map entries (${skipped} skipped)`
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
