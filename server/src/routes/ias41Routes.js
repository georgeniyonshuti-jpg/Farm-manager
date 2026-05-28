/**
 * IAS 41 Biological Asset Valuation Routes
 *
 * POST /api/ias41/valuation-snapshots            — create draft snapshot
 * PATCH /api/ias41/valuation-snapshots/:id/approve — manager approves + enqueues Odoo entry
 * GET  /api/ias41/valuation-snapshots             — list snapshots (optional ?flock_id=&status=)
 *
 * All routes require manager or superuser.
 */

import express from "express";
import {
  buildValuationSnapshot,
  approveValuationSnapshot,
  listValuationSnapshots,
  initIas41Service,
} from "../services/ias41Valuation.js";

const router = express.Router();

export { initIas41Service };

function isManagerOrAbove(user) {
  return user?.role === "manager" || user?.role === "superuser";
}

/**
 * POST /api/ias41/valuation-snapshots
 * Body: { flockId, snapshotDate, marketPricePerKgRwf, costsToSellPerKgRwf? }
 */
router.post("/valuation-snapshots", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const snapshotDate = String(body.snapshotDate ?? "").slice(0, 10);
  const marketPricePerKgRwf = Number(body.marketPricePerKgRwf);
  const costsToSellPerKgRwf = Number(body.costsToSellPerKgRwf ?? 0);

  if (!flockId || !snapshotDate) {
    return res.status(400).json({ error: "flockId and snapshotDate are required." });
  }
  if (!Number.isFinite(marketPricePerKgRwf) || marketPricePerKgRwf <= 0) {
    return res.status(400).json({ error: "marketPricePerKgRwf must be > 0." });
  }

  try {
    const snapshot = await buildValuationSnapshot({
      flockId,
      snapshotDate,
      marketPricePerKgRwf,
      costsToSellPerKgRwf,
      createdBy: req.authUser.id,
    });
    res.status(201).json({ snapshot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

/**
 * PATCH /api/ias41/valuation-snapshots/:id/approve
 */
router.patch("/valuation-snapshots/:id/approve", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  try {
    const snapshot = await approveValuationSnapshot({
      snapshotId: req.params.id,
      approvedBy: req.authUser.id,
      approvedByRole: req.authUser.role,
    });
    res.json({ ok: true, snapshot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

/**
 * GET /api/ias41/valuation-snapshots
 * Query: ?flock_id=...&status=draft|approved|posted
 */
router.get("/valuation-snapshots", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  const flockId = String(req.query.flock_id ?? "").trim() || null;
  const status = String(req.query.status ?? "").trim() || null;
  try {
    const snapshots = await listValuationSnapshots({ flockId, status });
    res.json({ snapshots });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

export default router;
