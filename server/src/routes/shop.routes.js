/**
 * Butcher shop desk: settings, products, zones and butchers.
 * Superuser and sales coordinator. Only a superuser changes commission,
 * minimums or opens the shop.
 */

import express from "express";
import { canAccessPipelineDesk } from "../services/pipeline/pipeline.js";
import { getShopSetup, saveButcher, saveProduct, saveShopSettings, saveZone } from "../services/shop/shopSetup.js";

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

  return router;
}
