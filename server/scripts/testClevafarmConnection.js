/**
 * End-to-end ClevaFarm ↔ ERPNext connection checks (prod or local).
 *
 * Usage (from server/):
 *   npm run test:clevafarm
 *
 * Env (server/.env or exported):
 *   CLEVAFARM_API_SECRET          required for integration tests
 *   ERPNEXT_BASE_URL              default https://erp.clevacredit.com
 *   FARM_API_BASE_URL             default https://farmapi.clevacredit.com
 *   ERPNEXT_API_KEY / ERPNEXT_API_SECRET   optional REST ping
 *   DATABASE_URL                  optional outbox stats
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pushEntityToErpnext } from "../src/services/clevafarm/outboundClient.js";
import { pingHealth, hasApiKeyCredentials } from "../src/services/erpnext/erpnext.client.js";
import { isClevaFarmSecretConfigured } from "../src/services/clevafarm/clevafarmSecret.js";

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

function secretHeaders() {
  const secret = process.env.CLEVAFARM_API_SECRET || "";
  return {
    "Content-Type": "application/json",
    "X-ClevaFarm-Secret": secret,
  };
}

async function checkSecretConfigured() {
  if (!isClevaFarmSecretConfigured()) {
    console.error("❌ CLEVAFARM_API_SECRET is not set");
    console.error("   Generate: openssl rand -hex 32");
    console.error("   Set on Render AND Hetzner site_config clevafarm_api_secret (same value)");
    return false;
  }
  console.log("✅ CLEVAFARM_API_SECRET is configured");
  return true;
}

async function checkFarmReconciliation(farmBase) {
  const url = `${farmBase.replace(/\/+$/, "")}/api/entities/flock?updatedSince=2020-01-01T00:00:00Z`;
  const res = await fetch(url, { headers: secretHeaders() });
  const body = await res.json().catch(() => ({}));
  if (res.status === 503 && body.error?.includes("CLEVAFARM_API_SECRET")) {
    console.error("❌ Farm API reconciliation: secret not configured on server (Render env)");
    return false;
  }
  if (res.status === 403) {
    console.error("❌ Farm API reconciliation: 403 — secret mismatch between this script and Render");
    return false;
  }
  if (!res.ok) {
    console.error(`❌ Farm API reconciliation: HTTP ${res.status}`, body);
    return false;
  }
  const count = Array.isArray(body.records) ? body.records.length : 0;
  console.log(`✅ Farm API reconciliation: ${count} flock record(s)`);
  return true;
}

async function checkFarmInboundWebhook(farmBase) {
  const testId = "00000000-0000-4000-8000-000000000001";
  const url = `${farmBase.replace(/\/+$/, "")}/api/webhooks/erpnext/entity`;
  const res = await fetch(url, {
    method: "POST",
    headers: secretHeaders(),
    body: JSON.stringify({
      entityType: "flock",
      event: "on_update",
      payload: { id: testId, status: "Planned", breedCode: "connection-test" },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) {
    console.error("❌ Farm inbound webhook: 403 — check CLEVAFARM_API_SECRET on Render");
    return false;
  }
  if (!res.ok) {
    console.error(`❌ Farm inbound webhook: HTTP ${res.status}`, body);
    return false;
  }
  console.log(`✅ Farm inbound webhook: ${body.action || "ok"}`);
  return true;
}

async function checkErpnextReceive() {
  const testPayload = {
    id: "00000000-0000-4000-8000-000000000002",
    status: "Planned",
    breedCode: "connection-test",
  };
  try {
    const result = await pushEntityToErpnext("flock", testPayload);
    console.log("✅ ERPNext webhooks.receive:", result.name || result.ok ? "ok" : JSON.stringify(result));
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e?.status === 403) {
      console.error("❌ ERPNext webhooks.receive: 403 — set clevafarm_api_secret on Hetzner site_config");
    } else {
      console.error(`❌ ERPNext webhooks.receive: ${msg}`);
    }
    return false;
  }
}

async function checkErpnextRest() {
  if (!hasApiKeyCredentials()) {
    console.log("⚠️  ERPNext REST: skipped (ERPNEXT_API_KEY/SECRET not set)");
    return true;
  }
  try {
    const ping = await pingHealth();
    console.log(`✅ ERPNext REST ping: ${ping.responseMs}ms`);
    return true;
  } catch (e) {
    console.error(`❌ ERPNext REST ping: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

async function checkOutboxStats() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("⚠️  Outbox stats: skipped (DATABASE_URL not set)");
    return true;
  }
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require") || url.includes("render.com") ? { rejectUnauthorized: false } : undefined,
  });
  try {
    const r = await pool.query(
      `SELECT status, COUNT(*)::int AS c FROM clevafarm_sync_outbox GROUP BY status ORDER BY status`
    );
    if (r.rows.length === 0) {
      console.log("✅ Outbox: empty (no rows yet)");
    } else {
      console.log("✅ Outbox:", r.rows.map((row) => `${row.status}=${row.c}`).join(", "));
    }
    return true;
  } catch (e) {
    console.error(`❌ Outbox query failed: ${e instanceof Error ? e.message : e}`);
    return false;
  } finally {
    await pool.end();
  }
}

function printHetznerSnippet(secret) {
  console.log("\n--- Hetzner site_config.json (add or merge) ---");
  console.log(
    JSON.stringify(
      {
        clevafarm_api_secret: secret || "<same-as-CLEVAFARM_API_SECRET>",
        clevafarm_api_url: process.env.FARM_API_BASE_URL || "https://farmapi.clevacredit.com",
        farm_manager_dashboard_url: "https://farm.clevacredit.com",
      },
      null,
      2
    )
  );
  console.log("Then: bench --site erp.clevacredit.com clear-cache && restart web/workers\n");
}

async function main() {
  loadDotEnvIfPresent();

  const farmBase = process.env.FARM_API_BASE_URL || "https://farmapi.clevacredit.com";
  process.env.ERPNEXT_BASE_URL = process.env.ERPNEXT_BASE_URL || "https://erp.clevacredit.com";

  console.log(`Farm API: ${farmBase}`);
  console.log(`ERPNext:  ${process.env.ERPNEXT_BASE_URL}\n`);

  const results = [];

  if (!process.env.CLEVAFARM_API_SECRET) {
    console.error("❌ CLEVAFARM_API_SECRET missing locally — cannot run integration checks.");
    console.error("   Copy from Render after setup, or generate: openssl rand -hex 32");
    printHetznerSnippet("");
    process.exitCode = 1;
    return;
  }

  results.push(await checkSecretConfigured());
  results.push(await checkFarmReconciliation(farmBase));
  results.push(await checkFarmInboundWebhook(farmBase));
  results.push(await checkErpnextReceive());
  results.push(await checkErpnextRest());
  results.push(await checkOutboxStats());

  const failed = results.filter((r) => !r).length;
  if (failed > 0) {
    printHetznerSnippet(process.env.CLEVAFARM_API_SECRET);
    process.exitCode = 1;
    console.error(`\n${failed} check(s) failed.`);
  } else {
    console.log("\n✅ All ClevaFarm connection checks passed.");
  }
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
