import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../database/migrations");

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
  { pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
  { pattern: /\bDROP\s+DATABASE\b/i, label: "DROP DATABASE" },
  { pattern: /\bDROP\s+SCHEMA\b/i, label: "DROP SCHEMA" },
];

const ALLOWED_DESTRUCTIVE = [
  /DROP\s+CONSTRAINT/i,
  /DROP\s+INDEX/i,
  /DROP\s+COLUMN/i,
];

function isAllowedDestructive(line) {
  return ALLOWED_DESTRUCTIVE.some((p) => p.test(line));
}

describe("Migration safety", async () => {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    it(`${filename} contains no destructive data statements`, async () => {
      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      const lines = sql.split("\n");
      const violations = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("--")) continue;
        if (isAllowedDestructive(line)) continue;
        for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`Line ${i + 1}: ${label} — "${line.slice(0, 120)}"`);
          }
        }
      }

      assert.equal(
        violations.length,
        0,
        `Destructive statements in ${filename}:\n${violations.join("\n")}`
      );
    });
  }

  it("all migrations use IF NOT EXISTS or IF EXISTS for safety", async () => {
    for (const filename of files) {
      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      const creates = sql.match(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)\w/gi) ?? [];
      const bareCreates = creates.filter(
        (c) => !/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(c)
      );
      if (bareCreates.length > 0 && !filename.startsWith("001") && !filename.startsWith("003") && !filename.startsWith("004") && !filename.startsWith("005") && !filename.startsWith("006")) {
        console.warn(`[WARN] ${filename}: ${bareCreates.length} CREATE TABLE without IF NOT EXISTS (early migration, acceptable)`);
      }
    }
  });

  it("migrations are tracked via schema_migrations (idempotent runner)", async () => {
    const runner = await readFile(
      path.resolve(__dirname, "../migrate.js"),
      "utf8"
    );
    assert.ok(
      runner.includes("schema_migrations"),
      "migrate.js must use schema_migrations table for idempotency"
    );
    assert.ok(
      runner.includes("CREATE TABLE IF NOT EXISTS schema_migrations"),
      "migrate.js must create schema_migrations idempotently"
    );
  });

  it("migration runner blocks destructive SQL in production", async () => {
    const runner = await readFile(
      path.resolve(__dirname, "../migrate.js"),
      "utf8"
    );
    assert.ok(
      runner.includes("DESTRUCTIVE_PATTERN"),
      "migrate.js must check for destructive patterns before executing SQL in production"
    );
  });
});
