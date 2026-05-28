import { execute, getAuthenticatedUserId } from "../src/services/odoo/odooClient.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnvIfPresent() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

async function main() {
  try {
    loadDotEnvIfPresent();
    const uid = await getAuthenticatedUserId();
    const users = await execute("res.users", "read", [[uid], ["id", "name", "login"]]);
    const me = Array.isArray(users) ? users[0] : null;
    const label = me?.name || me?.login || `uid=${uid}`;
    console.log(`✅ Connected as ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Odoo connection failed: ${message}`);
    process.exitCode = 1;
  }
}

main();
