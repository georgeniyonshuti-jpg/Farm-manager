#!/usr/bin/env node
/**
 * Enqueue all registry entities for outbound ClevaFarm → ERPNext sync (dependency order).
 *
 * Usage:
 *   node scripts/backfill-clevafarm-sync.js [--dry-run] [--since=2026-01-01T00:00:00Z] [--entity-type=flock] [--entity-type=farm_checkin]
 *
 * Requires DATABASE_URL and migration 047 applied.
 */

import pg from "pg";
import { ENTITY_DEPENDENCY_ORDER, ENTITY_DEFS } from "../server/src/services/clevafarm/entityRegistry.js";
import { rowToPayload } from "../server/src/services/clevafarm/entitySerializers.js";
import { enrichOutboundUserFields } from "../server/src/services/clevafarm/outboundUserEnrichment.js";
import { enqueueClevaFarmSync } from "../server/src/services/clevafarm/syncOutbox.js";
import { initClevaFarmSyncWorker } from "../server/src/services/clevafarm/syncOutbox.js";
import { initClevaFarmEmit } from "../server/src/services/clevafarm/emitEntitySync.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const since = sinceArg ? sinceArg.split("=")[1] : null;
const entityTypeFilters = args
  .filter((a) => a.startsWith("--entity-type="))
  .map((a) => a.slice("--entity-type=".length))
  .filter(Boolean);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

initClevaFarmSyncWorker(dbQuery, hasDb);
initClevaFarmEmit(dbQuery, hasDb);

async function rowsForType(entityType) {
  const def = ENTITY_DEFS[entityType];
  if (!def) return [];
  const params = [];
  let where = "";
  if (since) {
    params.push(since);
    where = `WHERE ${def.updatedSinceSql} >= $1::timestamptz`;
  }
  const r = await dbQuery(
    `SELECT * FROM ${def.table} ${where} ORDER BY ${def.updatedSinceSql} ASC`,
    params
  );
  return r.rows;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  let total = 0;
  const types = entityTypeFilters.length
    ? ENTITY_DEPENDENCY_ORDER.filter((t) => entityTypeFilters.includes(t))
    : ENTITY_DEPENDENCY_ORDER;

  if (entityTypeFilters.length) {
    const unknown = entityTypeFilters.filter((t) => !ENTITY_DEFS[t]);
    if (unknown.length) {
      console.error(`Unknown entity type(s): ${unknown.join(", ")}`);
      process.exit(1);
    }
    if (types.length === 0) {
      console.error("No matching entity types in dependency order");
      process.exit(1);
    }
    console.log(`Filtering to: ${types.join(", ")}`);
  }

  for (const entityType of types) {
    const rows = await rowsForType(entityType);
    console.log(`[${entityType}] ${rows.length} row(s)`);
    for (const row of rows) {
      const id = String(row[ENTITY_DEFS[entityType].idColumn] ?? row.id);
      let payload = rowToPayload(entityType, row);
      if (!payload.id) payload.id = id;
      payload = await enrichOutboundUserFields(entityType, row, payload, dbQuery);
      total += 1;
      if (dryRun) {
        console.log(`  dry-run enqueue ${entityType} ${id}`);
        continue;
      }
      await enqueueClevaFarmSync({ entityType, entityId: id, payload });
    }
  }
  console.log(dryRun ? `Dry run complete (${total} would enqueue)` : `Enqueued ${total} entities`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
