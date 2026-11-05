/**
 * Butcher shop desk: settings, products, zones, butchers, and orders.
 * Superuser and sales coordinator. Only a superuser changes commission,
 * minimums or opens the shop.
 */

import express from "express";
import { canAccessPipelineDesk, isButcherRole } from "../services/pipeline/pipeline.js";
import { applyOrderStep, listButcherOrders, loadButcherForUser, reassignOrder } from "../services/shop/shopButcher.js";
import {
  getButcherMoney,
  getPayoutSummary,
  getShopTotals,
  listRefunds,
  markRefundSent,
  payButcher,
  setDeliveryCost,
} from "../services/shop/shopMoney.js";
import { cancelOrder, confirmPayment, listDeskOrders, rejectPayment } from "../services/shop/shopOrders.js";
import { saveShopPhoto } from "../services/shop/shopPhotos.js";
import { getShopSetup, saveButcher, saveKitchen, saveProduct, saveShopSettings, saveZone } from "../services/shop/shopSetup.js";
import { declineKitchenOrder } from "../services/shop/shopKitchenOrders.js";
import { bookRider, getRiderBoard, payRider, saveRider } from "../services/shop/shopRiders.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actor(req) {
  return {
    userId: req.authUser?.id || null,
    role: req.authUser?.role || "",
    audit: req.app?.locals?.appendAudit || null,
  };
}

function sendResult(res, result, okStatus = 200) {
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error || "Could not do that." });
    return;
  }
  res.status(okStatus).json(result);
}

function idParam(req, res) {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "Not found." });
    return null;
  }
  return id;
}

export function createShopDeskRouter(deps) {
  const router = express.Router();
  const dbQuery = deps.dbQuery;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));

  router.use((req, res, next) => {
    req.app.locals.appendAudit = deps.appendAudit;
    if (!canAccessPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Shop desk access required." });
      return;
    }
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    next();
  });

  router.get("/setup", async (_req, res) => {
    sendResult(res, await getShopSetup(dbQuery));
  });

  router.put("/settings", async (req, res) => {
    if (req.authUser?.role !== "superuser") {
      res.status(403).json({ error: "Only a superuser can change shop settings." });
      return;
    }
    sendResult(res, await saveShopSettings(dbQuery, req.body ?? {}, actor(req)));
  });

  router.post("/products", async (req, res) => {
    sendResult(res, await saveProduct(dbQuery, null, req.body ?? {}, actor(req)), 201);
  });

  router.post("/photos", async (req, res) => {
    sendResult(res, await saveShopPhoto(dbQuery, req.body ?? {}, actor(req)), 201);
  });

  router.put("/products/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await saveProduct(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/zones", async (req, res) => {
    sendResult(res, await saveZone(dbQuery, null, req.body ?? {}, actor(req)), 201);
  });

  router.put("/zones/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await saveZone(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/butchers", async (req, res) => {
    sendResult(res, await saveButcher(dbQuery, null, req.body ?? {}, actor(req)), 201);
  });

  router.put("/butchers/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await saveButcher(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.get("/riders", async (_req, res) => {
    sendResult(res, await getRiderBoard(dbQuery));
  });

  router.post("/riders", async (req, res) => {
    sendResult(res, await saveRider(dbQuery, null, req.body ?? {}, actor(req)), 201);
  });

  router.put("/riders/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await saveRider(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/riders/:id/pay", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await payRider(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/orders/:id/rider", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await bookRider(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/kitchens", async (req, res) => {
    sendResult(res, await saveKitchen(dbQuery, null, req.body ?? {}, actor(req)), 201);
  });

  router.put("/kitchens/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await saveKitchen(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.get("/orders", async (req, res) => {
    sendResult(res, await listDeskOrders(dbQuery, String(req.query.view || "open")));
  });

  router.post("/orders/:id/confirm-payment", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await confirmPayment(dbQuery, id, actor(req)));
  });

  router.post("/orders/:id/reject-payment", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await rejectPayment(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.post("/orders/:id/cancel", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await cancelOrder(dbQuery, id, req.body ?? {}, actor(req)));
  });

  // Ops takes a butcher step for an order handled by phone.
  router.post("/orders/:id/step", async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    const a = actor(req);
    const audit = (action, resourceId, meta) => a.audit?.(a.userId, a.role, action, "shop_order", resourceId, meta);
    sendResult(res, await applyOrderStep(dbQuery, id, String(req.body?.action || ""), { kind: "ops", userId: a.userId }, audit));
  });

  router.post("/orders/:id/delivery-cost", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await setDeliveryCost(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.get("/payouts", async (_req, res) => {
    sendResult(res, await getPayoutSummary(dbQuery));
  });

  router.post("/payouts/:id", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await payButcher(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.get("/refunds", async (_req, res) => {
    sendResult(res, await listRefunds(dbQuery));
  });

  router.post("/refunds/:id/sent", async (req, res) => {
    const id = idParam(req, res);
    if (id) sendResult(res, await markRefundSent(dbQuery, id, req.body ?? {}, actor(req)));
  });

  router.get("/totals", async (req, res) => {
    sendResult(res, await getShopTotals(dbQuery, Number(req.query.days) || 7));
  });

  router.post("/orders/:id/assign", async (req, res) => {
    const id = idParam(req, res);
    const butcherId = String(req.body?.butcherId || "");
    if (!id) return;
    if (!UUID_RE.test(butcherId)) {
      res.status(400).json({ error: "Choose a butcher." });
      return;
    }
    sendResult(res, await reassignOrder(dbQuery, id, butcherId, actor(req)));
  });

  return router;
}

/** A partner butcher's own orders. Role butcher, linked to a shop on the desk. */
export function createShopButcherRouter(deps) {
  const router = express.Router();
  const dbQuery = deps.dbQuery;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));

  router.use(async (req, res, next) => {
    req.app.locals.appendAudit = deps.appendAudit;
    if (!isButcherRole(req.authUser)) {
      res.status(403).json({ error: "Butcher account required." });
      return;
    }
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const butcher = await loadButcherForUser(dbQuery, req.authUser.id);
      if (!butcher) {
        res.status(403).json({ error: "This login is not linked to a butcher shop yet. Ask Cleva to link it.", code: "not_linked" });
        return;
      }
      req.butcher = butcher;
      next();
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load your shop." });
    }
  });

  router.get("/orders", async (req, res) => {
    sendResult(res, await listButcherOrders(dbQuery, req.butcher));
  });

  router.get("/money", async (req, res) => {
    sendResult(res, await getButcherMoney(dbQuery, req.butcher.id));
  });

  router.post("/orders/:id/:action", async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    const a = actor(req);
    if (req.params.action === "decline") {
      // Kitchens can say no to a dish order; it moves to the next kitchen.
      if (req.butcher.kind !== "kitchen") {
        res.status(403).json({ error: "Only kitchens can decline an order." });
        return;
      }
      const reason = String(req.body?.reason || "").trim().slice(0, 200);
      const r = await declineKitchenOrder(dbQuery, id, req.butcher.id, { actorUserId: a.userId, reason });
      if (r.ok) a.audit?.(a.userId, a.role, "shop.order.decline", "shop_order", id, { reason });
      sendResult(res, r);
      return;
    }
    const audit = (action, resourceId, meta) => a.audit?.(a.userId, a.role, action, "shop_order", resourceId, meta);
    sendResult(
      res,
      await applyOrderStep(dbQuery, id, req.params.action, { kind: "butcher", butcherId: req.butcher.id, userId: a.userId }, audit)
    );
  });

  return router;
}
