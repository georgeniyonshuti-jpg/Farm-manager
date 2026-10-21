/**
 * Farm Insights (embedded Superset) — meta, guest token proxy, pack prefs.
 * Market Analytics: /market/* (native Command Center + optional Superset embed).
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
import {
  mergeMarketPackPreferences,
  normalizeMarketPackPayload,
  marketPacksSettingsKey,
} from "../services/marketInsightsPacks.js";
import { buildMarketAnalytics } from "../services/pipeline/marketAnalytics.js";
import {
  buildRecruitmentAnalytics,
  loadMarketExpectations,
  saveMarketExpectations,
} from "../services/pipeline/marketRecruitment.js";
import {
  addRecruitmentTouch,
  attachRecruitmentAccount,
  decideRecruitmentContact,
  getMyRecruitmentContact,
  getRecruitmentContact,
  listRecruitmentQueue,
  patchRecruitmentContact,
  submitRecruitmentKyc,
  upsertRecruitmentContact,
} from "../services/pipeline/recruitmentContacts.js";
import {
  loadMarketDashboardMap,
  packDashboardsFromMap,
  isMarketSupersetEmbedReady,
} from "../services/superset/marketDashboardMap.js";
import { getSupersetPublicUrl, mintSupersetGuestToken } from "../services/superset/guestToken.js";

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

function isPipelineDesk(user) {
  return user?.role === "superuser" || user?.role === "sales_coordinator";
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

async function loadMarketPackPrefs(companyId, dbQuery, hasDb) {
  if (!hasDb || !dbQuery || !companyId) {
    return mergeMarketPackPreferences(null);
  }
  try {
    const r = await dbQuery("SELECT setting_value FROM app_settings WHERE setting_key = $1", [
      marketPacksSettingsKey(companyId),
    ]);
    if (!r.rows.length) return mergeMarketPackPreferences(null);
    let parsed;
    try {
      parsed = JSON.parse(r.rows[0].setting_value);
    } catch {
      parsed = null;
    }
    return mergeMarketPackPreferences(parsed);
  } catch {
    return mergeMarketPackPreferences(null);
  }
}

async function saveMarketPackPrefs(companyId, prefs, dbQuery) {
  await dbQuery(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [marketPacksSettingsKey(companyId), JSON.stringify(prefs)]
  );
}

async function resolveCompanyId(req) {
  return (await getUserCompanyId(req.authUser?.id)) || req.authUser?.companyId || null;
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

  // ── Market Analytics (no ERPNext link required) ──────────────────────────

  router.get("/market/meta", async (req, res) => {
    try {
      const companyId = await resolveCompanyId(req);
      const packState = await loadMarketPackPrefs(companyId, dbQuery, hasDb());
      const map = await loadMarketDashboardMap(companyId, dbQuery, hasDb());
      const embedReady = isMarketSupersetEmbedReady(map);
      const nativeReady = hasDb() && Boolean(dbQuery);
      res.json({
        configured: nativeReady || embedReady,
        mode: embedReady ? "superset" : nativeReady ? "native" : "unconfigured",
        reason: nativeReady || embedReady ? undefined : "database_unavailable",
        marketAnalyticsPath: "/dashboard/market",
        barnTrendsHint:
          "Barn Trends (Management → Trends) needs an ERPNext company link. Marketplace KPIs live under Market overview / Market trends.",
        supersetUrl: embedReady ? getSupersetPublicUrl() : "",
        dashboardUuid: map.mega || "",
        packDashboards: packDashboardsFromMap(map),
        dataAsOf: new Date().toISOString(),
        packs: packState.packs,
        packsNote: packState.note,
      });
    } catch (e) {
      res.status(500).json({
        configured: false,
        mode: "unconfigured",
        error: e instanceof Error ? e.message : "Unable to load market Insights meta",
      });
    }
  });

  router.get("/market/embed/token", async (req, res) => {
    try {
      const companyId = await resolveCompanyId(req);
      const map = await loadMarketDashboardMap(companyId, dbQuery, hasDb());
      if (!isMarketSupersetEmbedReady(map)) {
        res.status(503).json({
          error: "Market Superset dashboards are not configured. Native Analytics is available.",
          code: "market_superset_not_configured",
        });
        return;
      }
      const qUuid =
        typeof req.query.dashboardUuid === "string" ? req.query.dashboardUuid.trim() : "";
      const dashboardUuid = qUuid || map.mega || Object.values(packDashboardsFromMap(map))[0];
      const payload = await mintSupersetGuestToken({
        dashboardUuid,
        username: req.authUser?.email || "farm-market-embed",
        rls: [],
      });
      res.json({
        ...payload,
        dataAsOf: new Date().toISOString(),
        rlsApplied: false,
      });
    } catch (e) {
      const status = e?.status || 502;
      res.status(status).json({
        error: e instanceof Error ? e.message : "Unable to mint market guest token",
        code: e?.code || "market_token_error",
      });
    }
  });

  router.get("/market/summary", async (req, res) => {
    try {
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable.", code: "db_unavailable" });
        return;
      }
      const days = Number(req.query.days) || 30;
      const data = await buildMarketAnalytics({ dbQuery, days });
      res.json(data);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Unable to build market analytics",
      });
    }
  });

  router.get("/market/packs", async (req, res) => {
    try {
      if (!isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const companyId = await resolveCompanyId(req);
      res.json(await loadMarketPackPrefs(companyId, dbQuery, hasDb()));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unable to load packs" });
    }
  });

  router.put("/market/packs", async (req, res) => {
    try {
      if (!isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const companyId = await resolveCompanyId(req);
      if (!companyId) {
        res.status(400).json({ error: "No company linked to this user." });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const prefs = normalizeMarketPackPayload(req.body?.packs ?? req.body);
      await saveMarketPackPrefs(companyId, prefs, dbQuery);
      res.json(mergeMarketPackPreferences(prefs));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Unable to save packs" });
    }
  });

  // ── Recruitment (growth altitude) ────────────────────────────────────────

  router.get("/market/recruitment", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser) && !isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable.", code: "db_unavailable" });
        return;
      }
      const days = Number(req.query.days) || 7;
      const data = await buildRecruitmentAnalytics({ dbQuery, days });
      res.json(data);
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Unable to build recruitment analytics",
      });
    }
  });

  router.get("/market/recruitment/contacts", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await listRecruitmentQueue(dbQuery, {
        stage: req.query.stage,
        want: req.query.want,
        lane: req.query.lane,
        owner: req.query.owner === "mine" ? req.authUser.id : req.query.owner,
        overdue: req.query.overdue === "1" || req.query.overdue === "true",
        q: req.query.q,
        district: req.query.district,
        kyc: req.query.kyc,
        sort: req.query.sort,
        days: req.query.days,
      });
      if (!data.ok) {
        res.status(500).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load the queue." });
    }
  });

  router.post("/market/recruitment/contacts", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const saved = await upsertRecruitmentContact(dbQuery, {
        ...(req.body || {}),
        source: "whatsapp",
        userId: null,
      });
      if (!saved.ok) {
        res.status(saved.missing ? 503 : 400).json({ error: saved.error });
        return;
      }
      const full = await getRecruitmentContact(dbQuery, saved.id);
      res.status(201).json(full.ok ? full : { ok: true, id: saved.id });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not add the person." });
    }
  });

  router.get("/market/recruitment/contacts/:id", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await getRecruitmentContact(dbQuery, req.params.id);
      if (!data.ok) {
        res.status(data.status || 404).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load the person." });
    }
  });

  router.patch("/market/recruitment/contacts/:id", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await patchRecruitmentContact(dbQuery, req.params.id, req.body || {}, req.authUser.role);
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not update the person." });
    }
  });

  router.post("/market/recruitment/contacts/:id/touches", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await addRecruitmentTouch(dbQuery, req.params.id, {
        ...(req.body || {}),
        byUserId: req.authUser.id,
      });
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.status(201).json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save the touch." });
    }
  });

  router.get("/market/recruitment/me", async (req, res) => {
    try {
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await getMyRecruitmentContact(dbQuery, req.authUser.id);
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load your checks." });
    }
  });

  router.post("/market/recruitment/me/kyc", async (req, res) => {
    try {
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const mine = await getMyRecruitmentContact(dbQuery, req.authUser.id);
      if (!mine.ok || !mine.contact) {
        res.status(404).json({ error: "No recruitment record for this account." });
        return;
      }
      const data = await submitRecruitmentKyc(dbQuery, mine.contact.id, req.body || {}, {
        userId: req.authUser.id,
        role: req.authUser.role,
        desk: false,
        audit: deps.appendAudit,
      });
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save the check." });
    }
  });

  router.post("/market/recruitment/contacts/:id/kyc", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await submitRecruitmentKyc(dbQuery, req.params.id, req.body || {}, {
        userId: req.authUser.id,
        role: req.authUser.role,
        desk: true,
        audit: deps.appendAudit,
      });
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save the check." });
    }
  });

  router.post("/market/recruitment/contacts/:id/decision", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await decideRecruitmentContact(dbQuery, req.params.id, req.body || {}, {
        userId: req.authUser.id,
        role: req.authUser.role,
        audit: deps.appendAudit,
      });
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save the decision." });
    }
  });

  router.post("/market/recruitment/contacts/:id/attach", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const data = await attachRecruitmentAccount(dbQuery, req.params.id, req.body || {});
      if (!data.ok) {
        res.status(data.status || 400).json({ error: data.error });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not attach the account." });
    }
  });

  router.get("/market/expectations", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser) && !isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      res.json({ expectations: await loadMarketExpectations(dbQuery) });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Unable to load expectations",
      });
    }
  });

  router.put("/market/expectations", async (req, res) => {
    try {
      if (!isPipelineDesk(req.authUser) && !isManagerOrAbove(req.authUser)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const body = req.body?.expectations ?? req.body;
      const expectations = await saveMarketExpectations(dbQuery, body);
      res.json({ expectations });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Unable to save expectations",
      });
    }
  });

  return router;
}

export default createInsightsRouter;
