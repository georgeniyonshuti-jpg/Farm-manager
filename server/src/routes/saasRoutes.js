/**
 * SaaS onboarding, billing, super-admin, and announcements (Phases 3–5).
 */

import express from "express";
import crypto from "node:crypto";
import { emitEntitySync } from "../services/clevafarm/emitEntitySync.js";
import * as erp from "../services/erpnext/erpnext.client.js";
import { setErpnextCompanyLink } from "../services/erpnext/erpnext.config.js";
import { fetchClevaUserExists } from "../services/clevaSso.js";
import {
  deleteCompanyHard,
  exportCompanyBundle,
  invalidateSessionsForCompany,
} from "../services/tenant/companyDelete.js";
import {
  isMarketSignupRequest,
  loadMarketHostCompany,
} from "../services/pipeline/marketHostCompany.js";
import { createUniqueFarmSlug } from "../services/pipeline/farmProfiles.js";
import {
  classifyClaim,
  executeSellerClaim,
  loadClaimByToken,
} from "../services/pipeline/sellerClaim.js";
import { recordMarketReach } from "../services/pipeline/marketReach.js";
import { attributionFieldsFromReq } from "../services/pipeline/signupAttribution.js";
import { normalizeRwandaPhone, rwandaPhoneError } from "../services/pipeline/rwandaPhone.js";
import { normalizePlace } from "../services/pipeline/rwandaLocations.js";
import {
  buildSignupDeskEmail,
  logSignupAttemptFromReq,
  upsertPeopleOnboarding,
} from "../services/pipeline/peopleOnboarding.js";
import { upsertRecruitmentContact } from "../services/pipeline/recruitmentContacts.js";
import { emailsForDeskRoles, notifyMany } from "../services/pipeline/marketNotify.js";
import {
  accountTypeForContact,
  classifySignupToken,
  consumeSignupToken,
  contactTypeKey,
  crmEnabled,
  loadSignupToken,
} from "../services/pipeline/crmBridge.js";

import {
  createBillingPlan,
  deactivateBillingPlan,
  listBillingPlans,
  resolveCheckoutPlan,
  updateBillingPlan,
} from "../services/billing/billingPlans.js";

const TRIAL_DAYS = 30;

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
    scrubCompanyFromMemory,
    dbPool,
  } = deps;

  async function signupEntityForCrm(q, userId, accountType) {
    if (accountType === "buyer") {
      const r = await q(
        `SELECT id::text AS id FROM pipeline_buyers WHERE user_id = $1::uuid LIMIT 1`,
        [userId]
      );
      return { type: "pipeline_buyer", id: r.rows[0]?.id || userId };
    }
    if (accountType === "scout") return { type: "user", id: userId };
    const r = await q(
      `SELECT id::text AS id FROM farm_profiles WHERE owner_user_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return { type: "farm_profile", id: r.rows[0]?.id || userId };
  }

  async function withDbTransaction(fn) {
    if (!dbPool?.connect) return fn(dbQuery);
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      const q = (sql, params = []) => client.query(sql, params);
      const out = await fn(q);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* already aborted */
      }
      throw err;
    } finally {
      client.release();
    }
  }

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

  router.get("/auth/crm-signup", async (req, res) => {
    if (!crmEnabled()) return res.status(404).json({ error: "Not found." });
    if (!hasDb()) return res.status(503).json({ error: "Database unavailable." });
    const raw = String(req.query.t || "").trim();
    if (!raw) return res.status(400).json({ error: "Missing link." });
    try {
      const row = await loadSignupToken(dbQuery, raw);
      const gate = classifySignupToken(row);
      if (!gate.ok) return res.status(gate.status || 400).json({ error: gate.message, code: gate.code });
      const prefill = row.prefill_json || {};
      res.json({
        accountType: accountTypeForContact(row.contact_type),
        fullName: prefill.name || prefill.fullName || "",
        phone: prefill.phone || "",
        district: prefill.district || "",
        companyName: prefill.businessName || prefill.companyName || "",
      });
    } catch (e) {
      console.error("[ERROR]", "[crm] signup preview failed:", e instanceof Error ? e.message : "error");
      res.status(503).json({ error: "Could not read signup link." });
    }
  });

  router.post("/auth/signup", async (req, res) => {
    const fail = (status, body) => {
      const errorCode = body?.code || `http_${status}`;
      const errorMessage = body?.error || "Signup failed";
      void logSignupAttemptFromReq(dbQuery, req, {
        outcome: "failed",
        errorCode,
        errorMessage,
        accountType: String(req.body?.accountType ?? "farmer").trim().toLowerCase(),
        email: req.body?.email,
        phone: req.body?.phone ?? req.body?.whatsapp,
        fullName: req.body?.fullName,
        district: req.body?.district,
      }).catch(() => {});
      res.status(status).json(body);
    };

    if (!hasDb()) {
      fail(503, { error: "Database unavailable." });
      return;
    }
    const accountTypeRaw = String(req.body?.accountType ?? "farmer").trim().toLowerCase();
    let accountType =
      accountTypeRaw === "buyer" ? "buyer" : accountTypeRaw === "scout" ? "scout" : "farmer";
    const crmToken = String(req.body?.crmToken ?? "").trim();
    const companyName = String(req.body?.companyName ?? req.body?.businessName ?? "").trim();
    const fullName = String(req.body?.fullName ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const districtRaw = String(req.body?.district ?? "").trim().slice(0, 120);
    const sectorRaw = String(req.body?.sector ?? "").trim().slice(0, 80);
    const phone = String(req.body?.phone ?? req.body?.whatsapp ?? "").trim().slice(0, 40);
    const buyerType = String(req.body?.buyerType ?? "butcher").trim().slice(0, 40) || "butcher";

    if ((!companyName && accountType !== "scout") || !fullName || !email || !password) {
      fail(400, {
        error:
          accountType === "buyer"
            ? "businessName, fullName, email, and password are required."
            : accountType === "scout"
              ? "fullName, email, and password are required."
              : "companyName, fullName, email, and password are required.",
        code: "validation",
      });
      return;
    }
    if (password.length < 8) {
      fail(400, { error: "Password must be at least 8 characters.", code: "weak_password" });
      return;
    }
    if (crmToken) {
      if (!crmEnabled()) {
        fail(404, { error: "Not found.", code: "crm_off" });
        return;
      }
      if (!hasDb()) {
        fail(503, { error: "Database unavailable." });
        return;
      }
      try {
        const crmRow = await loadSignupToken(dbQuery, crmToken);
        const gate = classifySignupToken(crmRow);
        if (!gate.ok) {
          fail(gate.status || 400, { error: gate.message, code: gate.code || "crm_token" });
          return;
        }
        const forced = accountTypeForContact(contactTypeKey(crmRow.contact_type));
        if (forced) accountType = forced;
      } catch (e) {
        console.error("[ERROR]", "[crm] signup token failed:", e instanceof Error ? e.message : "error");
        fail(503, { error: "Could not read signup link.", code: "crm_token" });
        return;
      }
      if (accountType !== "scout" && !companyName && !fullName) {
        fail(400, { error: "fullName is required.", code: "validation" });
        return;
      }
    }
    if (usersByEmail.has(email)) {
      fail(409, { error: "An account with this email already exists.", code: "email_taken" });
      return;
    }
    try {
      if (await fetchClevaUserExists(email)) {
        fail(409, {
          error: "This email is registered in Cleva. Use Login with Cleva instead of signup.",
          code: "cleva_login_required",
        });
        return;
      }
    } catch {
      /* lookup best-effort */
    }

    const claimRaw = String(req.body?.claim ?? "").trim();
    const fromMarket =
      isMarketSignupRequest(req) ||
      accountType === "scout" ||
      (accountType === "farmer" && claimRaw.length > 0) ||
      crmToken.length > 0;
    if (claimRaw && accountType !== "farmer") {
      fail(400, { error: "This invite link is for a seller account.", code: "claim_wrong_type" });
      return;
    }
    const contactRequired = fromMarket || accountType === "buyer" || accountType === "scout";
    const phoneStored = normalizeRwandaPhone(phone);
    const located = normalizePlace(districtRaw, sectorRaw, { required: contactRequired });
    if (!located.ok) {
      fail(400, { error: located.error, code: located.code || "district_required" });
      return;
    }
    const district = located.district || "";
    const sector = located.sector;
    if (contactRequired) {
      const phoneError = rwandaPhoneError(phoneStored, { required: true });
      if (phoneError) {
        fail(400, { error: phoneError, code: "phone_invalid" });
        return;
      }
    } else if (phoneStored) {
      const phoneError = rwandaPhoneError(phoneStored);
      if (phoneError) {
        fail(400, { error: phoneError, code: "phone_invalid" });
        return;
      }
    }
    const slugBase = slugify(companyName) || (accountType === "buyer" ? "buyer" : "farm");
    const userId = crypto.randomUUID();
    const role =
      accountType === "buyer" ? "buyer" : accountType === "scout" ? "vet" : fromMarket ? "manager" : "company_admin";
    // A finished market signup is an Application. Desk approval activates the seller, scout, or buyer.
    const departmentKeys = [];
    const pageAccess =
      accountType === "scout"
        ? JSON.stringify(["farm_pipeline"])
        : accountType === "buyer" || fromMarket
          ? JSON.stringify(["farm_market"])
          : null;
    const attr = attributionFieldsFromReq(req);

    try {
      if (claimRaw) {
        const existingClaim = await loadClaimByToken(dbQuery, claimRaw);
        const early = classifyClaim({
          claim: existingClaim,
          email,
          userId: null,
          marketOnly: true,
          existingProfile: null,
          listingCount: 0,
        });
        if (!early.ok) {
          if (early.action === "needs_review" && existingClaim) {
            await dbQuery(
              `UPDATE farm_profile_claims
                  SET status = 'needs_review', review_reason = $2
                WHERE id = $1::uuid AND status = 'pending'`,
              [existingClaim.id, early.code]
            );
          } else if (early.code === "expired" && existingClaim?.status === "pending") {
            await dbQuery(
              `UPDATE farm_profile_claims SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`,
              [existingClaim.id]
            );
          }
          fail(early.status || 400, {
            error: early.message,
            code: early.code || "claim_failed",
          });
          return;
        }
      }

      let companyId;
      let slug;
      let hostCompanyName = companyName;

      if (fromMarket) {
        const host = await loadMarketHostCompany(dbQuery);
        if (!host.ok) {
          fail(503, {
            error: host.error || "Market signup is unavailable. Ask ops to set MARKET_HOST_COMPANY_ID.",
            code: "market_host_missing",
          });
          return;
        }
        companyId = host.company.id;
        slug = host.company.slug;
        hostCompanyName = host.company.name || companyName;
      } else {
        slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
        companyId = crypto.randomUUID();
        const companyVerification = accountType === "farmer" ? "pending" : "verified";
        await dbQuery(
          `INSERT INTO companies (id, name, slug, plan, trial_ends_at, is_active, verification_status)
           VALUES ($1::uuid, $2, $3, 'trial', $4::timestamptz, true, $5)`,
          [companyId, companyName, slug, trialEndsInDays(TRIAL_DAYS), companyVerification]
        );
        void emitEntitySync("farm_company", companyId).catch(() => {});
        await dbQuery(
          `INSERT INTO billing_subscriptions (company_id, status, plan, trial_ends_at)
           VALUES ($1::uuid, 'trialing', 'trial', $2::timestamptz)`,
          [companyId, trialEndsInDays(TRIAL_DAYS)]
        );
        try {
          const { bootstrapCompanyInsights } = await import(
            "../services/insightsBootstrap.js"
          );
          await bootstrapCompanyInsights(companyId, dbQuery, { marketHost: false });
        } catch (bootErr) {
          console.warn(
            "[saas] insights bootstrap skipped:",
            bootErr instanceof Error ? bootErr.message : bootErr
          );
        }
      }

      const passwordHash = hashPassword(password);
      const row = {
        id: userId,
        email,
        displayName: fullName,
        passwordHash,
        role,
        businessUnitAccess: accountType === "buyer" || fromMarket ? "farm" : "both",
        canViewSensitiveFinancial: accountType === "farmer" && !fromMarket,
        departmentKeys,
        pageAccess:
          accountType === "scout"
            ? ["farm_pipeline"]
            : accountType === "buyer" || fromMarket
              ? ["farm_market"]
              : null,
        companyId,
      };

      async function writeAccount(q) {
        await q(
          `INSERT INTO users (
            id, email, full_name, role, password_hash, business_unit_access,
            can_view_sensitive_financial, department_keys, page_access, company_id
          ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::uuid)`,
          [
            userId,
            email,
            fullName,
            role,
            passwordHash,
            accountType === "buyer" || fromMarket ? "farm" : "both",
            accountType === "farmer" && !fromMarket,
            JSON.stringify(departmentKeys),
            pageAccess,
            companyId,
          ]
        );

        if (accountType === "buyer") {
          await q(
            `INSERT INTO pipeline_buyers
               (name, buyer_type, district, sector, phone, whatsapp, user_id, verification_status, active)
             VALUES ($1, $2, $3, $4, $5, $5, $6::uuid, 'pending', true)`,
            [companyName || fullName, buyerType, district || null, sector, phoneStored || null, userId]
          );
        } else if (fromMarket && claimRaw) {
          const claimed = await executeSellerClaim(q, {
            rawToken: claimRaw,
            userId,
            email,
            hostCompanyId: companyId,
            marketOnly: true,
          });
          if (!claimed.ok) {
            const err = new Error(claimed.message || "Could not claim this flock.");
            err.statusCode = claimed.status || 400;
            err.code = claimed.code;
            throw err;
          }
        } else if (accountType === "scout") {
          await q(
            `INSERT INTO scout_applications (user_id, phone, district, sector, status)
             VALUES ($1::uuid, $2, $3, $4, 'pending')`,
            [userId, phoneStored || null, district || null, sector]
          );
        } else if (fromMarket) {
          const profileSlug = await createUniqueFarmSlug(q, companyName);
          await q(
            `INSERT INTO farm_profiles
               (company_id, slug, display_name, district, sector, contact_phone, contact_whatsapp,
                created_by, owner_user_id, verification_status)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $6, $7::uuid, $7::uuid, 'pending')`,
            [companyId, profileSlug, companyName, district || null, sector, phoneStored || null, userId]
          );
        }
        if (crmToken) {
          const entity = await signupEntityForCrm(q, userId, accountType);
          const consumed = await consumeSignupToken(q, {
            raw: crmToken,
            userId,
            entityType: entity.type,
            entityId: entity.id,
            phone: phoneStored,
          });
          if (!consumed.ok) {
            const err = new Error(consumed.message || "This signup link could not be used.");
            err.statusCode = consumed.status || 400;
            err.code = consumed.code || "crm_token";
            throw err;
          }
        }
      }

      if (claimRaw || crmToken) await withDbTransaction(writeAccount);
      else await writeAccount(dbQuery);

      row.companySlug = slug;
      row.companyName = fromMarket ? hostCompanyName : companyName;
      upsertUser(row);
      const token = newSessionId();
      sessions.set(token, { userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
      appendAudit(userId, role, "auth.signup", fromMarket ? "user" : "company", fromMarket ? userId : companyId, {
        email,
        companyName,
        accountType,
        from: fromMarket ? "market" : "farm_os",
        source: attr.source,
      });
      if (fromMarket) {
        void recordMarketReach(dbQuery, {
          eventType: "account_created",
          source: attr.source,
          visitorId: attr.visitorId || req.body?.visitorId,
          userId,
          accountType,
        }).catch(() => {});
        void upsertPeopleOnboarding(dbQuery, {
          userId,
          accountType,
          phone: phoneStored,
          district,
          sector,
          attr,
          stage: "new",
        }).catch(() => {});
        void upsertRecruitmentContact(dbQuery, {
          phone: phoneStored,
          name: fullName,
          district,
          sector,
          accountType,
          source: "signup",
          userId,
        }).catch(() => {});
        void logSignupAttemptFromReq(dbQuery, req, {
          outcome: "succeeded",
          userId,
          accountType,
          email,
          phone: phoneStored,
          fullName,
          district,
        }).catch(() => {});
        void emailsForDeskRoles(dbQuery)
          .then((recipients) =>
            notifyMany(
              recipients,
              buildSignupDeskEmail({
                accountType,
                fullName,
                email,
                phone: phoneStored,
                district,
                source: attr.source,
                companyName,
              })
            )
          )
          .catch(() => {});
      } else {
        void logSignupAttemptFromReq(dbQuery, req, {
          outcome: "succeeded",
          userId,
          accountType,
          email,
          phone: phoneStored,
          fullName,
          district,
        }).catch(() => {});
      }
      res.status(201).json({
        token,
        user: sanitizeUser(row),
        accountType,
        verificationStatus: "pending",
        from: fromMarket ? "market" : "farm_os",
      });
    } catch (e) {
      if (e && e.statusCode) {
        fail(e.statusCode, { error: e.message, code: e.code || "claim_failed" });
        return;
      }
      const msg = e instanceof Error ? e.message : "Signup failed";
      if (msg.includes("companies_slug") || msg.includes("unique")) {
        fail(409, { error: "Company name is already taken. Try a different name.", code: "slug_taken" });
        return;
      }
      if (msg.includes("scout_applications")) {
        fail(500, {
          error: "Scout signup needs migration 077_scout_applications. Ask ops to apply it.",
          code: "migration_077",
        });
        return;
      }
      if (msg.includes("verification_status") || msg.includes("column")) {
        console.error("[ERROR]", "[saas] signup schema:", msg);
        fail(500, {
          error: "Marketplace migrations required. Ask ops to apply 063_marketplace_accounts.",
          code: "migration_063",
        });
        return;
      }
      console.error("[ERROR]", "[saas] signup:", msg);
      fail(500, { error: "Could not create workspace. Please try again.", code: "signup_failed" });
    }
  });

  router.get("/companies/resolve/:slug", requireAuth, async (req, res) => {
    const slug = String(req.params.slug ?? "").trim().toLowerCase();
    if (!slug) {
      res.status(400).json({ error: "Slug is required." });
      return;
    }
    if (!hasDb()) {
      // In-memory demo mode (no DATABASE_URL): allow default-farm so local chrome review works.
      if (slug === "default-farm") {
        res.json({
          company: {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Default farm",
            slug: "default-farm",
            plan: "trial",
            is_active: true,
          },
        });
        return;
      }
      res.status(503).json({ error: "Database unavailable." });
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
      // Non-superusers may only resolve their own linked company.
      if (req.authUser?.role !== "superuser") {
        const userCompanyId = String(req.authUser?.companyId ?? "");
        if (!userCompanyId || userCompanyId !== String(company.id)) {
          res.status(403).json({ error: "Company not allowed for this user", code: "company_forbidden" });
          return;
        }
      }
      res.json({ company });
    } catch (e) {
      console.error("[ERROR]", "[saas] companies/resolve:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not resolve company." });
    }
  });

  router.get("/onboarding/status", requireAuth, async (req, res) => {
    if (!hasDb()) {
      res.json({
        company: {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Default farm",
          slug: "default-farm",
          plan: "pro",
          trial_ends_at: null,
          is_active: true,
          payment_overdue: false,
        },
        flockCount: 0,
        teamCount: 1,
        trialExpired: false,
      });
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
      let trialDaysRemaining = null;
      let trialEndsAt = company?.trial_ends_at ?? null;
      if (company?.plan === "trial" && company?.trial_ends_at) {
        const ms = new Date(company.trial_ends_at).getTime() - Date.now();
        trialDaysRemaining = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
      }
      res.json({
        company,
        flockCount: flocks.rows[0]?.c ?? 0,
        teamCount: team.rows[0]?.c ?? 0,
        trialExpired: Boolean(trialExpired) && company?.is_active !== false,
        trialDaysRemaining,
        trialEndsAt,
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

  router.get("/billing/plans", async (_req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const plans = await listBillingPlans(dbQuery, { activeOnly: true });
      res.json({ plans });
    } catch (e) {
      console.error("[ERROR]", "[saas] billing/plans:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not load plans." });
    }
  });

  router.post("/billing/checkout", requireAuth, async (req, res) => {
    const planId = String(req.body?.planId ?? "starter");
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    const plan = await resolveCheckoutPlan(dbQuery, planId);
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

  const SUPER_ADMIN_COMPANY_SELECT = `SELECT c.id::text, c.name, c.slug, c.plan, c.trial_ends_at, c.is_active, c.payment_overdue,
                ec.erpnext_company,
                ec.erpnext_base_url,
                (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS users,
                (SELECT COUNT(*)::int FROM poultry_flocks f
                  WHERE f.company_id = c.id AND f.status <> 'archived') AS flocks
         FROM companies c
         LEFT JOIN erpnext_config ec ON ec.company_id = c.id`;

  router.get("/super-admin/companies", requireAuth, requireSuperuser, async (_req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const companies = await dbQuery(`${SUPER_ADMIN_COMPANY_SELECT} ORDER BY c.created_at DESC`);
      res.json({ companies: companies.rows });
    } catch (e) {
      res.status(500).json({ error: "Could not load companies." });
    }
  });

  router.get("/super-admin/companies/:id", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!id) {
      res.status(400).json({ error: "Company id is required." });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const result = await dbQuery(`${SUPER_ADMIN_COMPANY_SELECT} WHERE c.id = $1::uuid`, [id]);
      const company = result.rows[0];
      if (!company) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      res.json({ company });
    } catch (e) {
      res.status(500).json({ error: "Could not load company." });
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

  router.post("/super-admin/companies/:id/set-plan", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const plan = String(req.body?.plan ?? "enterprise").trim().toLowerCase();
    if (!id) {
      res.status(400).json({ error: "Company id is required." });
      return;
    }
    if (!plan || plan === "trial") {
      res.status(400).json({ error: "Choose a paid plan (starter, pro, or enterprise)." });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const company = await dbQuery(`SELECT id FROM companies WHERE id = $1::uuid`, [id]);
      if (!company.rows[0]) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      const planRow = await dbQuery(
        `SELECT id FROM billing_plans WHERE id = $1 AND is_active = true`,
        [plan]
      );
      if (!planRow.rows[0]) {
        res.status(400).json({ error: `Unknown or inactive plan '${plan}'.` });
        return;
      }
      await dbQuery(
        `UPDATE companies
         SET plan = $2, trial_ends_at = NULL, is_active = true, payment_overdue = false, updated_at = now()
         WHERE id = $1::uuid`,
        [id, plan]
      );
      await dbQuery(
        `UPDATE billing_subscriptions
         SET status = 'active', plan = $2, trial_ends_at = NULL, updated_at = now()
         WHERE company_id = $1::uuid`,
        [id, plan]
      );
      appendAudit(req.authUser.id, req.authUser.role, "company.set_plan", "company", id, { plan });
      res.json({ ok: true, plan });
    } catch (e) {
      console.error("[ERROR]", "[saas] set-plan:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "Could not set company plan." });
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
      if (!active) {
        invalidateSessionsForCompany(sessions, usersById, id);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Could not update company status." });
    }
  });

  router.get("/super-admin/erpnext/companies", requireAuth, requireSuperuser, async (req, res) => {
    try {
      const { resolveErpBaseFromInput, cigErpDefaults } =
        await import("../services/erpnext/erpBaseFromInput.js");
      const resolved = resolveErpBaseFromInput({
        erpnextBaseUrl: req.query.baseUrl,
        subdomain: req.query.subdomain,
      });
      if (!resolved.ok) {
        res.status(400).json({ error: resolved.error, companies: [] });
        return;
      }
      const companies = await erp.getCompanyList(null, { baseUrl: resolved.erpnextBaseUrl });
      const cig = cigErpDefaults();
      res.json({
        companies,
        erpnextBaseUrl: resolved.erpnextBaseUrl,
        subdomain: resolved.subdomain,
        cigPreset: cig,
      });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Could not load ERPNext companies.",
        companies: [],
      });
    }
  });

  router.get("/super-admin/erpnext/cig-preset", requireAuth, requireSuperuser, async (_req, res) => {
    const { cigErpDefaults } = await import("../services/erpnext/erpBaseFromInput.js");
    res.json(cigErpDefaults());
  });

  router.post("/super-admin/companies/:id/erpnext-link", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const useCig = Boolean(req.body?.useCig);
    let erpnextCompany = String(req.body?.erpnextCompany ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "Company id is required." });
      return;
    }
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const { resolveErpBaseFromInput, cigErpDefaults } =
        await import("../services/erpnext/erpBaseFromInput.js");
      const cig = cigErpDefaults();
      const resolved = useCig
        ? { ok: true, erpnextBaseUrl: cig.erpnextBaseUrl, subdomain: cig.subdomain }
        : resolveErpBaseFromInput({
            erpnextBaseUrl: req.body?.erpnextBaseUrl,
            subdomain: req.body?.subdomain,
          });
      if (!resolved.ok) {
        res.status(400).json({ error: resolved.error });
        return;
      }
      if (useCig && !erpnextCompany) erpnextCompany = cig.erpnextCompany;
      if (!erpnextCompany) {
        res.status(400).json({ error: "erpnextCompany is required." });
        return;
      }
      const exists = await dbQuery(`SELECT id FROM companies WHERE id = $1::uuid`, [id]);
      if (!exists.rows[0]) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      const link = await setErpnextCompanyLink(id, erpnextCompany, resolved.erpnextBaseUrl);
      try {
        const { bootstrapFarmInsightsPacks } = await import("../services/insightsBootstrap.js");
        await bootstrapFarmInsightsPacks(id, dbQuery);
      } catch (bootErr) {
        console.warn(
          "[saas] farm insights bootstrap after ERP link:",
          bootErr instanceof Error ? bootErr.message : bootErr
        );
      }
      res.json({ ok: true, link });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Could not save ERPNext company link." });
    }
  });

  router.get("/super-admin/companies/:id/export", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const bundle = await exportCompanyBundle(dbQuery, id);
      if (!bundle.company) {
        res.status(404).json({ error: "Company not found." });
        return;
      }
      const slug = bundle.company.slug ?? id;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="company-export-${slug}.json"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Export failed." });
    }
  });

  router.delete("/super-admin/companies/:id", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "");
    const confirmSlug = String(req.body?.confirmSlug ?? "").trim();
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      invalidateSessionsForCompany(sessions, usersById, id);
      await deleteCompanyHard(dbQuery, id, { confirmSlug });
      if (typeof scrubCompanyFromMemory === "function") {
        scrubCompanyFromMemory(id);
      }
      appendAudit(req.authUser.id, req.authUser.role, "company.deleted", "company", id, { confirmSlug });
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed.";
      const status = msg.includes("not found") ? 404 : msg.includes("slug") || msg.includes("default") ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  router.get("/super-admin/plans", requireAuth, requireSuperuser, async (_req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const plans = await listBillingPlans(dbQuery, { activeOnly: false });
      res.json({ plans });
    } catch (e) {
      res.status(500).json({ error: "Could not load plans." });
    }
  });

  router.post("/super-admin/plans", requireAuth, requireSuperuser, async (req, res) => {
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const plan = await createBillingPlan(dbQuery, req.body ?? {});
      appendAudit(req.authUser.id, req.authUser.role, "billing_plan.created", "billing_plan", plan.id, {
        name: plan.name,
      });
      res.status(201).json({ plan });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create plan.";
      res.status(400).json({ error: msg });
    }
  });

  router.put("/super-admin/plans/:id", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const plan = await updateBillingPlan(dbQuery, id, req.body ?? {});
      appendAudit(req.authUser.id, req.authUser.role, "billing_plan.updated", "billing_plan", id, {
        name: plan.name,
      });
      res.json({ plan });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not update plan.";
      const status = msg.includes("not found") ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  });

  router.delete("/super-admin/plans/:id", requireAuth, requireSuperuser, async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!hasDb()) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    try {
      const result = await deactivateBillingPlan(dbQuery, id);
      appendAudit(req.authUser.id, req.authUser.role, "billing_plan.deleted", "billing_plan", id, {});
      res.json({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete plan.";
      res.status(400).json({ error: msg });
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
