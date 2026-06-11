/**
 * Frappe webhook receiver — ERPNext notifies ClevaFarm when documents or entities change.
 */

import express from "express";
import crypto from "node:crypto";
import { appendErpnextSyncLog, updateEntitySyncStatus } from "../services/erpnext/erpnext.syncLog.js";
import { requireClevaFarmSecret, verifyClevaFarmSecret } from "../services/clevafarm/clevafarmSecret.js";
import { withInboundSync } from "../services/clevafarm/inboundContext.js";
import { upsertEntityFromPayload } from "../services/clevafarm/inboundUpsert.js";
import { isValidEntityType } from "../services/clevafarm/entityRegistry.js";
import { enqueueClevaFarmSync } from "../services/clevafarm/syncOutbox.js";

const router = express.Router();
router.use(express.json());

const WEBHOOK_SECRET = process.env.ERPNEXT_WEBHOOK_SECRET || "";

let _dbQuery = null;

export function initErpnextWebhookRouter(dbQueryFn) {
  _dbQuery = dbQueryFn;
}

function verifyFrappeHmac(req) {
  const signature = req.headers["x-frappe-webhook-signature"];
  if (!signature || !WEBHOOK_SECRET) return false;
  try {
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyWebhook(req) {
  if (verifyClevaFarmSecret(req.headers["x-clevafarm-secret"])) return true;
  if (WEBHOOK_SECRET && verifyFrappeHmac(req)) return true;
  return false;
}

async function recordWebhook(eventType, body, status = "success", extra = {}) {
  await appendErpnextSyncLog({
    eventType: `webhook_${eventType}`,
    entityType: extra.entityType || (body.farm_entity_id ? "farm_entity" : null),
    sourceId: extra.sourceId || body.farm_entity_id || body.name || body.payload?.id || null,
    erpnextRef: body.name || null,
    status,
    payload: body,
  });
}

router.use((req, res, next) => {
  if (!verifyWebhook(req)) {
    res.status(403).json({ error: "Invalid or missing X-ClevaFarm-Secret" });
    return;
  }
  next();
});

router.post("/entity", async (req, res) => {
  const { entityType, event, payload } = req.body ?? {};
  if (!entityType || !payload?.id) {
    res.status(400).json({ error: "entityType and payload.id are required" });
    return;
  }
  if (!isValidEntityType(entityType)) {
    res.status(400).json({ error: `Unknown entityType: ${entityType}` });
    return;
  }
  if (!_dbQuery) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }

  try {
    const result = await withInboundSync(() => upsertEntityFromPayload(entityType, payload, _dbQuery));
    await recordWebhook("entity", req.body, "success", {
      entityType,
      sourceId: String(payload.id),
    });
    await enqueueClevaFarmSync({
      entityType,
      entityId: String(payload.id),
      payload,
      direction: "inbound_logged",
    }).catch(() => {});
    console.log(
      "[clevafarm-sync]",
      `direction=inbound entityType=${entityType} id=${payload.id} event=${event || "on_update"} action=${result.action}`
    );
    res.json({ received: true, entityType, id: payload.id, action: result.action });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordWebhook("entity", req.body, "failed", { entityType, sourceId: payload?.id });
    console.error("[clevafarm-sync] inbound entity failed:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/payment-entry", async (req, res) => {
  const { name, party, paid_amount, posting_date, farm_entity_id: farmEntityId } = req.body ?? {};
  await recordWebhook("payment_entry", req.body);
  res.json({ received: true, name, party, paid_amount, posting_date, farmEntityId });
});

router.post("/sales-invoice", async (req, res) => {
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
  const { name, supplier, grand_total, farm_entity_id: farmEntityId, opening_recorded: openingRecorded } =
    req.body ?? {};
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
    if (_dbQuery) {
      await _dbQuery(
        `UPDATE poultry_flocks
            SET opening_recorded = COALESCE($2::boolean, true),
                erpnext_purchase_invoice = $3,
                updated_at = now()
          WHERE id::text = $1 OR id = $1::uuid`,
        [String(farmEntityId), openingRecorded ?? true, name]
      ).catch(() => {});
    }
  }
  await recordWebhook("purchase_invoice", req.body);
  res.json({ received: true, name, supplier, grand_total });
});

router.post("/loan-application", async (req, res) => {
  const { name, status, applicant, loan_amount, id, company_id: companyId, flock_id: flockId } = req.body ?? {};
  if (_dbQuery && id) {
    await withInboundSync(() =>
      upsertEntityFromPayload(
        "farm_loan_application",
        {
          id,
          status: status || "draft",
          applicant,
          loanAmount: loan_amount,
          companyId,
          flockId,
          erpnextRef: name,
        },
        _dbQuery
      )
    ).catch(() => {});
  }
  await recordWebhook("loan_application", req.body);
  res.json({ received: true, name, status, applicant, loan_amount });
});

export default router;
