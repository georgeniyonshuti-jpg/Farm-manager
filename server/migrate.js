import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[FAIL] DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
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
      const already = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename]
      );
      if (already.rowCount && already.rowCount > 0) {
        console.log(`[SKIP] ${filename}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(filename) VALUES ($1)",
          [filename]
        );
        await client.query("COMMIT");
        console.log(`[OK] ${filename}`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`[FAIL] ${filename}:`, e instanceof Error ? e.message : e);
        process.exit(1);
      }
    }
  } finally {
    await client.end();
  }

  process.exit(0);
}

run().catch((e) => {
  console.error("[FAIL] migration runner:", e instanceof Error ? e.message : e);
  process.exit(1);
});
