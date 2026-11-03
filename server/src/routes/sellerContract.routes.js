/**
 * Contract settings (superuser), staff review, and the public phone signing link.
 */

import express from "express";
import { ipWindowRateLimitMiddleware } from "../../systemConfig.js";
import { canSendContract, verifyFileQuery } from "../services/pipeline/sellerContractText.js";
import {
  approveContract,
  checkContractOtp,
  contractReview,
  getContractSettings,
  openSigningLink,
  previewContract,
  previewContractPdf,
  readApprovedPdf,
  readContractFile,
  readSettingsImage,
  rejectContract,
  requestContractOtp,
  saveContractSettings,
  saveContractTemplate,
  sendPersonContract,
  setSigningLanguage,
  signContract,
} from "../services/pipeline/sellerContract.js";

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

function sendPdf(res, pdf, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
}

function sendPrivateFile(res, file) {
  res.setHeader("Content-Type", file.mime || "application/octet-stream");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(file.bytes);
}

export function createSellerContractAdminRouter(deps) {
  const router = express.Router();
  const dbQuery = deps.dbQuery;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));

  router.use((req, res, next) => {
    req.app.locals.appendAudit = deps.appendAudit;
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    next();
  });

  router.get("/", async (req, res) => {
    sendResult(res, await getContractSettings(dbQuery));
  });

  router.put("/", async (req, res) => {
    sendResult(res, await saveContractSettings(dbQuery, req.body || {}, actor(req)));
  });

  router.post("/templates", async (req, res) => {
    sendResult(res, await saveContractTemplate(dbQuery, req.body || {}, actor(req)));
  });

  router.post("/preview", async (req, res) => {
    sendResult(res, await previewContract(dbQuery, req.body || {}));
  });

  router.post("/preview.pdf", async (req, res) => {
    const result = await previewContractPdf(dbQuery, req.body || {});
    if (!result.ok) {
      sendResult(res, result);
      return;
    }
    sendPdf(res, result.pdf, result.filename || "contract-preview.pdf");
  });

  router.get("/image/:kind", async (req, res) => {
    const kind = req.params.kind === "signature" ? "signature" : req.params.kind === "logo" ? "logo" : "";
    if (!kind) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const file = await readSettingsImage(dbQuery, kind);
    if (!file) {
      res.status(404).json({ error: "No image saved." });
      return;
    }
    sendPrivateFile(res, file);
  });

  return router;
}

export function registerSellerContractStaffRoutes(router, deps) {
  const dbQuery = deps.dbQuery;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));

  function ready(req, res) {
    req.app.locals.appendAudit = deps.appendAudit;
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "Database unavailable." });
      return false;
    }
    return true;
  }

  router.get("/market/recruitment/contacts/:id/contract", async (req, res) => {
    if (!ready(req, res)) return;
    sendResult(res, await contractReview(dbQuery, req.params.id, actor(req)));
  });

  router.post("/market/recruitment/contacts/:id/contract/send", async (req, res) => {
    if (!ready(req, res)) return;
    sendResult(res, await sendPersonContract(dbQuery, req.params.id, actor(req), { resend: false }));
  });

  router.post("/market/recruitment/contacts/:id/contract/resend", async (req, res) => {
    if (!ready(req, res)) return;
    sendResult(res, await sendPersonContract(dbQuery, req.params.id, actor(req), { resend: true }));
  });

  router.post("/market/recruitment/contacts/:id/contract/approve", async (req, res) => {
    if (!ready(req, res)) return;
    sendResult(res, await approveContract(dbQuery, req.params.id, actor(req)));
  });

  router.post("/market/recruitment/contacts/:id/contract/reject", async (req, res) => {
    if (!ready(req, res)) return;
    sendResult(res, await rejectContract(dbQuery, req.params.id, actor(req), req.body?.reason));
  });

  router.get("/market/recruitment/contacts/:id/contract/file/:kind", async (req, res) => {
    if (!ready(req, res)) return;
    if (!canSendContract(req.authUser?.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const kind = ["signature", "selfie", "pdf"].includes(req.params.kind) ? req.params.kind : "";
    if (!kind || !verifyFileQuery(req.params.id, kind, req.query.exp, req.query.sig)) {
      res.status(403).json({ error: "This link has expired. Open the contract again." });
      return;
    }
    try {
      const file = await readContractFile(dbQuery, req.params.id, kind);
      if (!file) {
        res.status(404).json({ error: "That file is not ready." });
        return;
      }
      if (kind === "pdf") sendPdf(res, file.bytes, "signed-agreement.pdf");
      else sendPrivateFile(res, file);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load the file." });
    }
  });
}

export function createSellerContractStaffRouter(deps) {
  const router = express.Router();
  registerSellerContractStaffRoutes(router, deps);
  return router;
}

export function createSellerContractPublicRouter(deps) {
  const router = express.Router();
  const dbQuery = deps.dbQuery;
  const hasDb = () => (typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb));
  const limit = ipWindowRateLimitMiddleware(
    () => 40,
    () => 15 * 60 * 1000,
    { error: "Too many tries. Wait a few minutes and open the link again." }
  );

  router.use(limit);
  router.use((req, res, next) => {
    if (!hasDb() || !dbQuery) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    next();
  });

  router.get("/:token", async (req, res) => {
    sendResult(res, await openSigningLink(dbQuery, req.params.token, req.authUser?.id));
  });

  router.post("/:token/language", async (req, res) => {
    sendResult(res, await setSigningLanguage(dbQuery, req.params.token, req.body?.language, req.authUser?.id));
  });

  router.post("/:token/sign", async (req, res) => {
    sendResult(res, await signContract(dbQuery, req.params.token, req.body || {}, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      userId: req.authUser?.id,
    }));
  });

  router.post("/:token/otp", async (req, res) => {
    sendResult(res, await requestContractOtp(dbQuery, req.params.token, null, req.authUser?.id));
  });

  router.post("/:token/otp/check", async (req, res) => {
    sendResult(res, await checkContractOtp(dbQuery, req.params.token, req.body?.code, req.authUser?.id));
  });

  router.get("/:token/pdf", async (req, res) => {
    try {
      const file = await readApprovedPdf(dbQuery, req.params.token, req.authUser?.id);
      if (!file.ok) {
        res.status(file.status || 404).json({ error: file.error || "The signed copy is not ready yet." });
        return;
      }
      sendPdf(res, file.bytes, "cleva-agreement.pdf");
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not download the agreement." });
    }
  });

  return router;
}
