/**
 * Farm Insights (embedded Superset) — meta, guest token proxy, pack prefs.
 */

import express from "express";
import {
  getErpnextConfig,
  getUserCompanyId,
} from "../services/erpnext/erpnext.config.js";
import {
  getInsightsEmbedTokenOnBase,
  getInsightsMetaOnBase,
  hasApiKeyCredentials,
} from "../services/erpnext/erpnext.client.js";
import {
  mergePackPreferences,
  normalizePackPayload,
  packsSettingsKey,
} from "../services/insightsPacks.js";

const router = express.Router();

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

function isManagerOrAbove(user) {
  return (ROLE_RANK[user?.role] ?? -1) >= (ROLE_RANK.manager ?? 999);
}

/**
 * @param {import("express").Request} req
 * @param {{ dbQuery?: Function, hasDb?: boolean }} deps
 */
async function resolveTenantLink(req, deps) {
  const companyId =
    (await getUserCompanyId(req.authUser?.id)) || req.authUser?.companyId || null;
  if (!companyId) {
    const err = new Error("No company linked to this user.");
    err.status = 400;
    err.code = "no_company";
    throw err;
  }
  const cfg = await getErpnextConfig(companyId);
  const erpnextCompany = cfg?.erpnextCompany || null;
  const erpnextBaseUrl = (cfg?.erpnextBaseUrl || process.env.ERPNEXT_BASE_URL || "").replace(
    /\/+$/,
    ""
  );
  if (!erpnextCompany || !erpnextBaseUrl) {
    const err = new Error("ERPNext company link is not configured for Insights.");
    err.status = 503;
    err.code = "erp_link_missing";
    throw err;
  }
  return { companyId, erpnextCompany, erpnextBaseUrl, cfg };
}

async function loadPackPrefs(companyId, dbQuery, hasDb) {
  if (!hasDb || !dbQuery || !companyId) {
    return mergePackPreferences(null);
  }
  try {
    const r = await dbQuery("SELECT setting_value FROM app_settings WHERE setting_key = $1", [
      packsSettingsKey(companyId),
    ]);
    if (!r.rows.length) return mergePackPreferences(null);
    let parsed;
    try {
      parsed = JSON.parse(r.rows[0].setting_value);
    } catch {
      parsed = null;
    }
    return mergePackPreferences(parsed);
  } catch {
    return mergePackPreferences(null);
  }
}

async function savePackPrefs(companyId, prefs, dbQuery) {
  await dbQuery(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [packsSettingsKey(companyId), JSON.stringify(prefs)]
  );
}

/**
 * @param {{ dbQuery: Function, hasDb: boolean | (() => boolean) }} deps
 */
export function createInsightsRouter(deps) {
  const dbQuery = deps.dbQuery;
  const hasDb = () =>
    typeof deps.hasDb === "function" ? Boolean(deps.hasDb()) : Boolean(deps.hasDb);

  router.get("/meta", async (req, res) => {
    try {
      if (!hasApiKeyCredentials()) {
        res.json({
          configured: false,
          reason: "farmapi_missing_erp_credentials",
          packs: (await loadPackPrefs(req.authUser?.companyId, dbQuery, hasDb())).packs,
        });
        return;
      }
      const link = await resolveTenantLink(req, deps);
      let remote = null;
      try {
        remote = await getInsightsMetaOnBase(link.erpnextBaseUrl, link.erpnextCompany);
      } catch (e) {
        res.json({
          configured: false,
          reason: "idp_unreachable",
          error: e instanceof Error ? e.message : String(e),
          erpnextBaseUrl: link.erpnextBaseUrl,
          farmCompany: link.erpnextCompany,
          packs: (await loadPackPrefs(link.companyId, dbQuery, hasDb())).packs,
        });
        return;
      }
      const packState = await loadPackPrefs(link.companyId, dbQuery, hasDb());
      res.json({
        configured: Boolean(remote?.configured),
        supersetUrl: remote?.superset_url || "",
        dashboardUuid: remote?.dashboard_uuid || "",
        packDashboards: remote?.pack_dashboards || {},
        dataAsOf: remote?.data_as_of || null,
        companies: remote?.companies || [link.erpnextCompany],
        farmCompany: link.erpnextCompany,
        erpnextBaseUrl: link.erpnextBaseUrl,
        advancedSsoUrl: remote?.advanced_sso_url || "",
        exportHint: remote?.export_hint || null,
        packs: packState.packs,
        packsNote: packState.note,
      });
    } catch (e) {
      const status = e?.status || 500;
      res.status(status).json({
        configured: false,
        error: e instanceof Error ? e.message : "Unable to load Insights meta",
        code: e?.code || "insights_meta_error",
      });
    }
  });

  router.get("/embed/token", async (req, res) => {
    try {
      if (!hasApiKeyCredentials()) {
        res.status(503).json({
          error: "Insights is not configured (missing ERPNext API credentials).",
          code: "farmapi_missing_erp_credentials",
        });
        return;
      }
      const link = await resolveTenantLink(req, deps);
      const dashboardUuid =
        typeof req.query.dashboardUuid === "string" ? req.query.dashboardUuid : undefined;
      const payload = await getInsightsEmbedTokenOnBase(
        link.erpnextBaseUrl,
        link.erpnextCompany,
        dashboardUuid
      );
      res.json({
        token: payload.token,
        supersetUrl: payload.superset_url,
        dashboardUuid: payload.dashboard_uuid,
        ttlSeconds: payload.ttl_seconds ?? 300,
        dataAsOf: payload.data_as_of ?? null,
        companies: payload.companies ?? [link.erpnextCompany],
        rlsApplied: Boolean(payload.rls_applied),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const notConfigured =
        /not configured|dashboard UUID|guest JWT/i.test(msg) || e?.status === 503;
      res.status(notConfigured ? 503 : 502).json({
        error: msg || "Unable to mint Insights guest token",
        code: notConfigured ? "insights_not_configured" : "insights_token_error",
      });
    }
  });

  router.get("/packs", async (req, res) => {
    try {
      if (!isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const companyId =
        (await getUserCompanyId(req.authUser?.id)) || req.authUser?.companyId || null;
      const state = await loadPackPrefs(companyId, dbQuery, hasDb());
      res.json(state);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unable to load packs" });
    }
  });

  router.put("/packs", async (req, res) => {
    try {
      if (!isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const companyId =
        (await getUserCompanyId(req.authUser?.id)) || req.authUser?.companyId || null;
      if (!companyId) {
        res.status(400).json({ error: "No company linked to this user." });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const prefs = normalizePackPayload(req.body?.packs ?? req.body);
      await savePackPrefs(companyId, prefs, dbQuery);
      res.json(mergePackPreferences(prefs));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unable to save packs" });
    }
  });

  return router;
}

export default createInsightsRouter;
