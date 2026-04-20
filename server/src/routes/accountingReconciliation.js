/**
 * Accounting Reconciliation & Observability Routes
 *
 * GET /api/accounting-reconciliation/summary
 *   Returns aggregate totals per event type with Odoo sync status breakdown.
 *   Use this to confirm farm transaction totals match Odoo drafts.
 *
 * GET /api/accounting-reconciliation/stale-pending
 *   Returns farm records stuck in pending_approval or approved (not yet synced)
 *   older than a threshold — operational alert feed.
 *
 * GET /api/accounting-reconciliation/failed-outbox
 *   Returns all failed outbox rows for support runbook.
 *
 * GET /api/accounting-reconciliation/sync-health
 *   Returns a health summary: total queued, sent, failed, retryable counts.
 */

import express from "express";

const router = express.Router();

let _dbQuery = null;
let _hasDb = null;

export function initReconciliationRouter(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("reconciliation: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() { return typeof _hasDb === "function" ? _hasDb() : false; }

const ROLE_RANK = {
  laborer: 1, dispatcher: 1, procurement_officer: 1, sales_coordinator: 1,
  vet: 2, vet_manager: 3, manager: 3, investor: 0, superuser: 99,
};
function isManagerOrAbove(user) {
  return (ROLE_RANK[user?.role] ?? -1) >= ROLE_RANK["manager"];
}

/**
 * GET /api/accounting-reconciliation/summary
 * Per event type: count of farm records, sum of value, outbox status counts.
 * Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get("/summary", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });

  const from = String(req.query.from ?? "").slice(0, 10) || null;
  const to = String(req.query.to ?? "").slice(0, 10) || null;

  try {
    // Feed procurements
    const feedR = await dbQuery(
      `SELECT accounting_status AS status, COUNT(*) AS count,
              COALESCE(SUM(quantity_kg * unit_cost_rwf_per_kg), 0) AS total_rwf
         FROM farm_inventory_transactions
        WHERE transaction_type = 'procurement_receipt'
          AND ($1::date IS NULL OR recorded_at::date >= $1::date)
          AND ($2::date IS NULL OR recorded_at::date <= $2::date)
        GROUP BY accounting_status`,
      [from, to]
    );

    const medR = await dbQuery(
      `SELECT accounting_status AS status, COUNT(*) AS count,
              COALESCE(SUM(total_cost_rwf), 0) AS total_rwf
         FROM medicine_lots
        WHERE ($1::date IS NULL OR received_at >= $1::date)
          AND ($2::date IS NULL OR received_at <= $2::date)
        GROUP BY accounting_status`,
      [from, to]
    );

    const slaughterR = await dbQuery(
      `SELECT accounting_status AS status, COUNT(*) AS count,
              COALESCE(SUM(fair_value_rwf), 0) AS total_rwf
         FROM flock_slaughter_events
        WHERE ($1::date IS NULL OR at::date >= $1::date)
          AND ($2::date IS NULL OR at::date <= $2::date)
        GROUP BY accounting_status`,
      [from, to]
    );

    const salesR = await dbQuery(
      `SELECT accounting_status AS status, COUNT(*) AS count,
              COALESCE(SUM(total_weight_kg * price_per_kg), 0) AS total_rwf
         FROM poultry_sales_orders
        WHERE ($1::date IS NULL OR order_date >= $1::date)
          AND ($2::date IS NULL OR order_date <= $2::date)
        GROUP BY accounting_status`,
      [from, to]
    );

    const valuationR = await dbQuery(
      `SELECT status, COUNT(*) AS count,
              COALESCE(SUM(total_fair_value_rwf), 0) AS total_rwf
         FROM flock_valuation_snapshots
        WHERE ($1::date IS NULL OR snapshot_date >= $1::date)
          AND ($2::date IS NULL OR snapshot_date <= $2::date)
        GROUP BY status`,
      [from, to]
    );

    function pivot(rows) {
      return rows.reduce((acc, r) => {
        acc[r.status] = { count: Number(r.count), totalRwf: Number(r.total_rwf) };
        return acc;
      }, {});
    }

    res.json({
      period: { from, to },
      feedProcurements: pivot(feedR.rows),
      medicinePurchases: pivot(medR.rows),
      slaughterConversions: pivot(slaughterR.rows),
      meatSales: pivot(salesR.rows),
      flockValuations: pivot(valuationR.rows),
    });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * GET /api/accounting-reconciliation/stale-pending
 * Records in pending_approval or approved state older than staleHours (default 48).
 */
router.get("/stale-pending", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  const staleHours = Math.max(1, Number(req.query.stale_hours ?? 48));

  try {
    const threshold = `${staleHours} hours`;

    const feedR = await dbQuery(
      `SELECT id::text AS id, 'feed_purchase' AS event_type,
              recorded_at AS event_at, accounting_status,
              (quantity_kg * COALESCE(unit_cost_rwf_per_kg, 0)) AS estimated_rwf
         FROM farm_inventory_transactions
        WHERE transaction_type = 'procurement_receipt'
          AND accounting_status IN ('pending_approval','approved')
          AND recorded_at < now() - ($1::text || ' hours')::interval`,
      [String(staleHours)]
    );

    const medR = await dbQuery(
      `SELECT id::text AS id, 'medicine_purchase' AS event_type,
              received_at AS event_at, accounting_status,
              COALESCE(total_cost_rwf, 0) AS estimated_rwf
         FROM medicine_lots
        WHERE accounting_status IN ('pending_approval','approved')
          AND received_at < now() - ($1::text || ' hours')::interval`,
      [String(staleHours)]
    );

    const slaughterR = await dbQuery(
      `SELECT id, 'slaughter_conversion' AS event_type,
              at AS event_at, accounting_status,
              COALESCE(fair_value_rwf, 0) AS estimated_rwf
         FROM flock_slaughter_events
        WHERE accounting_status IN ('pending_approval','approved')
          AND at < now() - ($1::text || ' hours')::interval`,
      [String(staleHours)]
    );

    const salesR = await dbQuery(
      `SELECT id::text AS id, 'meat_sale' AS event_type,
              order_date AS event_at, accounting_status,
              (total_weight_kg * price_per_kg) AS estimated_rwf
         FROM poultry_sales_orders
        WHERE accounting_status IN ('pending_approval','approved')
          AND order_date < now() - ($1::text || ' hours')::interval`,
      [String(staleHours)]
    );

    const stale = [
      ...feedR.rows,
      ...medR.rows,
      ...slaughterR.rows,
      ...salesR.rows,
    ].sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());

    res.json({ staleHours, totalStale: stale.length, items: stale });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * GET /api/accounting-reconciliation/failed-outbox
 * Returns failed outbox rows for support runbook / retry triage.
 */
router.get("/failed-outbox", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, source_table AS "sourceTable", source_id AS "sourceId",
              event_type AS "eventType", status, attempts, last_attempted_at AS "lastAttemptedAt",
              last_error AS "lastError", created_at AS "createdAt"
         FROM odoo_sync_outbox
        WHERE status = 'failed'
        ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * GET /api/accounting-reconciliation/sync-health
 * One-call health summary for dashboards / alerts.
 */
router.get("/sync-health", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  try {
    const r = await dbQuery(
      `SELECT status, COUNT(*) AS count
         FROM odoo_sync_outbox
        GROUP BY status`
    );

    const counts = r.rows.reduce((acc, row) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 });

    const totalPendingApproval = await dbQuery(
      `SELECT (
         SELECT COUNT(*) FROM farm_inventory_transactions WHERE accounting_status = 'pending_approval'
       ) + (
         SELECT COUNT(*) FROM medicine_lots WHERE accounting_status = 'pending_approval'
       ) + (
         SELECT COUNT(*) FROM flock_slaughter_events WHERE accounting_status = 'pending_approval'
       ) + (
         SELECT COUNT(*) FROM poultry_sales_orders WHERE accounting_status = 'pending_approval'
       ) AS total`
    );

    res.json({
      outbox: counts,
      pendingManagerApproval: Number(totalPendingApproval.rows[0]?.total ?? 0),
      healthy: counts.failed === 0 && Number(totalPendingApproval.rows[0]?.total ?? 0) === 0,
      alertLevel: counts.failed > 0 ? "error" : Number(totalPendingApproval.rows[0]?.total ?? 0) > 0 ? "warn" : "ok",
    });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

export default router;
