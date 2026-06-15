#!/usr/bin/env node
/**
 * Export canonical ClevaFarm entity registry JSON for ERPNext coordination.
 *
 * Usage:
 *   node scripts/export-clevafarm-registry.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITY_DEPENDENCY_ORDER,
  ENTITY_DEFS,
  TEXT_PK_ENTITIES,
} from "../server/src/services/clevafarm/entityRegistry.js";
import { ENTITY_ERPNEXT_DOCTYPE } from "../server/src/services/clevafarm/migrationMap.js";
import { INBOUND_ERPNEXT_ENTITY_TYPES } from "../server/src/services/clevafarm/inboundMappers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "docs/clevafarm-entity-registry.json");

const inboundSet = new Set(INBOUND_ERPNEXT_ENTITY_TYPES);

const doc = {
  version: 1,
  generatedAt: new Date().toISOString(),
  entities: ENTITY_DEPENDENCY_ORDER.map((entityType) => {
    const def = ENTITY_DEFS[entityType];
    return {
      entityType,
      postgresTable: def.table,
      erpnextDoctype: ENTITY_ERPNEXT_DOCTYPE[entityType] || null,
      idColumn: def.idColumn,
      idType: TEXT_PK_ENTITIES.has(entityType) ? "text" : "uuid",
      inboundSupported: inboundSet.has(entityType),
      outboundSupported: entityType !== "farm_migration_map",
      updatedSinceSql: def.updatedSinceSql,
      omitPayloadFields: def.omitPayloadFields || [],
    };
  }),
};

fs.writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${outPath} (${doc.entities.length} entities)`);
