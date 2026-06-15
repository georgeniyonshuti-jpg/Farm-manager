#!/usr/bin/env node
/**
 * Backfill farm_migration_map from successful clevafarm_sync_outbox rows.
 *
 * Usage (from server/):
 *   npm run backfill:migration-map -- [--dry-run]
 *
 * Requires DATABASE_URL and migration 047 applied.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pgClientConfigFromDatabaseUrlAsync } from "../pgConnFromUrl.js";
import {
  getErpnextDoctypeForEntity,
  upsertMigrationMapEntry,
} from "../src/services/clevafarm/migrationMap.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs() {
  let envFile = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--env-file=")) envFile = arg.slice("--env-file=".length);
  }
  return { envFile };
}

const { envFile } = parseArgs();
loadEnvFile(envFile);
loadEnvFile(path.resolve(__dirname, "../.env"));

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool(await pgClientConfigFromDatabaseUrlAsync(process.env.DATABASE_URL));

  async function dbQuery(sql, params = []) {
    return pool.query(sql, params);
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
