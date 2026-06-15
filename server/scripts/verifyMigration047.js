/**
 * Verify migration 047 (clevafarm entity sync tables) on Postgres.
 * Usage: DATABASE_URL=... node scripts/verifyMigration047.js
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnvIfPresent() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const REQUIRED_TABLES = [
  "clevafarm_sync_outbox",
  "farm_migration_map",
  "farm_loan_applications",
];

async function main() {
  loadDotEnvIfPresent();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is required (set in server/.env or env)");
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: url, ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined });
  try {
    let allOk = true;
    for (const table of REQUIRED_TABLES) {
      const r = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS ok`,
        [table]
      );
      const ok = r.rows[0]?.ok === true;
      console.log(ok ? `✅ ${table}` : `❌ ${table} — missing`);
      if (!ok) allOk = false;
    }

    const mig = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM schema_migrations WHERE filename = '047_clevafarm_entity_sync.sql'
       ) AS ok`
    );
    const migOk = mig.rows[0]?.ok === true;
    console.log(migOk ? "✅ schema_migrations includes 047_clevafarm_entity_sync.sql" : "⚠️  047 not in schema_migrations (tables may still exist)");

    if (!allOk) {
      console.error("\nRun: redeploy Render API (migrations on startup) or apply database/migrations/047_clevafarm_entity_sync.sql manually.");
      process.exitCode = 1;
    } else {
      console.log("\n✅ Migration 047 tables present.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
