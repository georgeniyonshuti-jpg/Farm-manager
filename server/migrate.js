import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

export async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[migration]", "DATABASE_URL not set; skipping migration runner");
    return { ok: true, failedCount: 0, skipped: true };
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    family: 4,
  });
  await client.connect();
  let failedCount = 0;

  try {
    // PROD-FIX: track applied migrations to keep startup idempotent
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        ran_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationsDir = path.resolve(__dirname, "../database/migrations");
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of files) {
      const alreadyRan = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename]
      );
      if ((alreadyRan.rowCount ?? 0) > 0) {
        console.log("[migration]", `[SKIP] ${filename}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [filename]
        );
        await client.query("COMMIT");
        console.log("[migration]", `[OK] ${filename}`);
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore rollback errors */
        }
        failedCount += 1;
        console.error(
          "[migration]",
          `[FAIL] ${filename}:`,
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  } finally {
    await client.end();
  }

  // PROD-FIX: report migration health without crashing long-running app process
  return { ok: failedCount === 0, failedCount, skipped: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((result) => {
      process.exit(result.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("[migration]", "runner fatal:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
