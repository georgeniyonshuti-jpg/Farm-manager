#!/usr/bin/env node
/**
 * Delegates to server/scripts/backfill-migration-map.js (needs server/node_modules).
 *
 * Usage:
 *   npm run backfill:migration-map --prefix server [-- --dry-run]
 *   DATABASE_URL=... node scripts/backfill-migration-map.js [--dry-run]
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, "../server");
const script = path.join(serverDir, "scripts/backfill-migration-map.js");

const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  cwd: serverDir,
});

process.exit(result.status ?? 1);
