/**
 * Frappe webhook receiver — ERPNext notifies ClevaFarm when documents change.
 */

import express from "express";
import crypto from "node:crypto";
import { appendErpnextSyncLog, updateEntitySyncStatus } from "../services/erpnext/erpnext.syncLog.js";

const router = express.Router();
router.use(express.json());

const WEBHOOK_SECRET = process.env.ERPNEXT_WEBHOOK_SECRET || "";
const CLEVAFARM_API_SECRET = process.env.CLEVAFARM_API_SECRET || "";

function verifyWebhook(req) {
  const signature = req.headers["x-frappe-webhook-signature"];
  const clevaSecret = req.headers["x-clevafarm-secret"];

  if (clevaSecret && CLEVAFARM_API_SECRET && clevaSecret === CLEVAFARM_API_SECRET) {
    return true;
  }

  if (!signature || !WEBHOOK_SECRET) return !WEBHOOK_SECRET && !CLEVAFARM_API_SECRET;

  try {
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function recordWebhook(eventType, body, status = "success") {
  await appendErpnextSyncLog({
    eventType: `webhook_${eventType}`,
    entityType: body.farm_entity_id ? "farm_entity" : null,
    sourceId: body.farm_entity_id || body.name || null,
    erpnextRef: body.name || null,
    status,
    payload: body,
  });
}

router.post("/payment-entry", async (req, res) => {
  if (!verifyWebhook(req)) return res.status(403).json({ error: "Invalid signature" });
  const { name, party, paid_amount, posting_date, farm_entity_id: farmEntityId } = req.body ?? {};
  await recordWebhook("payment_entry", req.body);
  res.json({ received: true, name, party, paid_amount, posting_date, farmEntityId });
});

router.post("/sales-invoice", async (req, res) => {
  if (!verifyWebhook(req)) return res.status(403).json({ error: "Invalid signature" });
  const { name, customer, grand_total, posting_date, farm_entity_id: farmEntityId } = req.body ?? {};
  if (farmEntityId) {
    await updateEntitySyncStatus({
      table: "flock_slaughter_events",
      entityId: farmEntityId,
      erpnextRef: name,
      status: "confirmed",
      pendingRef: name,
    });
  }
  await recordWebhook("sales_invoice", req.body);
  res.json({ received: true, name, customer, grand_total, posting_date });
});

router.post("/purchase-invoice", async (req, res) => {
  if (!verifyWebhook(req)) return res.status(403).json({ error: "Invalid signature" });
  const { name, supplier, grand_total, farm_entity_id: farmEntityId } = req.body ?? {};
  const tables = ["flock_feed_entries", "flock_treatments"];
  if (farmEntityId) {
    for (const table of tables) {
      await updateEntitySyncStatus({
        table,
        entityId: farmEntityId,
        erpnextRef: name,
        status: "confirmed",
        pendingRef: name,
      }).catch(() => {});
    }
  }
  await recordWebhook("purchase_invoice", req.body);
  res.json({ received: true, name, supplier, grand_total });
});

router.post("/loan-application", async (req, res) => {
  if (!verifyWebhook(req)) return res.status(403).json({ error: "Invalid signature" });
  const { name, status, applicant, loan_amount } = req.body ?? {};
  await recordWebhook("loan_application", req.body);
  res.json({ received: true, name, status, applicant, loan_amount });
});

export default router;
