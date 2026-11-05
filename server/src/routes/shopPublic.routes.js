/**
 * Butcher shop for customers, no login: catalog, quote, place an order,
 * track it with the private link, and say the MoMo payment was sent.
 */

import { Router } from "express";
import { loadShopPhoto } from "../services/shop/shopPhotos.js";
import { attributionFieldsFromReq } from "../services/pipeline/signupAttribution.js";
import {
  getPublicOrder,
  getShopCatalog,
  markPaymentSent,
  placeShopOrder,
  quoteForCustomer,
} from "../services/shop/shopOrders.js";

function sendResult(res, result, okStatus = 200) {
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error || "Could not do that.", code: result.code });
    return;
  }
  res.status(okStatus).json(result);
}

/**
 * @param {{
 *   dbQuery: Function,
 *   hasDb: boolean | (() => boolean),
 *   ipWindowRateLimitMiddleware: Function,
 *   getAppSettingNumber: Function,
 * }} deps
 */
export function createShopPublicRouter(deps) {
  const router = Router();
  const { dbQuery, ipWindowRateLimitMiddleware, getAppSettingNumber } = deps;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));

  const browseLimit = ipWindowRateLimitMiddleware(
    () => getAppSettingNumber("rate_limit_public_market_max", 120),
    () => getAppSettingNumber("rate_limit_public_market_window_ms", 60 * 1000)
  );
  const orderLimit = ipWindowRateLimitMiddleware(
    () => getAppSettingNumber("rate_limit_shop_order_max", 5),
    () => getAppSettingNumber("rate_limit_shop_order_window_ms", 15 * 60 * 1000)
  );

  // Item photos. Each id is a new upload and never changes, so browsers may keep it.
  router.get("/photos/:id", browseLimit, async (req, res) => {
    if (!hasDb() || !dbQuery) {
      res.status(503).end();
      return;
    }
    try {
      const photo = await loadShopPhoto(dbQuery, req.params.id);
      if (!photo) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", photo.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.end(photo.bytes);
    } catch {
      res.status(500).end();
    }
  });

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "The shop is not available right now." });
      return;
    }
    next();
  });

  router.get("/catalog", browseLimit, async (req, res) => {
    const preview = req.query?.preview === "1";
    sendResult(res, await getShopCatalog(dbQuery, new Date(), { preview }));
  });

  router.post("/quote", browseLimit, async (req, res) => {
    sendResult(res, await quoteForCustomer(dbQuery, req.body ?? {}));
  });

  router.post("/orders", orderLimit, async (req, res) => {
    const result = await placeShopOrder(dbQuery, req.body ?? {}, { attribution: attributionFieldsFromReq(req) });
    sendResult(res, result, 201);
  });

  router.get("/orders/:ref", browseLimit, async (req, res) => {
    sendResult(res, await getPublicOrder(dbQuery, req.params.ref, req.query.t));
  });

  router.post("/orders/:ref/pay", orderLimit, async (req, res) => {
    sendResult(res, await markPaymentSent(dbQuery, req.params.ref, req.query.t ?? req.body?.t, req.body ?? {}));
  });

  return router;
}
