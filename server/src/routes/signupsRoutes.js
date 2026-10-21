/**
 * Desk Signups CRM: funnel, people, attempts, touches, CSV export.
 */

import express from "express";
import {
  addOnboardingTouch,
  patchPeopleOnboarding,
} from "../services/pipeline/peopleOnboarding.js";
import { campaignSignupLinks, ONBOARDING_STAGES } from "../services/pipeline/signupAttribution.js";
import { loadMarketReach } from "../services/pipeline/marketReach.js";

function isDesk(user) {
  return user?.role === "superuser" || user?.role === "sales_coordinator";
}

function daysParam(raw, fallback = 7) {
  const n = Number(raw);
  if (n === 30 || n === 90) return n;
  if (n === 7) return 7;
  return fallback;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function createSignupsRouter(deps) {
  const { dbQuery, hasDb, requireAuth, appendAudit, usersById } = deps;
  const router = express.Router();

  function requireDesk(req, res) {
    if (!isDesk(req.authUser)) {
      res.status(403).json({ error: "Desk access required." });
      return false;
    }
    return true;
  }

  function requireDb(res) {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return false;
    }
    return true;
  }

  router.use(requireAuth);

  router.get("/funnel", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const days = daysParam(req.query.days, 7);
    const sourceFilter = String(req.query.source || "").trim().toLowerCase();
    try {
      const reach = await loadMarketReach(dbQuery, { days });
      const attemptParams = [];
      let attemptWhere = `created_at >= now() - ($1::int * interval '1 day')`;
      attemptParams.push(days);
      if (sourceFilter) {
        attemptParams.push(sourceFilter);
        attemptWhere += ` AND lower(COALESCE(source, 'direct')) = $${attemptParams.length}`;
      }
      const [attempts, bySource, errors, stages, newCount] = await Promise.all([
        dbQuery(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE outcome = 'succeeded')::int AS succeeded,
             COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed
           FROM signup_attempts WHERE ${attemptWhere}`,
          attemptParams
        ),
        dbQuery(
          `SELECT COALESCE(source, 'direct') AS source,
                  COUNT(*)::int AS attempts,
                  COUNT(*) FILTER (WHERE outcome = 'succeeded')::int AS succeeded,
                  COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed,
                  COALESCE(utm_campaign, '') AS campaign
             FROM signup_attempts
            WHERE ${attemptWhere}
            GROUP BY 1, 5
            ORDER BY attempts DESC
            LIMIT 40`,
          attemptParams
        ),
        dbQuery(
          `SELECT COALESCE(error_code, 'unknown') AS code,
                  COUNT(*)::int AS n
             FROM signup_attempts
            WHERE ${attemptWhere} AND outcome = 'failed'
            GROUP BY 1
            ORDER BY n DESC
            LIMIT 10`,
          attemptParams
        ),
        dbQuery(
          `SELECT stage, COUNT(*)::int AS n
             FROM people_onboarding
            GROUP BY stage`
        ),
        dbQuery(
          `SELECT COUNT(*)::int AS n FROM people_onboarding WHERE stage = 'new'`
        ),
      ]);
      const a = attempts.rows[0] || {};
      res.json({
        days,
        reach: {
          todayOpened: reach.todayOpened,
          week: reach.week,
          sources: reach.sources,
        },
        attempts: {
          total: Number(a.total || 0),
          succeeded: Number(a.succeeded || 0),
          failed: Number(a.failed || 0),
        },
        bySource: bySource.rows,
        topErrors: errors.rows,
        stages: Object.fromEntries(stages.rows.map((r) => [r.stage, Number(r.n)])),
        newCount: Number(newCount.rows[0]?.n || 0),
        links: campaignSignupLinks("https://market.cleva.rw"),
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Funnel failed." });
    }
  });

  router.get("/people", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const accountType = String(req.query.accountType || "").trim();
    const stage = String(req.query.stage || "").trim();
    const source = String(req.query.source || "").trim().toLowerCase();
    const district = String(req.query.district || "").trim();
    const q = String(req.query.q || "").trim();
    const days = req.query.days != null ? daysParam(req.query.days, 90) : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = ["1=1"];
    const params = [];
    if (accountType && ["farmer", "buyer", "scout"].includes(accountType)) {
      params.push(accountType);
      where.push(`p.account_type = $${params.length}`);
    }
    if (stage && ONBOARDING_STAGES.has(stage)) {
      params.push(stage);
      where.push(`p.stage = $${params.length}`);
    }
    if (source) {
      params.push(source);
      where.push(`lower(COALESCE(p.source, 'unknown')) = $${params.length}`);
    }
    if (district) {
      params.push(`%${district}%`);
      where.push(`p.district ILIKE $${params.length}`);
    }
    if (days) {
      params.push(days);
      where.push(`p.created_at >= now() - ($${params.length}::int * interval '1 day')`);
    }
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(
        `(u.full_name ILIKE $${i} OR u.email ILIKE $${i} OR COALESCE(p.phone, '') ILIKE $${i})`
      );
    }
    params.push(limit);
    const lim = params.length;
    params.push(offset);
    const off = params.length;
    try {
      const r = await dbQuery(
        `SELECT p.user_id::text AS "userId",
                p.account_type AS "accountType",
                p.phone, p.district, p.source,
                p.utm_source AS "utmSource",
                p.utm_medium AS "utmMedium",
                p.utm_campaign AS "utmCampaign",
                p.stage,
                p.owner_user_id::text AS "ownerUserId",
                p.next_call_at AS "nextCallAt",
                p.last_touch_at AS "lastTouchAt",
                p.is_blocked AS "isBlocked",
                p.created_at AS "createdAt",
                u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive",
                owner.full_name AS "ownerName"
           FROM people_onboarding p
           JOIN users u ON u.id = p.user_id
           LEFT JOIN users owner ON owner.id = p.owner_user_id
          WHERE ${where.join(" AND ")}
          ORDER BY p.created_at DESC
          LIMIT $${lim} OFFSET $${off}`,
        params
      );
      const countParams = params.slice(0, -2);
      const c = await dbQuery(
        `SELECT COUNT(*)::int AS n
           FROM people_onboarding p
           JOIN users u ON u.id = p.user_id
          WHERE ${where.join(" AND ")}`,
        countParams
      );
      res.json({ people: r.rows, total: Number(c.rows[0]?.n || 0), limit, offset });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "People list failed." });
    }
  });

  router.get("/people/:userId", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const userId = req.params.userId;
    try {
      const [person, touches, profile, buyer, scout, lots] = await Promise.all([
        dbQuery(
          `SELECT p.user_id::text AS "userId",
                  p.account_type AS "accountType",
                  p.phone, p.district, p.source,
                  p.utm_source AS "utmSource",
                  p.utm_medium AS "utmMedium",
                  p.utm_campaign AS "utmCampaign",
                  p.stage,
                  p.owner_user_id::text AS "ownerUserId",
                  p.next_call_at AS "nextCallAt",
                  p.last_touch_at AS "lastTouchAt",
                  p.is_blocked AS "isBlocked",
                  p.created_at AS "createdAt",
                  u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive"
             FROM people_onboarding p
             JOIN users u ON u.id = p.user_id
            WHERE p.user_id = $1::uuid`,
          [userId]
        ),
        dbQuery(
          `SELECT t.id::text AS id, t.kind, t.outcome,
                  t.scheduled_for AS "scheduledFor",
                  t.note, t.created_at AS "createdAt",
                  u.full_name AS "byName"
             FROM onboarding_touches t
             LEFT JOIN users u ON u.id = t.by_user_id
            WHERE t.user_id = $1::uuid
            ORDER BY t.created_at DESC
            LIMIT 50`,
          [userId]
        ),
        dbQuery(
          `SELECT id::text AS id, display_name AS "displayName",
                  verification_status AS "verificationStatus",
                  district, contact_phone AS "contactPhone"
             FROM farm_profiles WHERE owner_user_id = $1::uuid
             ORDER BY created_at DESC LIMIT 5`,
          [userId]
        ),
        dbQuery(
          `SELECT id::text AS id, name, verification_status AS "verificationStatus",
                  phone, district, active
             FROM pipeline_buyers WHERE user_id = $1::uuid LIMIT 1`,
          [userId]
        ),
        dbQuery(
          `SELECT status, phone, district, created_at AS "createdAt"
             FROM scout_applications WHERE user_id = $1::uuid`,
          [userId]
        ),
        dbQuery(
          `SELECT id::text AS id, bird_count AS "birdCount",
                  verification_status AS "verificationStatus",
                  district
             FROM pipeline_lots
            WHERE created_by = $1::uuid
               OR scouted_by = $1::uuid
               OR listed_by = $1::uuid
            ORDER BY created_at DESC LIMIT 20`,
          [userId]
        ).catch(() => ({ rows: [] })),
      ]);
      if (!person.rows[0]) {
        return res.status(404).json({ error: "Person not found." });
      }
      res.json({
        person: person.rows[0],
        touches: touches.rows,
        profiles: profile.rows,
        buyer: buyer.rows[0] || null,
        scoutApplication: scout.rows[0] || null,
        lots: lots.rows,
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Person detail failed." });
    }
  });

  router.patch("/people/:userId", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const userId = req.params.userId;
    const body = req.body || {};
    const patch = {};
    if (body.stage != null) patch.stage = body.stage;
    if (body.ownerUserId !== undefined) patch.ownerUserId = body.ownerUserId || null;
    if (body.nextCallAt !== undefined) patch.nextCallAt = body.nextCallAt || null;

    if (body.block === true || body.isBlocked === true) {
      patch.isBlocked = true;
      try {
        await dbQuery(`UPDATE users SET is_active = false, updated_at = now() WHERE id = $1::uuid`, [
          userId,
        ]);
        const { enqueueUserDeactivated } = await import("../services/pipeline/crmBridge.js");
        void enqueueUserDeactivated(userId);
        const mem = usersById?.get?.(userId);
        if (mem) mem.isActive = false;
      } catch (e) {
        return res.status(503).json({ error: e instanceof Error ? e.message : "Block failed." });
      }
    } else if (body.block === false || body.isBlocked === false) {
      patch.isBlocked = false;
      try {
        await dbQuery(`UPDATE users SET is_active = true, updated_at = now() WHERE id = $1::uuid`, [
          userId,
        ]);
        const mem = usersById?.get?.(userId);
        if (mem) mem.isActive = true;
      } catch (e) {
        return res.status(503).json({ error: e instanceof Error ? e.message : "Unblock failed." });
      }
    }

    const result = await patchPeopleOnboarding(dbQuery, userId, patch);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    if (appendAudit) {
      appendAudit(req.authUser.id, req.authUser.role, "signups.person.patch", "user", userId, patch);
    }
    res.json({ ok: true });
  });

  router.post("/people/:userId/touches", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const result = await addOnboardingTouch(dbQuery, {
      userId: req.params.userId,
      kind: req.body?.kind,
      outcome: req.body?.outcome,
      scheduledFor: req.body?.scheduledFor || req.body?.scheduled_for,
      note: req.body?.note,
      byUserId: req.authUser.id,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    if (appendAudit) {
      appendAudit(req.authUser.id, req.authUser.role, "signups.touch", "user", req.params.userId, {
        kind: req.body?.kind,
        outcome: req.body?.outcome,
      });
    }
    res.status(201).json({ ok: true, id: result.id });
  });

  router.get("/attempts", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const outcome = String(req.query.outcome || "failed").trim();
    const handled = String(req.query.handled || "").trim();
    const days = daysParam(req.query.days, 30);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const where = [`created_at >= now() - ($1::int * interval '1 day')`];
    const params = [days];
    if (outcome === "failed" || outcome === "succeeded") {
      params.push(outcome);
      where.push(`outcome = $${params.length}`);
    }
    if (handled === "open") {
      where.push(`handled_at IS NULL`);
    } else if (handled === "done") {
      where.push(`handled_at IS NOT NULL`);
    }
    params.push(limit);
    try {
      const r = await dbQuery(
        `SELECT id::text AS id, created_at AS "createdAt",
                account_type AS "accountType",
                email, phone, full_name AS "fullName", district,
                source, utm_source AS "utmSource", utm_campaign AS "utmCampaign",
                outcome, error_code AS "errorCode", error_message AS "errorMessage",
                user_id::text AS "userId",
                handled_at AS "handledAt"
           FROM signup_attempts
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${params.length}`,
        params
      );
      res.json({ attempts: r.rows });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Attempts failed." });
    }
  });

  router.patch("/attempts/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      if (req.body?.handled === true) {
        await dbQuery(
          `UPDATE signup_attempts SET handled_at = now(), handled_by = $2::uuid WHERE id = $1::uuid`,
          [req.params.id, req.authUser.id]
        );
      } else if (req.body?.handled === false) {
        await dbQuery(
          `UPDATE signup_attempts SET handled_at = NULL, handled_by = NULL WHERE id = $1::uuid`,
          [req.params.id]
        );
      } else {
        return res.status(400).json({ error: "Pass handled: true or false." });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Update failed." });
    }
  });

  router.get("/export.csv", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const r = await dbQuery(
        `SELECT p.created_at AS "createdAt",
                p.account_type AS "accountType",
                u.full_name AS "fullName", u.email, p.phone, p.district,
                p.source, p.utm_source AS "utmSource", p.utm_campaign AS "utmCampaign",
                p.stage, p.next_call_at AS "nextCallAt"
           FROM people_onboarding p
           JOIN users u ON u.id = p.user_id
          ORDER BY p.created_at DESC
          LIMIT 5000`
      );
      const header = [
        "createdAt",
        "accountType",
        "fullName",
        "email",
        "phone",
        "district",
        "source",
        "utmSource",
        "utmCampaign",
        "stage",
        "nextCallAt",
      ];
      const lines = [header.join(",")];
      for (const row of r.rows) {
        lines.push(header.map((k) => csvEscape(row[k])).join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="signups.csv"');
      res.send(lines.join("\n"));
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Export failed." });
    }
  });

  router.get("/new-count", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const r = await dbQuery(
        `SELECT COUNT(*)::int AS n FROM people_onboarding WHERE stage = 'new'`
      );
      res.json({ newCount: Number(r.rows[0]?.n || 0) });
    } catch {
      res.json({ newCount: 0 });
    }
  });

  return router;
}
