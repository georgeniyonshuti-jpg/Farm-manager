/**
 * Accounting Approvals Router
 *
 * Provides approval management and Odoo dispatch endpoints for all
 * money-impacting farm operations:
 *   - Feed procurement approvals
 *   - Medicine lot purchase approvals
 *   - Slaughter event accounting approvals
 *   - Sales order creation + approvals
 *   - Outbox management (list pending, retry failed)
 *
 * Role rules (mirror existing server.js patterns):
 *   ROLE_RANK >= manager (3) = auto-approved + enqueued immediately
 *   ROLE_RANK >= vet_manager (3) = can review/approve
 *   Lower roles = pending_approval (cannot trigger Odoo push)
 */

import express from "express";
import {
  mapFeedProcurementToBill,
  mapMedicineLotToBill,
  mapSlaughterToJournalEntry,
  mapSaleOrderToInvoice,
} from "../services/odoo/odooFarmMappers.js";
import {
  enqueueOdooSync,
  processOdooSyncOutbox,
  retryOutboxRow,
} from "../services/odoo/odooSyncWorker.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Internal helpers (shared with server.js pattern)
// ─────────────────────────────────────────────────────────────

const ROLE_RANK = {
  laborer: 1, dispatcher: 1, procurement_officer: 1, sales_coordinator: 1,
  vet: 2, vet_manager: 3, manager: 3, investor: 0, superuser: 99,
};

function roleAtLeast(user, minRole) {
  const rank = ROLE_RANK[user?.role] ?? -1;
  const min = ROLE_RANK[minRole] ?? 999;
  return rank >= min;
}

function isManagerOrAbove(user) { return roleAtLeast(user, "manager"); }

// ─────────────────────────────────────────────────────────────
// Helpers injected at router init time
// ─────────────────────────────────────────────────────────────

let _dbQuery = null;
let _hasDb = null;

export function initAccountingApprovalsRouter(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("accountingApprovals: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() { return typeof _hasDb === "function" ? _hasDb() : false; }

// ─────────────────────────────────────────────────────────────
// 1. Feed Procurement — accounting approval
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/accounting-approvals/feed-procurements/pending
 * List feed procurement rows awaiting accounting approval.
 */
router.get("/feed-procurements/pending", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const r = await dbQuery(
      `SELECT t.id::text AS id, t.recorded_at AS "recordedAt", t.quantity_kg AS "quantityKg",
              t.unit_cost_rwf_per_kg AS "unitCostRwfPerKg", t.feed_type AS "feedType",
              t.supplier_name AS "supplierName", t.reference, t.reason,
              t.accounting_status AS "accountingStatus",
              u.full_name AS "actorName"
         FROM farm_inventory_transactions t
         LEFT JOIN users u ON u.id::text = t.actor_user_id::text
        WHERE t.transaction_type = 'procurement_receipt'
          AND t.accounting_status = 'pending_approval'
        ORDER BY t.recorded_at DESC LIMIT 200`
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/feed-procurements/:id/approve
 * Approve a feed procurement for Odoo sync.
 */
router.patch("/feed-procurements/:id/approve", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const id = req.params.id;
  try {
    const r = await dbQuery(
      `UPDATE farm_inventory_transactions
          SET accounting_status = 'approved',
              accounting_approved_by = $2,
              accounting_approved_at = now(),
              updated_at = now()
        WHERE id::text = $1
          AND accounting_status = 'pending_approval'
        RETURNING id::text AS id, transaction_type AS type, recorded_at AS "recordedAt",
                  quantity_kg AS "quantityKg", unit_cost_rwf_per_kg AS "unitCostRwfPerKg",
                  feed_type AS "feedType", supplier_name AS "supplierName", reference`,
      [id, req.authUser.id]
    );
    if ((r.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Row not found or already approved." });
    }
    const row = r.rows[0];
    const payload = mapFeedProcurementToBill({ ...row, at: row.recordedAt });
    await enqueueOdooSync({
      sourceTable: "farm_inventory_transactions",
      sourceId: id,
      eventType: "feed_purchase",
      payload,
      triggeredByUserId: req.authUser.id,
      triggeredByRole: req.authUser.role,
    });
    // Kick off worker async (don't await to keep response fast)
    processOdooSyncOutbox(5).catch(() => {});
    res.json({ ok: true, row });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Approval failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Medicine Lot Purchases — accounting approval
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/accounting-approvals/medicine-lots/pending
 */
router.get("/medicine-lots/pending", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const r = await dbQuery(
      `SELECT l.id::text AS id, l.lot_number AS "lotNumber", l.received_at AS "receivedAt",
              l.quantity_received AS "quantityReceived", l.unit_cost_rwf AS "unitCostRwf",
              l.total_cost_rwf AS "totalCostRwf", l.supplier, l.invoice_ref AS "invoiceRef",
              l.accounting_status AS "accountingStatus",
              m.name AS "medicineName"
         FROM medicine_lots l
         JOIN medicine_inventory m ON m.id = l.medicine_id
        WHERE l.accounting_status = 'pending_approval'
        ORDER BY l.received_at DESC LIMIT 200`
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/medicine-lots/:id/approve
 */
router.patch("/medicine-lots/:id/approve", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const id = req.params.id;
  try {
    const r = await dbQuery(
      `UPDATE medicine_lots
          SET accounting_status = 'approved',
              accounting_approved_by = $2,
              accounting_approved_at = now()
        WHERE id::text = $1
          AND accounting_status = 'pending_approval'
        RETURNING id::text AS id, lot_number AS "lotNumber", received_at AS "receivedAt",
                  quantity_received AS "quantityReceived", unit_cost_rwf AS "unitCostRwf",
                  supplier, medicine_id AS "medicineId"`,
      [id, req.authUser.id]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Lot not found or already approved." });
    const lot = r.rows[0];

    // Fetch medicine name
    let medicineName = "Medicine";
    try {
      const mRow = await dbQuery(`SELECT name FROM medicine_inventory WHERE id = $1::uuid`, [lot.medicineId]);
      if (mRow.rows[0]) medicineName = mRow.rows[0].name;
    } catch {}

    const payload = mapMedicineLotToBill({ ...lot, medicineName });
    await enqueueOdooSync({
      sourceTable: "medicine_lots",
      sourceId: id,
      eventType: "medicine_purchase",
      payload,
      triggeredByUserId: req.authUser.id,
      triggeredByRole: req.authUser.role,
    });
    processOdooSyncOutbox(5).catch(() => {});
    res.json({ ok: true, lot });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Approval failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Slaughter Events — accounting approval
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/accounting-approvals/slaughter-events/pending
 */
router.get("/slaughter-events/pending", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const r = await dbQuery(
      `SELECT s.id, s.flock_id AS "flockId", s.at, s.birds_slaughtered AS "birdsSlaughtered",
              s.avg_live_weight_kg AS "avgLiveWeightKg", s.avg_carcass_weight_kg AS "avgCarcassWeightKg",
              s.price_per_kg_rwf AS "pricePerKgRwf", s.fair_value_rwf AS "fairValueRwf",
              s.accounting_status AS "accountingStatus",
              f.code AS "flockCode"
         FROM flock_slaughter_events s
         LEFT JOIN poultry_flocks f ON f.id::text = s.flock_id
        WHERE s.accounting_status = 'pending_approval'
        ORDER BY s.at DESC LIMIT 200`
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/slaughter-events/:id/approve
 * Body: { fairValueRwf, carryingValueRwf }
 */
router.patch("/slaughter-events/:id/approve", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const id = req.params.id;
  const fairValueRwf = Number(req.body?.fairValueRwf ?? 0);
  const carryingValueRwf = Number(req.body?.carryingValueRwf ?? fairValueRwf);
  try {
    const r = await dbQuery(
      `UPDATE flock_slaughter_events
          SET accounting_status = 'approved',
              accounting_approved_by = $2,
              accounting_approved_at = now(),
              fair_value_rwf = $3,
              fair_value_basis = 'manager_approved'
        WHERE id = $1
          AND accounting_status = 'pending_approval'
        RETURNING id, flock_id AS "flockId", at, birds_slaughtered AS "birdsSlaughtered",
                  avg_live_weight_kg AS "avgLiveWeightKg", avg_carcass_weight_kg AS "avgCarcassWeightKg",
                  fair_value_rwf AS "fairValueRwf"`,
      [id, req.authUser.id, fairValueRwf]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Slaughter event not found or already approved." });
    const event = r.rows[0];

    // Fetch flock code
    let flockCode = null;
    try {
      const fRow = await dbQuery(`SELECT code FROM poultry_flocks WHERE id::text = $1`, [event.flockId]);
      flockCode = fRow.rows[0]?.code ?? null;
    } catch {}

    const payload = mapSlaughterToJournalEntry({ ...event, flockCode }, { carryingValueRwf });
    await enqueueOdooSync({
      sourceTable: "flock_slaughter_events",
      sourceId: id,
      eventType: "slaughter_conversion",
      payload,
      triggeredByUserId: req.authUser.id,
      triggeredByRole: req.authUser.role,
    });
    processOdooSyncOutbox(5).catch(() => {});
    res.json({ ok: true, event });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Approval failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Sales Orders — create, review, approve
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/accounting-approvals/sales-orders
 * Create a meat/bird sale. Manager+ auto-approves + enqueues Odoo invoice.
 * Lower roles => pending_review.
 * Body: { flockId, orderDate, numberOfBirds, totalWeightKg, pricePerKg, buyerName, buyerEmail, buyerContact }
 */
router.post("/sales-orders", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!roleAtLeast(req.authUser, "vet_manager")) {
    return res.status(403).json({ error: "Vet manager or above required to record a sale." });
  }
  const body = req.body ?? {};
  const flockId = String(body.flockId ?? "").trim();
  const orderDate = String(body.orderDate ?? "").slice(0, 10);
  const numberOfBirds = Number(body.numberOfBirds);
  const totalWeightKg = Number(body.totalWeightKg);
  const pricePerKg = Number(body.pricePerKg);
  const buyerName = String(body.buyerName ?? "").trim() || null;
  const buyerEmail = String(body.buyerEmail ?? "").trim() || null;
  const buyerContact = String(body.buyerContact ?? "").trim() || null;

  if (!flockId || !orderDate || !Number.isFinite(numberOfBirds) || numberOfBirds <= 0 ||
      !Number.isFinite(totalWeightKg) || totalWeightKg <= 0 ||
      !Number.isFinite(pricePerKg) || pricePerKg < 0) {
    return res.status(400).json({ error: "flockId, orderDate, numberOfBirds, totalWeightKg, pricePerKg are required." });
  }

  const autoApproved = isManagerOrAbove(req.authUser);
  const submissionStatus = autoApproved ? "approved" : "pending_review";
  const accountingStatus = autoApproved ? "approved" : "pending_approval";

  try {
    const r = await dbQuery(
      `INSERT INTO poultry_sales_orders
         (flock_id, recorded_by, order_date, number_of_birds, total_weight_kg, price_per_kg,
          buyer_name, buyer_email, buyer_contact, submission_status, accounting_status)
       VALUES ($1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, $11)
       RETURNING id::text AS id, flock_id::text AS "flockId", order_date AS "orderDate",
                 number_of_birds AS "numberOfBirds", total_weight_kg AS "totalWeightKg",
                 price_per_kg AS "pricePerKg", buyer_name AS "buyerName", buyer_email AS "buyerEmail",
                 submission_status AS "submissionStatus", accounting_status AS "accountingStatus"`,
      [flockId, req.authUser.id, orderDate, numberOfBirds, totalWeightKg, pricePerKg,
       buyerName, buyerEmail, buyerContact, submissionStatus, accountingStatus]
    );
    const order = r.rows[0];

    if (autoApproved) {
      const payload = mapSaleOrderToInvoice({ ...order, buyerContact });
      await enqueueOdooSync({
        sourceTable: "poultry_sales_orders",
        sourceId: order.id,
        eventType: "meat_sale",
        payload,
        triggeredByUserId: req.authUser.id,
        triggeredByRole: req.authUser.role,
      });
      processOdooSyncOutbox(5).catch(() => {});
    }

    res.status(201).json({ order });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create sale." });
  }
});

/**
 * GET /api/accounting-approvals/sales-orders
 * List sales orders with optional status filter.
 */
router.get("/sales-orders", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!roleAtLeast(req.authUser, "vet_manager")) return res.status(403).json({ error: "Vet manager or above required." });
  const status = String(req.query.status ?? "").trim() || null;
  try {
    const r = await dbQuery(
      `SELECT s.id::text AS id, s.flock_id::text AS "flockId", s.order_date AS "orderDate",
              s.number_of_birds AS "numberOfBirds", s.total_weight_kg AS "totalWeightKg",
              s.price_per_kg AS "pricePerKg", s.buyer_name AS "buyerName",
              s.submission_status AS "submissionStatus",
              s.accounting_status AS "accountingStatus",
              f.code AS "flockCode",
              COALESCE(l.odoo_move_name, '') AS "odooMoveName",
              COALESCE(l.odoo_move_state, '') AS "odooMoveState"
         FROM poultry_sales_orders s
         LEFT JOIN poultry_flocks f ON f.id = s.flock_id
         LEFT JOIN odoo_sync_links l ON l.source_table = 'poultry_sales_orders' AND l.source_id = s.id::text
        WHERE ($1::text IS NULL OR s.submission_status = $1::text)
        ORDER BY s.order_date DESC LIMIT 200`,
      [status]
    );
    res.json({ orders: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/sales-orders/:id/review
 * Body: { action: 'approve'|'reject', reviewNotes?: string }
 */
router.patch("/sales-orders/:id/review", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const id = req.params.id;
  const action = String(req.body?.action ?? "");
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 2000) || null;
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }
  const newStatus = action === "approve" ? "approved" : "rejected";
  const newAccounting = action === "approve" ? "approved" : "not_applicable";
  try {
    const r = await dbQuery(
      `UPDATE poultry_sales_orders
          SET submission_status = $2, accounting_status = $3,
              reviewed_by = $4, reviewed_at = now(), review_notes = $5, updated_at = now()
        WHERE id::text = $1 AND submission_status = 'pending_review'
        RETURNING id::text AS id, flock_id::text AS "flockId", order_date AS "orderDate",
                  number_of_birds AS "numberOfBirds", total_weight_kg AS "totalWeightKg",
                  price_per_kg AS "pricePerKg", buyer_name AS "buyerName", buyer_email AS "buyerEmail"`,
      [id, newStatus, newAccounting, req.authUser.id, reviewNotes]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Order not found or not pending." });
    const order = r.rows[0];

    if (action === "approve") {
      const payload = mapSaleOrderToInvoice(order);
      await enqueueOdooSync({
        sourceTable: "poultry_sales_orders",
        sourceId: id,
        eventType: "meat_sale",
        payload,
        triggeredByUserId: req.authUser.id,
        triggeredByRole: req.authUser.role,
      });
      processOdooSyncOutbox(5).catch(() => {});
    }

    res.json({ ok: true, status: newStatus, order });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Review failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Outbox management
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/accounting-approvals/odoo-outbox
 * List recent outbox rows for monitoring.
 */
router.get("/odoo-outbox", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const status = String(req.query.status ?? "").trim() || null;
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, source_table AS "sourceTable", source_id AS "sourceId",
              event_type AS "eventType", status, attempts, last_attempted_at AS "lastAttemptedAt",
              last_error AS "lastError", odoo_move_id AS "odooMoveId", odoo_move_name AS "odooMoveName",
              odoo_move_state AS "odooMoveState", created_at AS "createdAt"
         FROM odoo_sync_outbox
        WHERE ($1::text IS NULL OR status = $1::text)
        ORDER BY created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * POST /api/accounting-approvals/odoo-outbox/:id/retry
 * Manually retry a failed outbox row.
 */
router.post("/odoo-outbox/:id/retry", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const result = await retryOutboxRow(req.params.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Retry failed." });
  }
});

/**
 * GET /api/accounting-approvals/event-configs
 * Returns accounting event config labels for manager UI (no account codes exposed).
 */
router.get("/event-configs", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  try {
    const r = await dbQuery(
      `SELECT event_type AS "eventType", label, description, odoo_move_type AS "odooMoveType"
         FROM accounting_event_configs
        WHERE active = true
        ORDER BY event_type`
    );
    res.json({ configs: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 6. Payroll period closure → Odoo wage expense
// ─────────────────────────────────────────────────────────────

import { mapPayrollClosureToJournalEntry } from "../services/odoo/odooFarmMappers.js";

/**
 * POST /api/accounting-approvals/payroll-closures
 * Manager closes a payroll period: sums all approved payroll_impact rows in range,
 * creates a payroll_period_closures record, and enqueues the Odoo journal entry.
 * Body: { periodStart, periodEnd, notes? }
 */
router.post("/payroll-closures", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const body = req.body ?? {};
  const periodStart = String(body.periodStart ?? "").slice(0, 10);
  const periodEnd = String(body.periodEnd ?? "").slice(0, 10);
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;
  if (!periodStart || !periodEnd) return res.status(400).json({ error: "periodStart and periodEnd are required." });

  try {
    // Sum approved payroll rows in period
    const totals = await dbQuery(
      `SELECT
         COUNT(DISTINCT user_id)::int AS worker_count,
         COALESCE(SUM(CASE WHEN rwf_delta > 0 THEN rwf_delta ELSE 0 END), 0) AS total_credits,
         COALESCE(SUM(CASE WHEN rwf_delta < 0 THEN ABS(rwf_delta) ELSE 0 END), 0) AS total_deductions,
         COALESCE(SUM(rwf_delta), 0) AS net_payroll
         FROM payroll_impact
        WHERE period_start >= $1::date
          AND period_end <= $2::date
          AND approved_at IS NOT NULL`,
      [periodStart, periodEnd]
    );
    const t = totals.rows[0];
    const netPayrollRwf = Number(t.net_payroll);
    if (netPayrollRwf === 0) return res.status(400).json({ error: "No approved payroll rows in this period." });

    const ins = await dbQuery(
      `INSERT INTO payroll_period_closures
         (period_start, period_end, total_credits_rwf, total_deductions_rwf, net_payroll_rwf, worker_count, approved_by, notes)
       VALUES ($1::date, $2::date, $3::numeric, $4::numeric, $5::numeric, $6, $7, $8)
       ON CONFLICT (period_start, period_end) DO UPDATE
         SET total_credits_rwf = EXCLUDED.total_credits_rwf,
             total_deductions_rwf = EXCLUDED.total_deductions_rwf,
             net_payroll_rwf = EXCLUDED.net_payroll_rwf,
             worker_count = EXCLUDED.worker_count,
             approved_by = EXCLUDED.approved_by,
             notes = EXCLUDED.notes,
             accounting_status = 'approved',
             approved_at = now()
       RETURNING id::text AS id`,
      [periodStart, periodEnd, t.total_credits, t.total_deductions, netPayrollRwf, t.worker_count, req.authUser.id, notes]
    );
    const closureId = ins.rows[0].id;

    const payload = mapPayrollClosureToJournalEntry({
      id: closureId, periodStart, periodEnd, netPayrollRwf,
      totalCreditsRwf: Number(t.total_credits),
      totalDeductionsRwf: Number(t.total_deductions),
      workerCount: t.worker_count,
    });

    if (payload) {
      await enqueueOdooSync({
        sourceTable: "payroll_period_closures",
        sourceId: closureId,
        eventType: "payroll_wages",
        payload,
        triggeredByUserId: req.authUser.id,
        triggeredByRole: req.authUser.role,
      });
      processOdooSyncOutbox(5).catch(() => {});
    }

    res.status(201).json({ ok: true, closureId, periodStart, periodEnd, netPayrollRwf, workerCount: t.worker_count });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Payroll closure failed." });
  }
});

/**
 * GET /api/accounting-approvals/payroll-closures
 */
router.get("/payroll-closures", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const r = await dbQuery(
      `SELECT id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
              total_credits_rwf AS "totalCreditsRwf", total_deductions_rwf AS "totalDeductionsRwf",
              net_payroll_rwf AS "netPayrollRwf", worker_count AS "workerCount",
              accounting_status AS "accountingStatus", odoo_move_name AS "odooMoveName",
              notes, approved_at AS "approvedAt"
         FROM payroll_period_closures
        ORDER BY period_start DESC LIMIT 60`
    );
    res.json({ closures: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Flock opening (chick purchase) — biological asset recognition
// ─────────────────────────────────────────────────────────────

import { mapFlockOpeningToBill } from "../services/odoo/odooFarmMappers.js";

/**
 * POST /api/accounting-approvals/flock-openings/:flockId/send-to-odoo
 * Manager sends the initial chick purchase bill to Odoo.
 * The flock must have purchase_cost_rwf set.
 */
router.post("/flock-openings/:flockId/send-to-odoo", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { flockId } = req.params;
  const body = req.body ?? {};

  try {
    // Upsert purchase cost onto the flock
    const purchaseCostRwf = body.purchaseCostRwf != null ? Number(body.purchaseCostRwf) : null;
    const purchaseSupplier = body.purchaseSupplier ? String(body.purchaseSupplier).trim() : null;
    const purchaseDate = body.purchaseDate ? String(body.purchaseDate).slice(0, 10) : null;

    const r = await dbQuery(
      `UPDATE poultry_flocks
          SET purchase_cost_rwf = COALESCE($2::numeric, purchase_cost_rwf),
              purchase_supplier = COALESCE($3, purchase_supplier),
              purchase_date = COALESCE($4::date, purchase_date),
              bio_asset_accounting_status = 'approved'
        WHERE id::text = $1
        RETURNING id::text AS id, code, initial_count AS "initialCount",
                  purchase_cost_rwf AS "purchaseCostRwf", purchase_supplier AS "purchaseSupplier",
                  purchase_date AS "purchaseDate", created_at AS "createdAt"`,
      [flockId, purchaseCostRwf, purchaseSupplier, purchaseDate]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Flock not found." });
    const flock = r.rows[0];
    if (!flock.purchaseCostRwf) return res.status(400).json({ error: "purchase_cost_rwf must be set on the flock." });

    const payload = mapFlockOpeningToBill(flock);
    await enqueueOdooSync({
      sourceTable: "poultry_flocks",
      sourceId: flockId,
      eventType: "bio_asset_opening",
      payload,
      triggeredByUserId: req.authUser.id,
      triggeredByRole: req.authUser.role,
    });
    processOdooSyncOutbox(5).catch(() => {});
    res.json({ ok: true, flock });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Failed to queue flock opening." });
  }
});

// ─────────────────────────────────────────────────────────────
// 8. Mortality impairment — pending accounting approval
// ─────────────────────────────────────────────────────────────

import { mapMortalityToImpairmentEntry } from "../services/odoo/odooFarmMappers.js";

/**
 * GET /api/accounting-approvals/mortality-events/pending
 */
router.get("/mortality-events/pending", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const r = await dbQuery(
      `SELECT m.id::text AS id, m.flock_id AS "flockId", f.code AS "flockCode",
              m.at, m.count, m.cause, m.notes,
              m.impairment_value_rwf AS "impairmentValueRwf",
              m.accounting_status AS "accountingStatus"
         FROM flock_mortality_events m
         LEFT JOIN poultry_flocks f ON f.id::text = m.flock_id::text
        WHERE m.accounting_status = 'pending_approval'
          AND m.count >= 5
        ORDER BY m.at DESC LIMIT 200`
    );
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/mortality-events/:id/approve
 * Body: { impairmentValueRwf }
 */
router.patch("/mortality-events/:id/approve", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const impairmentValueRwf = Number(req.body?.impairmentValueRwf ?? 0);
  try {
    const r = await dbQuery(
      `UPDATE flock_mortality_events
          SET accounting_status = 'approved',
              impairment_value_rwf = $2,
              accounting_approved_by = $3,
              accounting_approved_at = now()
        WHERE id::text = $1 AND accounting_status = 'pending_approval'
        RETURNING id::text AS id, flock_id AS "flockId", at, count, cause`,
      [id, impairmentValueRwf, req.authUser.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Event not found or already approved." });
    const event = r.rows[0];

    let flockCode = null;
    try {
      const fr = await dbQuery(`SELECT code FROM poultry_flocks WHERE id::text = $1`, [event.flockId]);
      flockCode = fr.rows[0]?.code ?? null;
    } catch {}

    const payload = mapMortalityToImpairmentEntry({ ...event, flockCode, impairmentValueRwf });
    if (payload) {
      await enqueueOdooSync({
        sourceTable: "flock_mortality_events",
        sourceId: id,
        eventType: "mortality_impairment",
        payload,
        triggeredByUserId: req.authUser.id,
        triggeredByRole: req.authUser.role,
      });
      processOdooSyncOutbox(5).catch(() => {});
    }
    res.json({ ok: true, event });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Approval failed." });
  }
});

export default router;
