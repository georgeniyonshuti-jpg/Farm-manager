/**
 * One snapshot endpoint for the new recruitment dashboard.
 * Mounted at /api/analytics/recruitment.
 */

import express from "express";
import { buildSnapshot, peopleForMetric, publicPerson, reconcile, visibleToSalesOfficer } from "../services/recruitmentAnalytics/snapshot.js";
import { loadRecruitmentBundle } from "../services/recruitmentAnalytics/load.js";
import { newLinkCode, recordStaffEvent } from "../services/recruitmentAnalytics/capture.js";
import { kigaliWeek } from "../services/recruitmentAnalytics/time.js";
import { DEFINITIONS, DEFINITIONS_VERSION } from "../services/recruitmentAnalytics/definitions.js";
import { publishSnapshot, rememberSnapshot, sliceForOfficer, sliceForView, weeklyNotes } from "../services/recruitmentAnalytics/command.js";
import { timedQuery } from "../services/recruitmentAnalytics/query.js";

const CACHE_MS = 60_000;
const cache = new Map();
const lastGood = new Map();

function isPipelineDesk(user) {
  return user?.role === "superuser" || user?.role === "sales_coordinator";
}

function isManager(user) {
  return isPipelineDesk(user) || user?.role === "manager" || user?.role === "company_admin";
}

function canReadRecruitment(user) {
  return isManager(user) || user?.role === "sales_officer";
}

const OFFICER_BLOCKED_VIEWS = new Set(["sources", "scouts", "weekly"]);

function filtersFrom(req) {
  const channels = String(req.query.channels || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const districts = String(req.query.districts || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    role: req.query.role ? String(req.query.role) : "all",
    channels,
    districts,
  };
}

export function createRecruitmentAnalyticsRouter({ dbQuery, hasDb, appendAudit, connect }) {
  if (connect) dbQuery = (sql, params) => timedQuery(connect, sql, params);
  const router = express.Router();

  async function bundleFor(filters) {
    const key = JSON.stringify({ from: filters.from || "", to: filters.to || "" });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await loadRecruitmentBundle(dbQuery, filters);
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  function clearCache() {
    cache.clear();
  }

  router.get("/definitions", (req, res) => {
    if (!isManager(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const admin = req.authUser?.role === "superuser";
    const definitions = Object.values(DEFINITIONS).map((row) =>
      admin ? row : { id: row.id, label: row.label, definition: row.definition }
    );
    res.json({
      version: DEFINITIONS_VERSION,
      source: "analytics.person_facts",
      sql: admin ? "SELECT * FROM analytics.person_facts" : null,
      definitions,
    });
  });

  router.get("/snapshot", async (req, res) => {
    const filters = filtersFrom(req);
    const view = req.query.view ? String(req.query.view) : "all";
    const officer = req.authUser?.role === "sales_officer";
    const key = JSON.stringify({
      from: filters.from || "",
      to: filters.to || "",
      role: filters.role,
      channels: filters.channels,
      districts: filters.districts,
      desk: isPipelineDesk(req.authUser),
      names: isPipelineDesk(req.authUser) || officer,
    });
    const present = (snapshot) => (officer ? sliceForOfficer(snapshot) : sliceForView(snapshot, view));
    try {
      if (!canReadRecruitment(req.authUser) || (officer && OFFICER_BLOCKED_VIEWS.has(view))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable.", code: "db_unavailable" });
        return;
      }
      const started = Date.now();
      const bundle = await bundleFor(filters);
      const snapshot = buildSnapshot(bundle.people, {
        ...filters,
        now: new Date(),
        opensByChannel: bundle.opensByChannel,
        spend: bundle.spend,
        targets: bundle.targets,
        supplyDemand: bundle.supplyDemand,
        stated: bundle.stated,
        duplicatePhones: bundle.duplicatePhones,
        trackedLinksThisWeek: bundle.trackedLinksThisWeek,
        freshnessMinutes: 0,
        includeNames: isPipelineDesk(req.authUser) || officer,
        includeContact: isPipelineDesk(req.authUser),
        modules: bundle.modules,
      });
      snapshot.meta.durationMs = Date.now() - started;
      if (!isPipelineDesk(req.authUser) && snapshot.scouts?.rows) {
        snapshot.scouts.rows = snapshot.scouts.rows.map((row) => ({ ...row, label: "Scout" }));
      }
      const check = reconcile(snapshot);
      if (!check.ok && process.env.NODE_ENV !== "production") {
        console.error("[recruitment] reconciliation", check.failures.map((f) => f.id).join(","));
      }
      const served = rememberSnapshot(lastGood, key, { ok: true, snapshot: publishSnapshot(snapshot) });
      res.json(present(served.snapshot));
    } catch (err) {
      const served = rememberSnapshot(lastGood, key, {
        ok: false,
        error: err instanceof Error ? err.message : "Last refresh failed",
      });
      if (served.ok) {
        res.json(present(served.snapshot));
        return;
      }
      const status = err?.code === "migration_required" ? 503 : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : "Could not build the recruitment snapshot.",
        code: err?.code || "snapshot_failed",
      });
    }
  });

  router.get("/people", async (req, res) => {
    try {
      const officer = req.authUser?.role === "sales_officer";
      if (!isPipelineDesk(req.authUser) && !officer) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!hasDb() || !dbQuery) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      const filters = filtersFrom(req);
      const bundle = await bundleFor(filters);
      const snapshot = buildSnapshot(bundle.people, { ...filters, opensByChannel: bundle.opensByChannel, spend: bundle.spend, targets: bundle.targets, supplyDemand: bundle.supplyDemand, stated: bundle.stated, modules: bundle.modules });
      const metric = req.query.metric ? String(req.query.metric) : "";
      const ids = new Set(
        metric
          ? peopleForMetric(snapshot, metric, {
              role: req.query.personRole ? String(req.query.personRole) : undefined,
              stage: req.query.stage ? String(req.query.stage) : undefined,
              step: req.query.step ? String(req.query.step) : undefined,
              channel: req.query.channel ? String(req.query.channel) : undefined,
              activated: req.query.activated === "1",
            })
          : Object.values(snapshot.pipeline || {}).flatMap((rows) => rows.flatMap((row) => row.personIds || []))
      );
      const people = bundle.people
        .filter((p) => !p.isInternal && !p.isSynthetic && ids.has(p.personId))
        .map((p) => publicPerson(p))
        .filter((p) => !officer || visibleToSalesOfficer(p));
      res.json({ people, n: people.length, definitionId: "M-REACH" });
    } catch (err) {
      res.status(err?.code === "migration_required" ? 503 : 500).json({
        error: err instanceof Error ? err.message : "Could not list people.",
      });
    }
  });

  router.post("/reveal", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const personId = String(req.body?.personId || "");
    if (!personId) {
      res.status(400).json({ error: "personId is required." });
      return;
    }
    try {
      const bundle = await bundleFor({});
      const person = bundle.people.find((p) => p.personId === personId);
      if (!person) {
        res.status(404).json({ error: "Person not found." });
        return;
      }
      appendAudit?.(req.authUser.id, req.authUser.role, "recruitment.reveal_phone", "person", personId, {});
      res.json({ person: publicPerson(person, { reveal: true }) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Could not reveal." });
    }
  });

  router.post("/events", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await recordStaffEvent(dbQuery, {
      ...req.body,
      actorId: req.authUser.id,
    });
    if (!result.ok) {
      res.status(result.status || 500).json({ error: result.error || "Could not save." });
      return;
    }
    clearCache();
    appendAudit?.(req.authUser.id, req.authUser.role, "recruitment.event", "person", req.body?.personId, {
      type: req.body?.type,
    });
    res.json({ ok: true });
  });

  router.post("/spend", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const amount = Number(req.body?.amountRwf);
    const channel = String(req.body?.channel || "").trim();
    const date = String(req.body?.date || "").slice(0, 10);
    if (!channel || !date || !Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: "Date, channel, and a spend amount in RWF are required." });
      return;
    }
    try {
      await dbQuery(
        `INSERT INTO ad_spend (date, channel, campaign, amount_rwf, entered_by)
         VALUES ($1::date, $2, $3, $4, $5::uuid)`,
        [date, channel, req.body?.campaign || null, Math.round(amount), req.authUser.id]
      );
      clearCache();
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not save spend." });
    }
  });

  router.post("/targets", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const metric = String(req.body?.metric || "").trim();
    const value = Number(req.body?.value);
    const effectiveFrom = String(req.body?.effectiveFrom || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const tier = req.body?.tier === "t2" ? "t2" : "t1";
    const scope = req.body?.scope === "per_scout" ? "per_scout" : "team";
    const role = String(req.body?.role || "seller");
    if (!metric || !Number.isFinite(value)) {
      res.status(400).json({ error: "Metric and value are required." });
      return;
    }
    try {
      const inserted = await dbQuery(
        `INSERT INTO recruitment_targets (role, metric, scope, value, effective_from, created_by, tier)
         VALUES ($1, $2, $3, $4, $5::date, $6::uuid, $7)
         RETURNING id::text AS id`,
        [role, metric, scope, value, effectiveFrom, req.authUser.id, tier]
      );
      clearCache();
      appendAudit?.(req.authUser.id, req.authUser.role, "recruitment.target", "target", inserted.rows[0]?.id, {
        metric,
        effectiveFrom,
      });
      res.json({ ok: true, id: inserted.rows[0]?.id });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not save the target." });
    }
  });

  router.get("/links", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const rows = await dbQuery(
        `SELECT code, channel, campaign, creative, target_role AS "targetRole", destination, created_at AS "createdAt"
           FROM tracked_links
          ORDER BY created_at DESC
          LIMIT 50`
      );
      res.json({ links: rows.rows });
    } catch (err) {
      res.status(503).json({ error: "Tracked links are not installed yet. Apply migration 088." });
    }
  });

  router.post("/links", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const channel = String(req.body?.channel || "").trim();
    const destination = String(req.body?.destination || "/signup").trim();
    if (!channel || !destination.startsWith("/")) {
      res.status(400).json({ error: "Channel and a destination path are required." });
      return;
    }
    const code = String(req.body?.code || newLinkCode()).trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    try {
      await dbQuery(
        `INSERT INTO tracked_links (code, channel, campaign, creative, target_role, destination, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)`,
        [code, channel, req.body?.campaign || null, req.body?.creative || null, req.body?.targetRole || null, destination, req.authUser.id]
      );
      clearCache();
      res.json({ ok: true, code, url: `${destination}${destination.includes("?") ? "&" : "?"}link=${code}` });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not create the link." });
    }
  });

  router.get("/briefings", async (req, res) => {
    if (!isManager(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const stored = await dbQuery(
        `SELECT week_start::text AS week, created_at AS "createdAt"
           FROM recruitment_briefings
          ORDER BY week_start DESC
          LIMIT 16`
      );
      res.json({ weeks: stored.rows });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not list weeks." });
    }
  });

  router.post("/briefings", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const parsed = weeklyNotes(req.body?.notes || req.body || {});
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const filters = filtersFrom(req);
      const bundle = await bundleFor(filters);
      const snapshot = buildSnapshot(bundle.people, { ...filters, spend: bundle.spend, targets: bundle.targets, supplyDemand: bundle.supplyDemand, stated: bundle.stated, modules: bundle.modules });
      const week = kigaliWeek(new Date()).from;
      await dbQuery(
        `INSERT INTO recruitment_briefings (week_start, snapshot, notes, created_by)
         VALUES ($1::date, $2::jsonb, $3::jsonb, $4::uuid)
         ON CONFLICT (week_start) DO UPDATE SET snapshot = EXCLUDED.snapshot, notes = EXCLUDED.notes`,
        [week, JSON.stringify(publishSnapshot(snapshot)), JSON.stringify(parsed.notes), req.authUser.id]
      );
      res.json({ ok: true, week });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not freeze the briefing." });
    }
  });

  router.get("/briefings/:week", async (req, res) => {
    if (!isManager(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const stored = await dbQuery(
        `SELECT snapshot, notes, week_start::text AS week FROM recruitment_briefings WHERE week_start = $1::date`,
        [req.params.week]
      );
      if (!stored.rows[0]) {
        res.status(404).json({ error: "No frozen briefing for that week." });
        return;
      }
      const liveBundle = await bundleFor({});
      const live = buildSnapshot(liveBundle.people, { targets: liveBundle.targets, spend: liveBundle.spend, supplyDemand: liveBundle.supplyDemand, stated: liveBundle.stated });
      const frozen = stored.rows[0].snapshot;
      const restated = frozen?.kpis?.sellersActivated?.value !== live.kpis.sellersActivated.value;
      res.json({ week: stored.rows[0].week, snapshot: frozen, notes: stored.rows[0].notes || [], restated });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not open the briefing." });
    }
  });

  router.post("/dismiss", async (req, res) => {
    if (!isPipelineDesk(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) {
      res.status(400).json({ error: "A reason is required." });
      return;
    }
    try {
      await dbQuery(
        `INSERT INTO recruitment_action_dismissals (rule_id, week_start, reason, actor_id)
         VALUES ($1, $2::date, $3, $4::uuid)`,
        [String(req.body?.ruleId || "R0"), kigaliWeek(new Date()).from, reason.slice(0, 500), req.authUser.id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(503).json({ error: err instanceof Error ? err.message : "Could not dismiss." });
    }
  });

  router.post("/usage", async (req, res) => {
    if (!isManager(req.authUser)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const tab = String(req.body?.tab || "command").slice(0, 40);
    try {
      await dbQuery(`INSERT INTO recruitment_usage (role, tab) VALUES ($1, $2)`, [req.authUser.role, tab]);
    } catch {
      /* usage must not break the page */
    }
    res.json({ ok: true });
  });

  return router;
}
