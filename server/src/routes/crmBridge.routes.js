/**
 * CRM bridge HTTP. Internal routes trust HMAC, never a session role.
 * Staff launch trusts the Cleva session only.
 */

import express from "express";
import {
  assignSeller,
  convertLead,
  createSignupLink,
  crmEnabled,
  crmInboxConfigured,
  launchCrm,
  listScoutSellers,
  loadScoutSeller,
  recordStaffLink,
  rememberInbound,
  retryDeadEvent,
  updateScoutSeller,
  verifyCrmSignature,
} from "../services/pipeline/crmBridge.js";

function inboundSecret() {
  return process.env.CRM_INBOUND_SECRET || "";
}

async function requireCrmHmac(req, res, query) {
  if (!crmEnabled()) {
    res.status(404).json({ error: "Not found." });
    return null;
  }
  const rawBody = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body ?? {});
  const check = verifyCrmSignature({
    secret: inboundSecret(),
    timestamp: req.get("x-cleva-timestamp"),
    signature: req.get("x-cleva-signature"),
    rawBody,
  });
  if (!check.ok) {
    res.status(401).json({ error: "Unauthorized." });
    return null;
  }
  const requestId = String(req.get("x-cleva-request-id") || "").trim();
  if (!requestId || requestId.length > 80) {
    res.status(401).json({ error: "Unauthorized." });
    return null;
  }
  const fresh = await rememberInbound(query, requestId);
  if (!fresh) {
    res.status(409).json({ error: "Duplicate request." });
    return null;
  }
  return requestId;
}

async function releaseInbound(query, requestId) {
  if (!requestId) return;
  try {
    await query(`DELETE FROM crm_inbound_requests WHERE request_id = $1`, [requestId]);
  } catch {
    /* a retry may then be rejected; the error is already logged */
  }
}

export function createCrmInternalRouter({ dbQuery, hasDb }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
    return next();
  });

  router.post("/signup-links", async (req, res) => {
    const requestId = await requireCrmHmac(req, res, dbQuery);
    if (!requestId) return;
    try {
      const result = await createSignupLink(dbQuery, req.body || {});
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.status(201).json({ url: result.url, expires_at: result.expires_at });
    } catch (e) {
      await releaseInbound(dbQuery, requestId);
      console.error("[ERROR]", "[crm] signup link failed:", e instanceof Error ? e.message : "error");
      res.status(503).json({ error: "Could not create signup link." });
    }
  });

  router.post("/convert", async (req, res) => {
    const requestId = await requireCrmHmac(req, res, dbQuery);
    if (!requestId) return;
    try {
      const result = await convertLead(dbQuery, req.body || {});
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.json({
        cleva_record_type: result.cleva_record_type,
        cleva_record_id: result.cleva_record_id,
        ambiguous: Boolean(result.ambiguous),
        linked: Boolean(result.linked),
        duplicate: Boolean(result.duplicate),
      });
    } catch (e) {
      await releaseInbound(dbQuery, requestId);
      console.error("[ERROR]", "[crm] convert failed:", e instanceof Error ? e.message : "error");
      res.status(503).json({ error: "Could not convert lead." });
    }
  });

  router.post("/assign", async (req, res) => {
    const requestId = await requireCrmHmac(req, res, dbQuery);
    if (!requestId) return;
    try {
      const result = await assignSeller(dbQuery, req.body || {});
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.json({
        cleva_record_type: result.cleva_record_type,
        cleva_record_id: result.cleva_record_id,
      });
    } catch (e) {
      await releaseInbound(dbQuery, requestId);
      console.error("[ERROR]", "[crm] assign failed:", e instanceof Error ? e.message : "error");
      res.status(503).json({ error: "Could not assign scout." });
    }
  });

  return router;
}

export function createCrmStaffRouter({ dbQuery, hasDb }) {
  const router = express.Router();

  router.get("/status", (req, res) => {
    const role = req.authUser?.role;
    const desk = role === "superuser" || role === "sales_coordinator";
    res.json({ configured: desk && crmInboxConfigured() });
  });

  router.post("/launch", async (req, res) => {
    if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
    const result = launchCrm(req.authUser);
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    if (result.configured) {
      try {
        await recordStaffLink(dbQuery, req.authUser);
      } catch (e) {
        console.error("[ERROR]", "[crm] staff link failed:", e instanceof Error ? e.message : "error");
      }
    }
    res.json({
      configured: result.configured,
      url: result.url || null,
      token: result.token || null,
      message: result.message || null,
    });
  });

  router.post("/outbox/retry", async (req, res) => {
    if (!crmEnabled()) return res.status(404).json({ error: "Not found." });
    if (req.authUser?.role !== "superuser" && req.authUser?.role !== "sales_coordinator") {
      return res.status(403).json({ error: "Not allowed." });
    }
    const eventId = String(req.body?.eventId || "").trim();
    if (!eventId) return res.status(400).json({ error: "eventId is required." });
    try {
      const result = await retryDeadEvent(dbQuery, eventId);
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not retry." });
    }
  });

  return router;
}

export function registerCrmScoutRoutes(router, { dbQuery, helpers }) {
  const { requireDb } = helpers;

  router.get("/market/scout/crm-sellers", async (req, res) => {
    if (!crmEnabled()) return res.status(404).json({ error: "Not found." });
    if (!requireDb(res)) return;
    if (!req.authUser?.id) return res.status(403).json({ error: "Not allowed." });
    try {
      const sellers = await listScoutSellers(dbQuery, req.authUser.id);
      res.json({ sellers: sellers.map(publicSeller) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list sellers." });
    }
  });

  router.get("/market/scout/crm-sellers/:id", async (req, res) => {
    if (!crmEnabled()) return res.status(404).json({ error: "Not found." });
    if (!requireDb(res)) return;
    try {
      const result = await loadScoutSeller(dbQuery, req.params.id, req.authUser.id);
      if (!result.ok) return res.status(result.status || 404).json({ error: result.error });
      res.json({ seller: publicSeller(result.seller) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load seller." });
    }
  });

  router.post("/market/scout/crm-sellers/:id", async (req, res) => {
    if (!crmEnabled()) return res.status(404).json({ error: "Not found." });
    if (!requireDb(res)) return;
    const action = String(req.body?.action || "").trim();
    try {
      const result = await updateScoutSeller(dbQuery, {
        id: req.params.id,
        userId: req.authUser.id,
        action,
        nextActionAt: req.body?.nextActionAt || null,
        outcomeNote: req.body?.outcomeNote || null,
      });
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      res.json({ seller: publicSeller(result.seller) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not update seller." });
    }
  });
}

function publicSeller(seller) {
  return {
    id: seller.id,
    contactName: seller.contactName,
    phone: seller.phone,
    district: seller.district,
    birdCount: seller.birdCount,
    availabilityDate: seller.availabilityDate,
    handoffNote: seller.handoffNote,
    visitStatus: seller.visitStatus,
    nextActionAt: seller.nextActionAt,
    outcomeNote: seller.outcomeNote,
  };
}
