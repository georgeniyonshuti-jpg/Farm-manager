#!/usr/bin/env node
/**
 * Diff Farm canonical entity registry vs ERPNext entity_registry.json.
 *
 * Usage:
 *   node scripts/diff-clevafarm-registry.js --erpnext=/path/to/entity_registry.json
 *   node scripts/diff-clevafarm-registry.js --farm=docs/clevafarm-entity-registry.json --erpnext=...
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs() {
  let farm = path.join(root, "docs/clevafarm-entity-registry.json");
  let erpnext = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--farm=")) farm = arg.slice("--farm=".length);
    if (arg.startsWith("--erpnext=")) erpnext = arg.slice("--erpnext=".length);
  }
  if (!erpnext) {
    console.error("Usage: node scripts/diff-clevafarm-registry.js --erpnext=/path/to/entity_registry.json");
    process.exit(2);
  }
  return { farm, erpnext };
}

function loadRegistry(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`${label} registry not found: ${filePath}`);
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entities = doc.entities || doc;
  if (!Array.isArray(entities)) {
    console.error(`${label} registry invalid: expected entities array`);
    process.exit(2);
  }
  const map = new Map();
  for (const e of entities) {
    if (e.entityType) map.set(e.entityType, e);
  }
  return map;
}

const FIELDS = ["postgresTable", "erpnextDoctype", "idType", "inboundSupported"];

function main() {
  const { farm, erpnext } = parseArgs();
  const farmMap = loadRegistry(farm, "Farm");
  const erpMap = loadRegistry(erpnext, "ERPNext");

  const allTypes = new Set([...farmMap.keys(), ...erpMap.keys()]);
  const mismatches = [];

  for (const entityType of [...allTypes].sort()) {
    const f = farmMap.get(entityType);
    const e = erpMap.get(entityType);
    if (!f) {
      mismatches.push({ entityType, issue: "missing on Farm" });
      continue;
    }
    if (!e) {
      mismatches.push({ entityType, issue: "missing on ERPNext" });
      continue;
    }
    for (const field of FIELDS) {
      const fv = f[field];
      const ev = e[field];
      const legacyFarm = field === "postgresTable" ? f.postgresTable || f.legacy_table : fv;
      const legacyErp = field === "postgresTable" ? e.postgresTable || e.legacy_table : ev;
      if (legacyFarm !== legacyErp) {
        mismatches.push({
          entityType,
          field,
          farm: legacyFarm,
          erpnext: legacyErp,
        });
      }
    }
  }

  if (mismatches.length === 0) {
    console.log(`OK — ${allTypes.size} entity types match (${path.basename(farm)} vs ${path.basename(erpnext)})`);
    process.exit(0);
  }

  console.error(`Registry mismatch: ${mismatches.length} issue(s)\n`);
  for (const m of mismatches) {
    if (m.issue) {
      console.error(`  ${m.entityType}: ${m.issue}`);
    } else {
      console.error(`  ${m.entityType}.${m.field}: Farm=${JSON.stringify(m.farm)} ERPNext=${JSON.stringify(m.erpnext)}`);
    }
  }
  process.exit(1);
}

main();
