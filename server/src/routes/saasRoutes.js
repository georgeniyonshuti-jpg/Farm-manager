/**
 * SaaS onboarding, billing, super-admin, and announcements (Phases 3–5).
 */

import express from "express";
import crypto from "node:crypto";
import { emitEntitySync } from "../services/clevafarm/emitEntitySync.js";
import * as erp from "../services/erpnext/erpnext.client.js";
import { setErpnextCompanyLink } from "../services/erpnext/erpnext.config.js";

const PLANS = [
  { id: "starter", name: "Starter", stripePriceId: process.env.STRIPE_PRICE_STARTER },
  { id: "pro", name: "Pro", stripePriceId: process.env.STRIPE_PRICE_PRO },
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 30);
}

function trialEndsInDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function createSaasRouter(deps) {
  const {
    dbQuery,
    hasDb,
    requireAuth,
    requireSuperuser,
    hashPassword,
    newSessionId,
    sessions,
    persistUserToDb,
    upsertUser,
    sanitizeUser,
    appendAudit,
    usersByEmail,
    usersById,
  } = deps;

  const router = express.Router();

  async function getUserCompanyId(userId) {
    const r = await dbQuery(`SELECT company_id::text AS id FROM users WHERE id = $1::uuid`, [userId]);
    return r.rows[0]?.id ?? null;
  }

  async function getCompanyById(companyId) {
    const r = await dbQuery(
      `SELECT id::text, name, slug, plan, trial_ends_at, is_active, payment_overdue
       FROM companies WHERE id = $1::uuid`,
      [companyId]
    );
    return r.rows[0] ?? null;
  }

  router.post("/auth/signup", async (req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    const companyName = String(req.body?.companyName ?? "").trim();
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!companyName || !fullName || !email || !password) {
      res.status(400).json({ error: "companyName, fullName, email, and password are required." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (usersByEmail.has(email)) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const slug = slugify(companyName);
    const companyId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    try {
      await dbQuery(
        `INSERT INTO companies (id, name, slug, plan, trial_ends_at, is_active)
         VALUES ($1::uuid, $2, $3, 'trial', $4::timestamptz, true)`,
        [companyId, companyName, slug, trialEndsInDays(14)]
      );
      void emitEntitySync("farm_company", companyId).catch(() => {});
      await dbQuery(
        `INSERT INTO billing_subscriptions (company_id, status, plan, trial_ends_at)
         VALUES ($1::uuid, 'trialing', 'trial', $2::timestamptz)`,
        [companyId, trialEndsInDays(14)]
      );

      const row = {
        id: userId,
        email,
        displayName: fullName,
        passwordHash: hashPassword(password),
        role: "manager",
        businessUnitAccess: "both",
        canViewSensitiveFinancial: true,
        departmentKeys: [],
        pageAccess: null,
        companyId,
      };

      await dbQuery(
        `INSERT INTO users (
          id, email, full_name, role, password_hash, business_unit_access,
          can_view_sensitive_financial, department_keys, company_id
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, true, '[]'::jsonb, $7::uuid)`,
        [
          userId,
          email,
          fullName,
          "manager",
          row.passwordHash,
          "both",
          companyId,
        ]
      );

      row.companySlug = slug;
      row.companyName = companyName;
      upsertUser(row);
      const token = newSessionId();
      sessions.set(token, { userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
      appendAudit(userId, "manager", "auth.signup", "company", companyId, { email, companyName });
      res.status(201).json({ token, user: sanitizeUser(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Signup failed";
      if (msg.includes("companies_slug") || msg.includes("unique")) {
        res.status(409).json({ error: "Company name is already taken. Try a different name." });
        return;
      }
      console.error("[ERROR]", "[saas] signup:", msg);
      res.status(500).json({ error: "Could not create workspace. Please try again." });
    }
  });

  router.get("/companies/resolve/:slug", requireAuth, async (req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    const slug = String(req.params.slug ?? "").trim().toLowerCase();
    if (!slug) {
      res.status(400).json({ error: "Slug is required." });
      return;
    }
    try {
      const r = await dbQuery(
        `SELECT id::text, name, slug, plan, is_active
         FROM companies
         WHERE slug = $1 AND is_active = true`,
        [slug]
      );
      const company = r.rows[0] ?? null;
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      res.json({ company });
    } catch (e) {
      console.error("[ERROR]", "[saas] companies/resolve:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not resolve company." });
    }
  });

  router.get("/onboarding/status", requireAuth, async (req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const companyId = await getUserCompanyId(req.authUser.id);
      if (!companyId) {
        res.json({ company: null, flockCount: 0, teamCount: 0, trialExpired: false });
        return;
      }
      const company = await getCompanyById(companyId);
      const flocks = await dbQuery(
        `SELECT COUNT(*)::int AS c FROM poultry_flocks
         WHERE status <> 'archived' AND company_id = $1::uuid`,
        [companyId]
      );
      const team = await dbQuery(
        `SELECT COUNT(*)::int AS c FROM users WHERE company_id = $1::uuid`,
        [companyId]
      );
      const trialExpired =
        company?.plan === "trial" &&
        company?.trial_ends_at &&
        new Date(company.trial_ends_at).getTime() < Date.now();
      res.json({
        company,
        flockCount: flocks.rows[0]?.c ?? 0,
        teamCount: team.rows[0]?.c ?? 0,
        trialExpired: Boolean(trialExpired) && company?.is_active !== false,
      });
    } catch (e) {
      console.error("[ERROR]", "[saas] onboarding/status:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not load onboarding status." });
    }
  });

  router.get("/announcements/active", requireAuth, async (_req, res) => {
    if (!hasDb()) {
      res.json({ announcements: [] });
      return;
    }
    try {
      const r = await dbQuery(
        `SELECT id::text, title, message, type
         FROM announcements
         WHERE is_active = true
           AND starts_at <= now()
           AND (ends_at IS NULL OR ends_at > now())
         ORDER BY starts_at DESC
         LIMIT 5`
      );
      res.json({ announcements: r.rows });
    } catch (e) {
      res.status(500).json({ error: "Could not load announcements." });
    }
  });

  router.post("/billing/checkout", requireAuth, async (req, res) => {
    const planId = String(req.body?.planId ?? "starter");
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) {
      res.status(400).json({ error: "Invalid plan." });
      return;
    }
    const frontend = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    try {
      if (stripeKey && plan.stripePriceId) {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(stripeKey);
        const companyId = await getUserCompanyId(req.authUser.id);
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          success_url: `${frontend}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${frontend}/billing/cancelled`,
          metadata: { companyId: companyId ?? "", planId },
        });
        res.json({ checkoutUrl: session.url });
        return;
      }
      res.json({ checkoutUrl: `${frontend}/billing/success?plan=${encodeURIComponent(planId)}` });
    } catch (e) {
      console.error("[ERROR]", "[saas] billing/checkout:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not start checkout." });
    }
  });

  router.post("/billing/webhook", async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    try {
      let event = req.body;
      if (stripeKey && webhookSecret && req.rawBody && Buffer.isBuffer(req.rawBody)) {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(stripeKey);
        const sig = req.headers["stripe-signature"];
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      } else if (typeof req.body === "object" && req.body !== null) {
        event = req.body;
      } else {
        res.status(400).json({ error: "Invalid webhook payload" });
        return;
      }

      if (!hasDb()) {
        res.json({ received: true });
        return;
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const companyId = event.data?.object?.metadata?.companyId;
          const planId = event.data?.object?.metadata?.planId || "starter";
          if (companyId) {
            await dbQuery(
              `UPDATE companies SET plan = $2, trial_ends_at = NULL, is_active = true, payment_overdue = false, updated_at = now()
               WHERE id = $1::uuid`,
              [companyId, planId]
            );
            await dbQuery(
              `UPDATE billing_subscriptions SET status = 'active', plan = $2, trial_ends_at = NULL, updated_at = now()
               WHERE company_id = $1::uuid`,
              [companyId, planId]
            );
          }
          break;
        }
        case "invoice.payment_failed": {
          const companyId = event.data?.object?.metadata?.companyId;
          if (companyId) {
            await dbQuery(
              `UPDATE companies SET payment_overdue = true, updated_at = now() WHERE id = $1::uuid`,
              [companyId]
            );
          }
          break;
        }
        case "customer.subscription.deleted": {
          const companyId = event.data?.object?.metadata?.companyId;
          if (companyId) {
            await dbQuery(
              `UPDATE companies SET is_active = false, updated_at = now() WHERE id = $1::uuid`,
              [companyId]
            );
          }
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (e) {
      console.error("[ERROR]", "[saas] billing/webhook:", e instanceof Error ? e.message : e);
      res.status(400).json({ error: "Webhook error" });
    }
  });

  router.get("/super-admin/companies", requireAuth, requireSuperuser, async (_req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const companies = await dbQuery(
        `SELECT c.id::text, c.name, c.plan, c.trial_ends_at, c.is_active, c.payment_overdue,
                ec.erpnext_company,
                (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS users,
                (SELECT COUNT(*)::int FROM poultry_flocks f
                  WHERE f.company_id = c.id AND f.status <> 'archived') AS flocks
         FROM companies c
         LEFT JOIN erpnext_config ec ON ec.company_id = c.id
         ORDER BY c.created_at DESC`
      );
      res.json({ companies: companies.rows });
    } catch (e) {
      res.status(500).json({ error: "Could not load companies." });
    }
  });

  router.post("/super-admin/companies/:id/extend-trial", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const days = Math.min(90, Math.max(1, Number(req.body?.days ?? 14)));
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      await dbQuery(
        `UPDATE companies SET plan = 'trial', trial_ends_at = $2::timestamptz, is_active = true, updated_at = now()
         WHERE id = $1::uuid`,
        [id, trialEndsInDays(days)]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Could not extend trial." });
    }
  });

  router.post("/super-admin/companies/:id/suspend", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const active = Boolean(req.body?.active);
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      await dbQuery(
        `UPDATE companies SET is_active = $2, updated_at = now() WHERE id = $1::uuid`,
        [id, active]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Could not update company status." });
    }
  });

  router.get("/super-admin/erpnext/companies", requireAuth, requireSuperuser, async (_req, res) => {
    try {
      const companies = await erp.getCompanyList();
      res.json({ companies: Array.isArray(companies) ? companies : [] });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not load ERPNext companies." });
    }
  });

  router.post("/super-admin/companies/:id/erpnext-link", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const erpnextCompany = String(req.body?.erpnextCompany ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "Company id is required." });
      return;
    }
    if (!erpnextCompany) {
      res.status(400).json({ error: "erpnextCompany is required." });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const exists = await dbQuery(`SELECT id FROM companies WHERE id = $1::uuid`, [id]);
      if (!exists.rows[0]) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      const link = await setErpnextCompanyLink(id, erpnextCompany);
      res.json({ ok: true, link });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save ERPNext company link." });
    }
  });

  router.post("/super-admin/announcements", requireAuth, requireSuperuser, async (req, res) => {
    const title = String(req.body?.title ?? "Announcement").slice(0, 120);
    const message = String(req.body?.message ?? "").trim();
    const type = String(req.body?.type ?? "info");
    if (!message) {
      res.status(400).json({ error: "Message is required." });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      await dbQuery(
        `INSERT INTO announcements (title, message, type, created_by)
         VALUES ($1, $2, $3, $4::uuid)`,
        [title, message, type, req.authUser.id]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Could not publish announcement." });
    }
  });

  return router;
}
