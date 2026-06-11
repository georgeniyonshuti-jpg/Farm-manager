/**
 * ClevaFarm reconciliation API — ERPNext pulls entity snapshots since a timestamp.
 */

import express from "express";
import { requireClevaFarmSecret } from "../services/clevafarm/clevafarmSecret.js";
import { isValidEntityType } from "../services/clevafarm/entityRegistry.js";
import { listEntitiesSince } from "../services/clevafarm/reconciliationQuery.js";

const router = express.Router();

let _dbQuery = null;

export function initClevaFarmEntitiesRouter(dbQueryFn) {
  _dbQuery = dbQueryFn;
}

router.get("/:entityType", requireClevaFarmSecret, async (req, res) => {
  const { entityType } = req.params;
  const { updatedSince } = req.query;

  if (!isValidEntityType(entityType)) {
    res.status(400).json({ error: `Unknown entityType: ${entityType}` });
    return;
  }
  if (!_dbQuery) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }

  try {
    const records = await listEntitiesSince(entityType, updatedSince || null, _dbQuery);
    res.json({ records });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Invalid updatedSince")) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error("[clevafarm-sync] reconciliation error:", msg);
    res.status(500).json({ error: "Failed to list entities" });
  }
});

export default router;
