/**
 * Login with Cleva routes for Farm Manager.
 */

import crypto from "crypto";
import { Router } from "express";
import {
  clevaOauthAuthorizeUrl,
  clevaOauthClientId,
  clevaOauthScope,
  exchangeClevaIdentity,
  isClevaSsoEnabled,
  resolveIdpOrigin,
  syncClevaUserFromIdentity,
} from "../services/clevaSso.js";
import {
  rateLimitResolve,
  resolveIdpFromEmail,
  resolveSubdomainToIdp,
} from "../services/resolveIdp.js";

/**
 * @param {object} deps
 */
export function createClevaAuthRouter(deps) {
  const {
    hasDb,
    dbQuery,
    sessions,
    newSessionId,
    hashPassword,
    upsertUser,
    persistUserToDb,
    sanitizeUser,
    appendAudit,
    usersByEmail,
    usersById,
  } = deps;

  const router = Router();

  async function getCompanyById(companyId) {
    if (!companyId || !hasDb()) return null;
    const r = await dbQuery(
      `SELECT id::text AS id, name, slug FROM companies WHERE id = $1::uuid`,
      [companyId]
    );
    return r.rows[0] ?? null;
  }

  function clientKey(req) {
    const fwd = req.headers["x-forwarded-for"];
    const ip = String(fwd || req.socket?.remoteAddress || "unknown")
      .split(",")[0]
      .trim();
    return ip;
  }

  router.get("/status", (_req, res) => {
    res.json({
      enabled: isClevaSsoEnabled() && Boolean(clevaOauthClientId()),
    });
  });

  /**
   * Validate tenant subdomain (or full IdP URL) → allowed origin.
   * Body: { subdomain: "test2" } or { subdomain: "https://test2.cleva.rw" }
   */
  router.post("/resolve-subdomain", (req, res) => {
    if (!isClevaSsoEnabled() || !clevaOauthClientId()) {
      res.status(404).json({ error: "Cleva login is not enabled" });
      return;
    }
    if (!rateLimitResolve(`sub:${clientKey(req)}`)) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    const result = resolveSubdomainToIdp(req.body?.subdomain ?? req.body?.idp ?? "");
    if (!result.ok) {
      res.status(400).json({
        found: false,
        idp: null,
        error: result.error,
        code: "invalid_subdomain",
      });
      return;
    }
    res.json({ found: true, idp: result.idp });
  });

  /**
   * Email → IdP (saas adminEmail, then default env IdP exists check).
   * Body: { email }. Never lists tenants.
   */
  router.post("/resolve-idp", async (req, res) => {
    if (!isClevaSsoEnabled() || !clevaOauthClientId()) {
      res.status(404).json({ error: "Cleva login is not enabled" });
      return;
    }
    if (!rateLimitResolve(`email:${clientKey(req)}`)) {
      res.status(429).json({
        found: false,
        idp: null,
        error: "Too many attempts. Try again later.",
      });
      return;
    }
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const result = await resolveIdpFromEmail(email);
    res.json({
      found: result.found,
      idp: result.idp,
      ...(result.found
        ? {}
        : {
            error:
              "We could not find your ERP site from that email. Enter your company subdomain from your desk URL (e.g. test2).",
          }),
    });
  });

  /**
   * PWA-safe bootstrap: returns authorize URL. State is stored in the browser
   * (sessionStorage) because Farm web and API are on different hosts.
   * Optional body/query ``idp`` binds the tenant Frappe site as IdP.
   */
  router.post("/start", (req, res) => {
    if (!isClevaSsoEnabled() || !clevaOauthClientId()) {
      res.status(404).json({ error: "Cleva login is not enabled" });
      return;
    }
    let idpOrigin;
    try {
      const idpRaw = req.body?.idp ?? req.query?.idp ?? null;
      idpOrigin = resolveIdpOrigin(idpRaw);
    } catch {
      res.status(400).json({ error: "Invalid or disallowed IdP URL", code: "invalid_idp" });
      return;
    }
    const frontend = String(process.env.FRONTEND_URL || "https://farm.cleva.rw").replace(
      /\/$/,
      ""
    );
    const redirectUri = `${frontend}/auth/cleva/callback`;
    const nonce = crypto.randomBytes(32).toString("base64url");
    const state = Buffer.from(JSON.stringify({ s: nonce, idp: idpOrigin }), "utf8").toString(
      "base64url"
    );
    const url = new URL(clevaOauthAuthorizeUrl(idpOrigin));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clevaOauthClientId());
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", clevaOauthScope());
    url.searchParams.set("state", state);
    res.json({ authorizeUrl: url.toString(), state, redirectUri, idp: idpOrigin });
  });

  router.post("/exchange", async (req, res) => {
    if (!isClevaSsoEnabled() || !clevaOauthClientId()) {
      res.status(404).json({ error: "Cleva login is not enabled" });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }

    const code = String(req.body?.code ?? "").trim();
    const redirectUri = String(req.body?.redirect_uri ?? req.body?.redirectUri ?? "").trim();
    const state = String(req.body?.state ?? "").trim();
    if (!code || !redirectUri || !state) {
      res.status(400).json({ error: "code, redirect_uri, and state are required." });
      return;
    }

    let idpOrigin;
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      idpOrigin = resolveIdpOrigin(parsed?.idp);
      if (!parsed?.s) throw new Error("missing nonce");
    } catch {
      res.status(400).json({ error: "Invalid OAuth state", code: "invalid_state" });
      return;
    }

    try {
      const identity = await exchangeClevaIdentity({ code, redirectUri, idpUrl: idpOrigin });
      const { user, code: syncCode } = await syncClevaUserFromIdentity(identity, {
        upsertUser,
        persistUserToDb,
        hashPassword,
        usersByEmail,
        usersById,
        getCompanyById,
      });

      if (syncCode === "no_companies" || !user) {
        console.error("[cleva-sso] no_companies", {
          email: identity.email,
          idp: idpOrigin,
          erp_companies: identity.erp_companies,
          tenant_subdomain: identity.tenant_subdomain,
        });
        res.status(403).json({
          error:
            "Your Cleva account has no Farm module company on this site. Enable Farm Manager for a company, then try again.",
          code: "no_companies",
        });
        return;
      }

      const farmBootstrap = identity.farm_bootstrap ?? null;
      const token = newSessionId();
      sessions.set(token, {
        userId: user.id,
        exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
        farmBootstrap,
      });
      appendAudit(user.id, user.role, "auth.login", "session", null, {
        email: user.email,
        authMethod: "cleva_oauth",
        subject: identity.sub,
        idp: idpOrigin,
      });
      res.json({ token, user: sanitizeUser(user), farmBootstrap });
    } catch (e) {
      console.error("[ERROR]", "[cleva-sso] exchange:", e instanceof Error ? e.message : e);
      res.status(401).json({
        error: e instanceof Error ? e.message : "Cleva login failed",
        code: "cleva_failed",
      });
    }
  });

  return router;
}
