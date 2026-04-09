import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientMigrationError(err) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  if (code === "EAI_AGAIN" || code === "ENOTFOUND" || code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return true;
  }
  if (msg.includes("getaddrinfo") || msg.includes("timeout") || msg.includes("connection terminated") || msg.includes("could not connect")) {
    return true;
  }
  return false;
}

async function runMigrationsOnce() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: databaseUrl });
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
        failedCount += 1;
        console.error(`[FAIL] ${filename}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.end();
  }

  // PROD-FIX: report migration health without crashing long-running app process
  return { ok: failedCount === 0, failedCount };
}

/**
 * Runs migrations with bounded retries for transient network/DNS failures.
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
 */
export async function runMigrations(options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 5));
  const baseDelayMs = Math.max(250, Number(options.baseDelayMs ?? 1000));

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log("[INFO]", `[migrate] attempt ${attempt}/${maxAttempts}`);
      const result = await runMigrationsOnce();
      return { ...result, attempts: attempt };
    } catch (e) {
      lastError = e;
      const transient = isTransientMigrationError(e);
      const code = e?.code ? String(e.code) : "";
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ERROR]", `[migrate] attempt ${attempt}/${maxAttempts} failed${code ? ` (${code})` : ""}: ${msg}`);
      if (!transient || attempt >= maxAttempts) {
        e.transient = transient;
        throw e;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.log("[INFO]", `[migrate] transient failure; retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw lastError ?? new Error("Migration failed without explicit error");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((result) => {
      process.exit(result.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("[FAIL] migration runner:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
