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
import { mapOdooErrorToUserMessage } from "../services/odoo/odooHelpers.js";

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

function isManagerOrAbove(user) {
  return user?.role === "manager" || user?.role === "superuser";
}

function hasOdooSendAccess(user) {
  if (!user) return false;
  if (user.role === "superuser") return true;
  if (user.role !== "manager") return false;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess.map(String) : [];
  return access.includes("odoo_send");
}

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

router.use((req, res, next) => {
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or superuser required." });
  }
  return next();
});

function requireOdooSendAccess(req, res, next) {
  if (!hasOdooSendAccess(req.authUser)) {
    return res.status(403).json({ error: "You do not have permission to send data to Odoo. Ask superuser to grant 'Can send to Odoo' in Page visibility matrix." });
  }
  return next();
}

function canResendOutboxByOwnership(user, outboxRow) {
  if (!user || !outboxRow) return false;
  if (user.role === "superuser") return true;
  if (hasOdooSendAccess(user)) return true;
  return String(outboxRow.triggered_by_user_id ?? "") === String(user.id ?? "");
}

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
          AND COALESCE(t.accounting_status, 'pending_approval') = 'pending_approval'
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
router.patch("/feed-procurements/:id/approve", requireOdooSendAccess, async (req, res) => {
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
        WHERE COALESCE(l.accounting_status, 'pending_approval') = 'pending_approval'
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
router.patch("/medicine-lots/:id/approve", requireOdooSendAccess, async (req, res) => {
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
        WHERE COALESCE(s.accounting_status, 'pending_approval') = 'pending_approval'
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
router.patch("/slaughter-events/:id/approve", requireOdooSendAccess, async (req, res) => {
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

  const autoApproved = hasOdooSendAccess(req.authUser);
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
router.patch("/sales-orders/:id/review", requireOdooSendAccess, async (req, res) => {
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
    const outbox = await dbQuery(
      `SELECT id::text AS id, status, triggered_by_user_id
         FROM odoo_sync_outbox
        WHERE id::text = $1
        LIMIT 1`,
      [req.params.id]
    );
    const row = outbox.rows[0] ?? null;
    if (!row) return res.status(404).json({ error: "Outbox row not found." });
    if (!canResendOutboxByOwnership(req.authUser, row)) {
      return res.status(403).json({ error: "Only superuser, users with Odoo send access, or the original approver can resend this item." });
    }
    if (!["failed", "pending", "processing"].includes(String(row.status ?? ""))) {
      return res.status(400).json({ error: "Only pending, processing, or failed items can be resent." });
    }
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
router.post("/payroll-closures", requireOdooSendAccess, async (req, res) => {
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
router.post("/flock-openings/:flockId/send-to-odoo", requireOdooSendAccess, async (req, res) => {
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
        WHERE COALESCE(m.accounting_status, 'pending_approval') = 'pending_approval'
          AND m.count > 0
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
router.patch("/mortality-events/:id/approve", requireOdooSendAccess, async (req, res) => {
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

// ─────────────────────────────────────────────────────────────
// 9. Unified Action Queue — all unsent / failed items
// ─────────────────────────────────────────────────────────────

/**
 * Map outbox error to user-facing category + message.
 * @param {string | null} rawError
 */
function userErrorFrom(rawError) {
  if (!rawError) return null;
  return mapOdooErrorToUserMessage(rawError);
}

/**
 * Return the set of editable fields for a given event type, seeded with current record data.
 * @param {string} eventType
 * @param {Record<string,unknown>} data
 */
function getFixableFields(eventType, data) {
  const d = data ?? {};
  switch (eventType) {
    case "feed_purchase":
      return [
        { key: "unitCostRwfPerKg", label: "Unit cost (RWF/kg)", type: "number", value: d.unitCostRwfPerKg ?? "", required: true, hint: "Required to generate a vendor bill in Odoo" },
        { key: "supplierName", label: "Supplier name", type: "text", value: d.supplierName ?? "", required: false, hint: "Should match a contact in Odoo" },
      ];
    case "medicine_purchase":
      return [
        { key: "unitCostRwf", label: "Unit cost (RWF per unit)", type: "number", value: d.unitCostRwf ?? "", required: true, hint: "Required to generate a vendor bill" },
        { key: "supplier", label: "Supplier name", type: "text", value: d.supplier ?? "", required: false, hint: "Should match a contact in Odoo" },
      ];
    case "slaughter_conversion":
      return [
        { key: "fairValueRwf", label: "Fair value of meat stock (RWF total)", type: "number", value: d.fairValueRwf ?? "", required: true, hint: "IAS 41: market value less costs to sell" },
        { key: "carryingValueRwf", label: "Carrying value of live birds (RWF)", type: "number", value: "", required: false, hint: "Leave blank to use fair value" },
      ];
    case "meat_sale":
      return [
        { key: "pricePerKg", label: "Price per kg (RWF)", type: "number", value: d.pricePerKg ?? "", required: true },
        { key: "buyerName", label: "Buyer name", type: "text", value: d.buyerName ?? "", required: false, hint: "Should match a customer in Odoo" },
        { key: "buyerEmail", label: "Buyer email", type: "email", value: d.buyerEmail ?? "", required: false },
      ];
    case "mortality_impairment":
      return [
        { key: "impairmentValueRwf", label: "Impairment value of dead birds (RWF)", type: "number", value: d.impairmentValueRwf ?? "", required: true, hint: "Estimated fair value × count" },
      ];
    case "bio_asset_opening":
      return [
        { key: "purchaseCostRwf", label: "Total purchase cost (RWF)", type: "number", value: d.purchaseCostRwf ?? "", required: true },
        { key: "costPerChickRwf", label: "Cost per chick (RWF)", type: "number", value: d.costPerChickRwf ?? "", required: false },
        { key: "purchaseSupplier", label: "Supplier / hatchery", type: "text", value: d.purchaseSupplier ?? "", required: false, hint: "Should match a contact in Odoo" },
        { key: "purchaseDate", label: "Purchase date", type: "date", value: d.purchaseDate ?? "", required: false },
      ];
    case "payroll_wages":
      return [
        { key: "notes", label: "Notes", type: "text", value: d.notes ?? "", required: false, hint: "Description on the journal entry" },
      ];
    default:
      return [];
  }
}

/**
 * Normalize a raw DB queue row into the API shape.
 * @param {Record<string,unknown>} row
 */
function normalizeQueueRow(row) {
  const rawError = row.last_error ?? null;
  return {
    eventType: row.event_type,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    outboxId: row.outbox_id ?? null,
    eventAt: row.event_at,
    sourceStatus: row.source_status,
    outboxStatus: row.outbox_status,
    attempts: Number(row.attempts ?? 0),
    lastAttemptedAt: row.last_attempted_at ?? null,
    nextRetryAt: row.next_retry_at ?? null,
    lastError: rawError,
    userError: userErrorFrom(String(rawError ?? "")),
    recordData: row.record_data ?? {},
    summary: row.summary ?? {},
    fixableFields: getFixableFields(String(row.event_type), row.record_data ?? {}),
  };
}

const TRACE_SOURCE_TABLES = {
  farm_inventory_transactions: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT id::text AS id, transaction_type, feed_type, quantity_kg, unit_cost_rwf_per_kg, supplier_name,
             recorded_at, accounting_status, accounting_approved_at
        FROM farm_inventory_transactions
       WHERE id::text = $1
       LIMIT 1`,
  },
  medicine_lots: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT l.id::text AS id, l.lot_number, l.quantity_received, l.unit_cost_rwf, l.supplier,
             l.received_at, l.accounting_status, l.accounting_approved_at,
             m.name AS medicine_name
        FROM medicine_lots l
        LEFT JOIN medicine_inventory m ON m.id = l.medicine_id
       WHERE l.id::text = $1
       LIMIT 1`,
  },
  flock_slaughter_events: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT s.id::text AS id, s.flock_id::text AS flock_id, s.birds_slaughtered, s.avg_live_weight_kg,
             s.avg_carcass_weight_kg, s.fair_value_rwf, s.at, s.accounting_status, s.accounting_approved_at,
             f.code AS flock_code
        FROM flock_slaughter_events s
        LEFT JOIN poultry_flocks f ON f.id::text = s.flock_id::text
       WHERE s.id::text = $1
       LIMIT 1`,
  },
  poultry_sales_orders: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT s.id::text AS id, s.flock_id::text AS flock_id, s.order_date, s.number_of_birds, s.total_weight_kg,
             s.price_per_kg, s.buyer_name, s.buyer_email, s.submission_status, s.accounting_status, s.reviewed_at,
             f.code AS flock_code
        FROM poultry_sales_orders s
        LEFT JOIN poultry_flocks f ON f.id = s.flock_id
       WHERE s.id::text = $1
       LIMIT 1`,
  },
  flock_mortality_events: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT m.id::text AS id, m.flock_id::text AS flock_id, m.count, m.cause, m.notes,
             m.impairment_value_rwf, m.at, m.accounting_status, m.accounting_approved_at,
             f.code AS flock_code
        FROM flock_mortality_events m
        LEFT JOIN poultry_flocks f ON f.id::text = m.flock_id::text
       WHERE m.id::text = $1
       LIMIT 1`,
  },
  payroll_period_closures: {
    idCast: "::text",
    statusField: "accounting_status",
    selectSql: `
      SELECT id::text AS id, period_start, period_end, net_payroll_rwf, worker_count, notes,
             accounting_status, approved_at
        FROM payroll_period_closures
       WHERE id::text = $1
       LIMIT 1`,
  },
  poultry_flocks: {
    idCast: "::text",
    statusField: "bio_asset_accounting_status",
    selectSql: `
      SELECT id::text AS id, code, initial_count, placement_date, purchase_cost_rwf, cost_per_chick_rwf,
             purchase_supplier, purchase_date, bio_asset_accounting_status
        FROM poultry_flocks
       WHERE id::text = $1
       LIMIT 1`,
  },
};

/**
 * GET /api/accounting-approvals/trace?sourceTable=&sourceId=
 * Deep diagnostics for one accounting-impact source row:
 * - source snapshot (including accounting status fields)
 * - outbox row + payload + error
 * - sync link row
 * - timeline of key events
 */
router.get("/trace", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });

  const sourceTable = String(req.query.sourceTable ?? "").trim();
  const sourceId = String(req.query.sourceId ?? "").trim();
  if (!sourceTable || !sourceId) {
    return res.status(400).json({ error: "sourceTable and sourceId are required query params." });
  }
  const sourceMeta = TRACE_SOURCE_TABLES[sourceTable];
  if (!sourceMeta) {
    return res.status(400).json({
      error: "Unsupported sourceTable for trace.",
      allowed: Object.keys(TRACE_SOURCE_TABLES),
    });
  }

  try {
    const [sourceRowResult, outboxResult, linkResult] = await Promise.all([
      dbQuery(sourceMeta.selectSql, [sourceId]),
      dbQuery(
        `SELECT id::text AS id, source_table, source_id, event_type, status, payload, attempts,
                next_retry_at, last_attempted_at, last_error, odoo_move_id, odoo_move_name,
                odoo_move_state, created_at, updated_at
           FROM odoo_sync_outbox
          WHERE source_table = $1 AND source_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [sourceTable, sourceId]
      ),
      dbQuery(
        `SELECT source_table, source_id, odoo_move_id, odoo_move_name, odoo_move_type, odoo_move_state, synced_at
           FROM odoo_sync_links
          WHERE source_table = $1 AND source_id = $2
          LIMIT 1`,
        [sourceTable, sourceId]
      ),
    ]);

    const sourceRecord = sourceRowResult.rows[0] ?? null;
    const outbox = outboxResult.rows[0] ?? null;
    const link = linkResult.rows[0] ?? null;

    if (!sourceRecord && !outbox && !link) {
      return res.status(404).json({ error: "No matching source record, outbox row, or sync link found." });
    }

    const timeline = [
      sourceRecord
        ? {
            at: sourceRecord.recorded_at
              ?? sourceRecord.received_at
              ?? sourceRecord.at
              ?? sourceRecord.order_date
              ?? sourceRecord.placement_date
              ?? sourceRecord.period_start
              ?? null,
            event: "source_record_present",
            detail: `${sourceTable}:${sourceId}`,
          }
        : null,
      sourceRecord?.[sourceMeta.statusField] != null
        ? {
            at:
              sourceRecord.accounting_approved_at
              ?? sourceRecord.approved_at
              ?? sourceRecord.reviewed_at
              ?? null,
            event: "source_accounting_status",
            detail: String(sourceRecord[sourceMeta.statusField]),
          }
        : null,
      outbox
        ? {
            at: outbox.created_at ?? null,
            event: "outbox_created",
            detail: `${outbox.event_type} (${outbox.status})`,
          }
        : null,
      outbox?.last_attempted_at
        ? {
            at: outbox.last_attempted_at,
            event: "outbox_last_attempt",
            detail: `attempts=${outbox.attempts ?? 0}${outbox.last_error ? " with error" : ""}`,
          }
        : null,
      outbox?.last_error
        ? {
            at: outbox.updated_at ?? null,
            event: "outbox_error",
            detail: outbox.last_error,
          }
        : null,
      outbox?.odoo_move_name
        ? {
            at: outbox.updated_at ?? null,
            event: "odoo_move_recorded",
            detail: `${outbox.odoo_move_name} (${outbox.odoo_move_state ?? "unknown"})`,
          }
        : null,
      link
        ? {
            at: link.synced_at ?? null,
            event: "sync_link_present",
            detail: `${link.odoo_move_name ?? link.odoo_move_id ?? "linked"}`,
          }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => new Date(String(a.at ?? 0)).getTime() - new Date(String(b.at ?? 0)).getTime());

    return res.json({
      sourceTable,
      sourceId,
      sourceStatusField: sourceMeta.statusField,
      sourceRecord,
      outbox,
      link,
      diagnostics: {
        hasSourceRecord: Boolean(sourceRecord),
        hasOutbox: Boolean(outbox),
        hasSyncLink: Boolean(link),
        userError: outbox?.last_error ? mapOdooErrorToUserMessage(outbox.last_error) : null,
      },
      timeline,
    });
  } catch (e) {
    return res.status(503).json({ error: e instanceof Error ? e.message : "Trace query failed." });
  }
});

/**
 * Upsert outbox row with a fresh payload and reset to pending.
 * @param {{ sourceTable: string, sourceId: string, eventType: string, payload: object, userId: string, role: string }} opts
 */
async function upsertAndResetOutbox({ sourceTable, sourceId, eventType, payload, userId, role }) {
  await dbQuery(
    `INSERT INTO odoo_sync_outbox
       (source_table, source_id, event_type, payload, status, next_retry_at, attempts,
        triggered_by_user_id, triggered_by_role)
     VALUES ($1, $2, $3, $4::jsonb, 'pending', now(), 0, $5, $6)
     ON CONFLICT (source_table, source_id) DO UPDATE
       SET payload = EXCLUDED.payload,
           status = 'pending',
           next_retry_at = now(),
           last_error = NULL,
           attempts = 0,
           triggered_by_user_id = EXCLUDED.triggered_by_user_id,
           triggered_by_role = EXCLUDED.triggered_by_role,
           updated_at = now()`,
    [sourceTable, sourceId, eventType, JSON.stringify(payload), userId ?? null, role ?? null]
  );
}

/**
 * GET /api/accounting-approvals/action-queue
 * Returns all records across all accounting event types that need manager action:
 *   - pending_approval (need human approval to queue for Odoo)
 *   - approved but outbox is missing, failed, or pending (need fix or resend)
 */
router.get("/action-queue", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });

  try {
    const [feed, medicine, slaughter, sales, mortality, flockOpenings, payroll] = await Promise.all([
      dbQuery(
        `SELECT 'feed_purchase' AS event_type, 'farm_inventory_transactions' AS source_table,
                t.id::text AS source_id, t.recorded_at AS event_at,
                COALESCE(t.accounting_status, 'pending_approval') AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'feedType', t.feed_type,
                  'quantityKg', t.quantity_kg::float,
                  'unitCostRwfPerKg', t.unit_cost_rwf_per_kg::float,
                  'supplierName', t.supplier_name,
                  'reference', t.reference
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT(INITCAP(COALESCE(t.feed_type, 'Feed')), ' feed — ', t.quantity_kg, ' kg'),
                  'detail', to_char(t.recorded_at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY')
                ) AS summary
           FROM farm_inventory_transactions t
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'farm_inventory_transactions' AND o.source_id = t.id::text
          WHERE t.transaction_type = 'procurement_receipt'
            AND COALESCE(t.accounting_status, 'pending_approval') NOT IN ('sent_to_odoo', 'not_applicable')
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY t.recorded_at DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'medicine_purchase' AS event_type, 'medicine_lots' AS source_table,
                l.id::text AS source_id, l.received_at AS event_at,
                COALESCE(l.accounting_status, 'pending_approval') AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'medicineName', m.name,
                  'lotNumber', l.lot_number,
                  'quantityReceived', l.quantity_received::float,
                  'unitCostRwf', l.unit_cost_rwf::float,
                  'supplier', l.supplier
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT(m.name, ' lot — ', l.quantity_received, ' units'),
                  'detail', to_char(l.received_at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY')
                ) AS summary
           FROM medicine_lots l
           JOIN medicine_inventory m ON m.id = l.medicine_id
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'medicine_lots' AND o.source_id = l.id::text
          WHERE COALESCE(l.accounting_status, 'pending_approval') NOT IN ('sent_to_odoo', 'not_applicable')
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY l.received_at DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'slaughter_conversion' AS event_type, 'flock_slaughter_events' AS source_table,
                s.id::text AS source_id, s.at AS event_at,
                COALESCE(s.accounting_status, 'pending_approval') AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'birdsSlaughtered', s.birds_slaughtered,
                  'avgLiveWeightKg', s.avg_live_weight_kg::float,
                  'avgCarcassWeightKg', s.avg_carcass_weight_kg::float,
                  'fairValueRwf', s.fair_value_rwf::float,
                  'flockCode', f.code
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT('Flock ', COALESCE(f.code, s.flock_id::text), ' — ', s.birds_slaughtered, ' birds slaughtered'),
                  'detail', to_char(s.at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY')
                ) AS summary
           FROM flock_slaughter_events s
           LEFT JOIN poultry_flocks f ON f.id::text = s.flock_id
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'flock_slaughter_events' AND o.source_id = s.id::text
          WHERE COALESCE(s.accounting_status, 'pending_approval') NOT IN ('sent_to_odoo', 'not_applicable')
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY s.at DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'meat_sale' AS event_type, 'poultry_sales_orders' AS source_table,
                s.id::text AS source_id, s.order_date::timestamptz AS event_at,
                COALESCE(s.accounting_status, 'pending_approval') AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'numberOfBirds', s.number_of_birds,
                  'totalWeightKg', s.total_weight_kg::float,
                  'pricePerKg', s.price_per_kg::float,
                  'buyerName', s.buyer_name,
                  'buyerEmail', s.buyer_email,
                  'flockCode', f.code
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT('Flock ', COALESCE(f.code, s.flock_id::text), ' — ', s.number_of_birds, ' birds sold'),
                  'detail', to_char(s.order_date, 'DD Mon YYYY')
                ) AS summary
           FROM poultry_sales_orders s
           LEFT JOIN poultry_flocks f ON f.id = s.flock_id
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'poultry_sales_orders' AND o.source_id = s.id::text
          WHERE COALESCE(s.accounting_status, 'pending_approval') NOT IN ('sent_to_odoo', 'not_applicable')
            AND s.submission_status != 'rejected'
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY s.order_date DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'mortality_impairment' AS event_type, 'flock_mortality_events' AS source_table,
                m.id::text AS source_id, m.at AS event_at,
                COALESCE(m.accounting_status, 'pending_approval') AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'count', m.count,
                  'cause', m.cause,
                  'notes', m.notes,
                  'impairmentValueRwf', m.impairment_value_rwf::float,
                  'flockCode', f.code
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT('Flock ', COALESCE(f.code, m.flock_id::text), ' — ', m.count, ' birds dead'),
                  'detail', to_char(m.at AT TIME ZONE 'Africa/Kigali', 'DD Mon YYYY')
                ) AS summary
           FROM flock_mortality_events m
           LEFT JOIN poultry_flocks f ON f.id::text = m.flock_id::text
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'flock_mortality_events' AND o.source_id = m.id::text
          WHERE COALESCE(m.accounting_status, 'pending_approval') NOT IN ('sent_to_odoo', 'not_applicable')
            AND m.count > 0
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY m.at DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'bio_asset_opening' AS event_type, 'poultry_flocks' AS source_table,
                f.id::text AS source_id, f.placement_date::timestamptz AS event_at,
                f.bio_asset_accounting_status AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'code', f.code,
                  'initialCount', f.initial_count,
                  'purchaseCostRwf', f.purchase_cost_rwf::float,
                  'costPerChickRwf', f.cost_per_chick_rwf::float,
                  'purchaseSupplier', f.purchase_supplier,
                  'purchaseDate', f.purchase_date::text
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT('Flock ', COALESCE(f.code, f.id::text), ' — ', f.initial_count, ' chicks placed'),
                  'detail', to_char(f.placement_date, 'DD Mon YYYY')
                ) AS summary
           FROM poultry_flocks f
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'poultry_flocks' AND o.source_id = f.id::text
          WHERE f.bio_asset_accounting_status IS NOT NULL
            AND f.bio_asset_accounting_status NOT IN ('sent_to_odoo', 'not_applicable')
            AND (f.purchase_cost_rwf IS NOT NULL OR f.cost_per_chick_rwf IS NOT NULL)
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY f.placement_date DESC LIMIT 100`
      ),
      dbQuery(
        `SELECT 'payroll_wages' AS event_type, 'payroll_period_closures' AS source_table,
                p.id::text AS source_id, p.approved_at AS event_at,
                p.accounting_status AS source_status,
                COALESCE(o.status, 'not_queued') AS outbox_status,
                o.id::text AS outbox_id, o.last_error, o.attempts, o.last_attempted_at, o.next_retry_at,
                jsonb_build_object(
                  'periodStart', p.period_start::text,
                  'periodEnd', p.period_end::text,
                  'netPayrollRwf', p.net_payroll_rwf::float,
                  'workerCount', p.worker_count,
                  'notes', p.notes
                ) AS record_data,
                jsonb_build_object(
                  'label', CONCAT('Payroll ', p.period_start, ' → ', p.period_end),
                  'detail', CONCAT(p.worker_count, ' workers · ', p.net_payroll_rwf, ' RWF net')
                ) AS summary
           FROM payroll_period_closures p
           LEFT JOIN odoo_sync_outbox o ON o.source_table = 'payroll_period_closures' AND o.source_id = p.id::text
          WHERE p.accounting_status NOT IN ('sent_to_odoo', 'not_applicable')
            AND (o.status IS NULL OR o.status NOT IN ('sent', 'cancelled'))
          ORDER BY p.period_start DESC LIMIT 60`
      ),
    ]);

    const all = [
      ...feed.rows,
      ...medicine.rows,
      ...slaughter.rows,
      ...sales.rows,
      ...mortality.rows,
      ...flockOpenings.rows,
      ...payroll.rows,
    ].map(normalizeQueueRow);

    // Sort: failed first, then pending_approval, then not_queued, by recency
    const statusPriority = { failed: 0, processing: 0, pending_approval: 1, not_queued: 2 };
    all.sort((a, b) => {
      const pa = statusPriority[a.outboxStatus] ?? 3;
      const pb = statusPriority[b.outboxStatus] ?? 3;
      if (pa !== pb) return pa - pb;
      return new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime();
    });

    res.json({ items: all, total: all.length });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

// ─────────────────────────────────────────────────────────────
// 10. Action Queue — per-event correction + re-queue endpoints
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/accounting-approvals/action-queue/:outboxId/resend-now
 * Reset outbox row and trigger immediate processing. No field changes.
 */
router.post("/action-queue/:outboxId/resend-now", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { outboxId } = req.params;
  try {
    const lookup = await dbQuery(
      `SELECT id::text AS id, status, triggered_by_user_id
         FROM odoo_sync_outbox
        WHERE id::text = $1
        LIMIT 1`,
      [outboxId]
    );
    const outboxRow = lookup.rows[0] ?? null;
    if (!outboxRow) return res.status(404).json({ error: "Outbox row not found." });
    if (!canResendOutboxByOwnership(req.authUser, outboxRow)) {
      return res.status(403).json({ error: "Only superuser, users with Odoo send access, or the original approver can resend this item." });
    }
    if (!["failed", "pending", "processing"].includes(String(outboxRow.status ?? ""))) {
      return res.status(400).json({ error: "Only pending, processing, or failed items can be resent." });
    }
    await dbQuery(
      `UPDATE odoo_sync_outbox
          SET status = 'pending', next_retry_at = now(), last_error = NULL, attempts = 0, updated_at = now()
        WHERE id::text = $1`,
      [outboxId]
    );
    const result = await processOdooSyncOutbox(1);
    const updated = await dbQuery(
      `SELECT id::text AS id, status, last_error AS "lastError", odoo_move_name AS "odooMoveName", attempts
         FROM odoo_sync_outbox WHERE id::text = $1`,
      [outboxId]
    );
    const row = updated.rows[0] ?? null;
    const userError = row?.lastError ? mapOdooErrorToUserMessage(row.lastError) : null;
    res.json({ ok: true, result, status: row?.status ?? "unknown", odooMoveName: row?.odooMoveName ?? null, userError });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Resend failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/feed/:id
 * Update feed procurement fields, approve, re-map and (re)queue for Odoo.
 * Body: { unitCostRwfPerKg?, supplierName? }
 */
router.patch("/action-queue/feed/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const unitCostRwfPerKg = body.unitCostRwfPerKg != null && body.unitCostRwfPerKg !== "" ? Number(body.unitCostRwfPerKg) : null;
  const supplierName = body.supplierName != null ? String(body.supplierName).trim() || null : undefined;

  try {
    const r = await dbQuery(
      `UPDATE farm_inventory_transactions
          SET unit_cost_rwf_per_kg = COALESCE($2::numeric, unit_cost_rwf_per_kg),
              supplier_name = COALESCE($3, supplier_name),
              accounting_status = 'approved',
              updated_at = now()
        WHERE id::text = $1 AND transaction_type = 'procurement_receipt'
        RETURNING id::text AS id, recorded_at AS "recordedAt", quantity_kg AS "quantityKg",
                  unit_cost_rwf_per_kg AS "unitCostRwfPerKg", feed_type AS "feedType",
                  supplier_name AS "supplierName", reference`,
      [id, unitCostRwfPerKg, supplierName ?? null]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Feed procurement not found." });
    const row = r.rows[0];
    if (!row.unitCostRwfPerKg) return res.status(400).json({ error: "unitCostRwfPerKg is required to send to Odoo." });

    const payload = mapFeedProcurementToBill({ ...row, at: row.recordedAt });
    await upsertAndResetOutbox({ sourceTable: "farm_inventory_transactions", sourceId: id, eventType: "feed_purchase", payload, userId: req.authUser.id, role: req.authUser.role });
    processOdooSyncOutbox(1).catch(() => {});
    res.json({ ok: true, row });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/medicine-lot/:id
 * Body: { unitCostRwf?, supplier? }
 */
router.patch("/action-queue/medicine-lot/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const unitCostRwf = body.unitCostRwf != null && body.unitCostRwf !== "" ? Number(body.unitCostRwf) : null;
  const supplier = body.supplier != null ? String(body.supplier).trim() || null : undefined;

  try {
    const r = await dbQuery(
      `UPDATE medicine_lots
          SET unit_cost_rwf = COALESCE($2::numeric, unit_cost_rwf),
              supplier = COALESCE($3, supplier),
              accounting_status = 'approved'
        WHERE id::text = $1
        RETURNING id::text AS id, lot_number AS "lotNumber", received_at AS "receivedAt",
                  quantity_received AS "quantityReceived", unit_cost_rwf AS "unitCostRwf",
                  supplier, medicine_id AS "medicineId"`,
      [id, unitCostRwf, supplier ?? null]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Medicine lot not found." });
    const lot = r.rows[0];
    if (!lot.unitCostRwf) return res.status(400).json({ error: "unitCostRwf is required to send to Odoo." });

    let medicineName = "Medicine";
    try {
      const mRow = await dbQuery(`SELECT name FROM medicine_inventory WHERE id = $1::uuid`, [lot.medicineId]);
      if (mRow.rows[0]) medicineName = mRow.rows[0].name;
    } catch {}

    const payload = mapMedicineLotToBill({ ...lot, medicineName });
    await upsertAndResetOutbox({ sourceTable: "medicine_lots", sourceId: id, eventType: "medicine_purchase", payload, userId: req.authUser.id, role: req.authUser.role });
    processOdooSyncOutbox(1).catch(() => {});
    res.json({ ok: true, lot });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/slaughter/:id
 * Body: { fairValueRwf, carryingValueRwf? }
 */
router.patch("/action-queue/slaughter/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const fairValueRwf = Number(body.fairValueRwf ?? 0);
  const carryingValueRwf = Number(body.carryingValueRwf ?? fairValueRwf);
  if (!fairValueRwf || fairValueRwf <= 0) return res.status(400).json({ error: "fairValueRwf is required and must be > 0." });

  try {
    const r = await dbQuery(
      `UPDATE flock_slaughter_events
          SET fair_value_rwf = $2, fair_value_basis = 'manager_approved',
              accounting_status = 'approved',
              accounting_approved_by = $3, accounting_approved_at = now()
        WHERE id::text = $1
        RETURNING id::text AS id, flock_id AS "flockId", at, birds_slaughtered AS "birdsSlaughtered",
                  avg_live_weight_kg AS "avgLiveWeightKg", avg_carcass_weight_kg AS "avgCarcassWeightKg",
                  fair_value_rwf AS "fairValueRwf"`,
      [id, fairValueRwf, req.authUser.id]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Slaughter event not found." });
    const event = r.rows[0];

    let flockCode = null;
    try {
      const fRow = await dbQuery(`SELECT code FROM poultry_flocks WHERE id::text = $1`, [event.flockId]);
      flockCode = fRow.rows[0]?.code ?? null;
    } catch {}

    const payload = mapSlaughterToJournalEntry({ ...event, flockCode }, { carryingValueRwf });
    await upsertAndResetOutbox({ sourceTable: "flock_slaughter_events", sourceId: id, eventType: "slaughter_conversion", payload, userId: req.authUser.id, role: req.authUser.role });
    processOdooSyncOutbox(1).catch(() => {});
    res.json({ ok: true, event });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/sale/:id
 * Body: { pricePerKg?, buyerName?, buyerEmail? }
 */
router.patch("/action-queue/sale/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const pricePerKg = body.pricePerKg != null && body.pricePerKg !== "" ? Number(body.pricePerKg) : null;
  const buyerName = body.buyerName != null ? String(body.buyerName).trim() || null : undefined;
  const buyerEmail = body.buyerEmail != null ? String(body.buyerEmail).trim() || null : undefined;

  try {
    const r = await dbQuery(
      `UPDATE poultry_sales_orders
          SET price_per_kg = COALESCE($2::numeric, price_per_kg),
              buyer_name = COALESCE($3, buyer_name),
              buyer_email = COALESCE($4, buyer_email),
              submission_status = 'approved',
              accounting_status = 'approved',
              updated_at = now()
        WHERE id::text = $1
        RETURNING id::text AS id, flock_id::text AS "flockId", order_date AS "orderDate",
                  number_of_birds AS "numberOfBirds", total_weight_kg AS "totalWeightKg",
                  price_per_kg AS "pricePerKg", buyer_name AS "buyerName", buyer_email AS "buyerEmail"`,
      [id, pricePerKg, buyerName ?? null, buyerEmail ?? null]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Sale order not found." });
    const order = r.rows[0];

    const payload = mapSaleOrderToInvoice(order);
    await upsertAndResetOutbox({ sourceTable: "poultry_sales_orders", sourceId: id, eventType: "meat_sale", payload, userId: req.authUser.id, role: req.authUser.role });
    processOdooSyncOutbox(1).catch(() => {});
    res.json({ ok: true, order });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/mortality/:id
 * Body: { impairmentValueRwf }
 */
router.patch("/action-queue/mortality/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const impairmentValueRwf = Number(req.body?.impairmentValueRwf ?? 0);
  if (!impairmentValueRwf || impairmentValueRwf <= 0) return res.status(400).json({ error: "impairmentValueRwf is required and must be > 0." });

  try {
    const r = await dbQuery(
      `UPDATE flock_mortality_events
          SET impairment_value_rwf = $2, accounting_status = 'approved',
              accounting_approved_by = $3, accounting_approved_at = now()
        WHERE id::text = $1
        RETURNING id::text AS id, flock_id AS "flockId", at, count, cause`,
      [id, impairmentValueRwf, req.authUser.id]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Mortality event not found." });
    const event = r.rows[0];

    let flockCode = null;
    try {
      const fr = await dbQuery(`SELECT code FROM poultry_flocks WHERE id::text = $1`, [event.flockId]);
      flockCode = fr.rows[0]?.code ?? null;
    } catch {}

    const payload = mapMortalityToImpairmentEntry({ ...event, flockCode, impairmentValueRwf });
    if (payload) {
      await upsertAndResetOutbox({ sourceTable: "flock_mortality_events", sourceId: id, eventType: "mortality_impairment", payload, userId: req.authUser.id, role: req.authUser.role });
      processOdooSyncOutbox(1).catch(() => {});
    }
    res.json({ ok: true, event });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/flock-opening/:id
 * Body: { purchaseCostRwf?, costPerChickRwf?, purchaseSupplier?, purchaseDate? }
 */
router.patch("/action-queue/flock-opening/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const purchaseCostRwf = body.purchaseCostRwf != null && body.purchaseCostRwf !== "" ? Number(body.purchaseCostRwf) : null;
  const costPerChickRwf = body.costPerChickRwf != null && body.costPerChickRwf !== "" ? Number(body.costPerChickRwf) : null;
  const purchaseSupplier = body.purchaseSupplier ? String(body.purchaseSupplier).trim() : null;
  const purchaseDate = body.purchaseDate ? String(body.purchaseDate).slice(0, 10) : null;

  try {
    const r = await dbQuery(
      `UPDATE poultry_flocks
          SET purchase_cost_rwf = COALESCE($2::numeric, purchase_cost_rwf),
              cost_per_chick_rwf = COALESCE($3::numeric, cost_per_chick_rwf),
              purchase_supplier = COALESCE($4, purchase_supplier),
              purchase_date = COALESCE($5::date, purchase_date),
              bio_asset_accounting_status = 'approved'
        WHERE id::text = $1
        RETURNING id::text AS id, code, initial_count AS "initialCount",
                  purchase_cost_rwf AS "purchaseCostRwf", cost_per_chick_rwf AS "costPerChickRwf",
                  purchase_supplier AS "purchaseSupplier", purchase_date AS "purchaseDate",
                  placement_date AS "placementDate", created_at AS "createdAt"`,
      [id, purchaseCostRwf, costPerChickRwf, purchaseSupplier, purchaseDate]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Flock not found." });
    const flock = r.rows[0];
    if (!flock.purchaseCostRwf) return res.status(400).json({ error: "purchaseCostRwf is required to send to Odoo." });

    const payload = mapFlockOpeningToBill(flock);
    await upsertAndResetOutbox({ sourceTable: "poultry_flocks", sourceId: id, eventType: "bio_asset_opening", payload, userId: req.authUser.id, role: req.authUser.role });
    processOdooSyncOutbox(1).catch(() => {});
    res.json({ ok: true, flock });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

/**
 * PATCH /api/accounting-approvals/action-queue/payroll-closure/:id
 * Body: { notes? } — re-sends the payroll closure with updated notes.
 */
router.patch("/action-queue/payroll-closure/:id", requireOdooSendAccess, async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { id } = req.params;
  const body = req.body ?? {};
  const notes = body.notes != null ? String(body.notes).slice(0, 500) || null : undefined;

  try {
    const r = await dbQuery(
      `UPDATE payroll_period_closures
          SET notes = COALESCE($2, notes), accounting_status = 'approved'
        WHERE id::text = $1
        RETURNING id::text AS id, period_start AS "periodStart", period_end AS "periodEnd",
                  net_payroll_rwf AS "netPayrollRwf", total_credits_rwf AS "totalCreditsRwf",
                  total_deductions_rwf AS "totalDeductionsRwf", worker_count AS "workerCount", notes`,
      [id, notes ?? null]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Payroll closure not found." });
    const closure = r.rows[0];

    const payload = mapPayrollClosureToJournalEntry(closure);
    if (payload) {
      await upsertAndResetOutbox({ sourceTable: "payroll_period_closures", sourceId: id, eventType: "payroll_wages", payload, userId: req.authUser.id, role: req.authUser.role });
      processOdooSyncOutbox(1).catch(() => {});
    }
    res.json({ ok: true, closure });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
  }
});

export default router;
