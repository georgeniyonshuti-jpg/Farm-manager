/**
 * Meat / bird sales — DB-only APIs (ERPNext sync via clevaSync elsewhere as needed).
 */

import express from "express";
import { syncManagedLotFromFlock } from "../services/pipeline/autoDraftLots.js";

const router = express.Router();

let _dbQuery = null;
let _hasDb = null;

export function initFarmSalesRouter(dbQueryFn, hasDbFn) {
  _dbQuery = dbQueryFn;
  _hasDb = hasDbFn;
}

function dbQuery(...args) {
  if (!_dbQuery) throw new Error("farmSales: dbQuery not initialized.");
  return _dbQuery(...args);
}

function hasDb() {
  return typeof _hasDb === "function" ? _hasDb() : false;
}

const ROLE_RANK = {
  laborer: 1,
  dispatcher: 1,
  procurement_officer: 1,
  sales_coordinator: 1,
  vet: 2,
  vet_manager: 3,
  manager: 3,
  company_admin: 4,
  investor: 0,
  superuser: 99,
};

function roleAtLeast(user, minRole) {
  return (ROLE_RANK[user?.role] ?? -1) >= (ROLE_RANK[minRole] ?? 999);
}

function isManagerOrAbove(user) {
  return user?.role === "manager" || user?.role === "company_admin" || user?.role === "superuser";
}

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

  if (
    !flockId ||
    !orderDate ||
    !Number.isFinite(numberOfBirds) ||
    numberOfBirds <= 0 ||
    !Number.isFinite(totalWeightKg) ||
    totalWeightKg <= 0 ||
    !Number.isFinite(pricePerKg) ||
    pricePerKg < 0
  ) {
    return res.status(400).json({
      error: "flockId, orderDate, numberOfBirds, totalWeightKg, pricePerKg are required.",
    });
  }

  const autoApproved = isManagerOrAbove(req.authUser);
  const submissionStatus = autoApproved ? "approved" : "pending_review";

  try {
    const r = await dbQuery(
      `INSERT INTO poultry_sales_orders
         (flock_id, recorded_by, order_date, number_of_birds, total_weight_kg, price_per_kg,
          buyer_name, buyer_email, buyer_contact, submission_status, accounting_status)
       VALUES ($1::uuid, $2::uuid, $3::date, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, 'not_applicable')
       RETURNING id::text AS id, flock_id::text AS "flockId", order_date AS "orderDate",
                 number_of_birds AS "numberOfBirds", total_weight_kg AS "totalWeightKg",
                 price_per_kg AS "pricePerKg", buyer_name AS "buyerName", buyer_email AS "buyerEmail",
                 submission_status AS "submissionStatus", accounting_status AS "accountingStatus"`,
      [
        flockId,
        req.authUser.id,
        orderDate,
        numberOfBirds,
        totalWeightKg,
        pricePerKg,
        buyerName,
        buyerEmail,
        buyerContact,
        submissionStatus,
      ]
    );
    void syncManagedLotFromFlock(dbQuery, flockId).catch((e) =>
      console.error("[farm-sales] sync lot after sale:", e instanceof Error ? e.message : e)
    );
    res.status(201).json({ order: r.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create sale." });
  }
});

router.get("/sales-orders", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!roleAtLeast(req.authUser, "vet_manager")) {
    return res.status(403).json({ error: "Vet manager or above required." });
  }
  const status = String(req.query.status ?? "").trim() || null;
  try {
    const r = await dbQuery(
      `SELECT s.id::text AS id, s.flock_id::text AS "flockId", s.order_date AS "orderDate",
              s.number_of_birds AS "numberOfBirds", s.total_weight_kg AS "totalWeightKg",
              s.price_per_kg AS "pricePerKg", s.buyer_name AS "buyerName",
              s.submission_status AS "submissionStatus",
              s.accounting_status AS "accountingStatus",
              f.code AS "flockCode"
         FROM poultry_sales_orders s
         LEFT JOIN poultry_flocks f ON f.id = s.flock_id
        WHERE ($1::text IS NULL OR s.submission_status = $1::text)
        ORDER BY s.order_date DESC LIMIT 200`,
      [status]
    );
    res.json({ orders: r.rows });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Query failed." });
  }
});

router.patch("/sales-orders/:id/review", async (req, res) => {
  if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
  if (!isManagerOrAbove(req.authUser)) {
    return res.status(403).json({ error: "Manager or above required." });
  }
  const id = req.params.id;
  const action = String(req.body?.action ?? "");
  const reviewNotes = String(req.body?.reviewNotes ?? "").slice(0, 2000) || null;
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }
  const newStatus = action === "approve" ? "approved" : "rejected";
  try {
    const r = await dbQuery(
      `UPDATE poultry_sales_orders
          SET submission_status = $2, accounting_status = 'not_applicable',
              reviewed_by = $3, reviewed_at = now(), review_notes = $4, updated_at = now()
        WHERE id::text = $1 AND submission_status = 'pending_review'
        RETURNING id::text AS id, flock_id::text AS "flockId", order_date AS "orderDate",
                  number_of_birds AS "numberOfBirds", total_weight_kg AS "totalWeightKg",
                  price_per_kg AS "pricePerKg", buyer_name AS "buyerName", buyer_email AS "buyerEmail",
                  submission_status AS "submissionStatus"`,
      [id, newStatus, req.authUser.id, reviewNotes]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: "Order not found or not pending." });
    const flockId = r.rows[0]?.flockId;
    if (flockId) {
      void syncManagedLotFromFlock(dbQuery, flockId).catch((e) =>
        console.error("[farm-sales] sync lot after sale review:", e instanceof Error ? e.message : e)
      );
    }
    res.json({ ok: true, status: newStatus, order: r.rows[0] });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Review failed." });
  }
});

export default router;
