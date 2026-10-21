/**
 * Signups CRM persistence: attempts, people pipeline, touches.
 */

import crypto from "node:crypto";
import {
  attributionFieldsFromReq,
  ONBOARDING_STAGES,
} from "./signupAttribution.js";
import { hashReachVisitor } from "./marketReach.js";

const ACCOUNT_TYPES = new Set(["farmer", "buyer", "scout"]);

/**
 * @param {Function} dbQuery
 * @param {object} input
 */
export async function recordSignupAttempt(dbQuery, input) {
  if (typeof dbQuery !== "function") return { ok: false };
  const outcome = input.outcome === "succeeded" ? "succeeded" : "failed";
  const accountType = ACCOUNT_TYPES.has(String(input.accountType || ""))
    ? String(input.accountType)
    : null;
  const attr = input.attr || {};
  const visitorHash = hashReachVisitor(attr.visitorId) || null;
  try {
    const r = await dbQuery(
      `INSERT INTO signup_attempts (
         account_type, email, phone, full_name, district,
         source, utm_source, utm_medium, utm_campaign, click_id_kind,
         landing_path, visitor_hash, outcome, error_code, error_message, user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::uuid)
       RETURNING id::text AS id`,
      [
        accountType,
        input.email ? String(input.email).trim().toLowerCase().slice(0, 320) : null,
        input.phone ? String(input.phone).trim().slice(0, 40) : null,
        input.fullName ? String(input.fullName).trim().slice(0, 200) : null,
        input.district ? String(input.district).trim().slice(0, 80) : null,
        attr.source || "direct",
        attr.utmSource || null,
        attr.utmMedium || null,
        attr.utmCampaign || null,
        attr.clickIdKind || null,
        attr.landingPath ? String(attr.landingPath).slice(0, 400) : null,
        visitorHash,
        outcome,
        input.errorCode ? String(input.errorCode).slice(0, 80) : null,
        input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        input.userId || null,
      ]
    );
    return { ok: true, id: r.rows[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "attempt insert failed" };
  }
}

/**
 * Best-effort attempt log from an Express req + outcome.
 */
export async function logSignupAttemptFromReq(dbQuery, req, extra = {}) {
  const attr = attributionFieldsFromReq(req);
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  return recordSignupAttempt(dbQuery, {
    accountType: extra.accountType ?? body.accountType,
    email: extra.email ?? body.email,
    phone: extra.phone ?? body.phone,
    fullName: extra.fullName ?? body.fullName,
    district: extra.district ?? body.district,
    outcome: extra.outcome || "failed",
    errorCode: extra.errorCode || null,
    errorMessage: extra.errorMessage || null,
    userId: extra.userId || null,
    attr,
  });
}

/**
 * @param {Function} dbQuery
 * @param {object} input
 */
export async function upsertPeopleOnboarding(dbQuery, input) {
  const userId = String(input.userId || "").trim();
  const accountType = String(input.accountType || "").trim();
  if (!userId || !ACCOUNT_TYPES.has(accountType)) {
    return { ok: false, error: "Missing user or account type." };
  }
  const stage = ONBOARDING_STAGES.has(String(input.stage || ""))
    ? String(input.stage)
    : "new";
  const attr = input.attr || {};
  try {
    await dbQuery(
      `INSERT INTO people_onboarding (
         user_id, account_type, phone, district, source,
         utm_source, utm_medium, utm_campaign, stage, created_at, updated_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         phone = COALESCE(EXCLUDED.phone, people_onboarding.phone),
         district = COALESCE(EXCLUDED.district, people_onboarding.district),
         source = CASE
           WHEN people_onboarding.source = 'unknown' AND EXCLUDED.source IS NOT NULL
             THEN EXCLUDED.source
           ELSE people_onboarding.source
         END,
         utm_source = COALESCE(people_onboarding.utm_source, EXCLUDED.utm_source),
         utm_medium = COALESCE(people_onboarding.utm_medium, EXCLUDED.utm_medium),
         utm_campaign = COALESCE(people_onboarding.utm_campaign, EXCLUDED.utm_campaign),
         updated_at = now()`,
      [
        userId,
        accountType,
        input.phone || null,
        input.district || null,
        attr.source || "direct",
        attr.utmSource || null,
        attr.utmMedium || null,
        attr.utmCampaign || null,
        stage,
      ]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "onboarding upsert failed" };
  }
}

/**
 * @param {Function} dbQuery
 * @param {string} userId
 * @param {{ stage?: string, ownerUserId?: string|null, nextCallAt?: string|null, isBlocked?: boolean }} patch
 */
export async function patchPeopleOnboarding(dbQuery, userId, patch) {
  const sets = [];
  const params = [];
  let i = 1;
  if (patch.stage != null) {
    if (!ONBOARDING_STAGES.has(String(patch.stage))) {
      return { ok: false, error: "Unknown stage.", status: 400 };
    }
    sets.push(`stage = $${i++}`);
    params.push(String(patch.stage));
  }
  if (patch.ownerUserId !== undefined) {
    sets.push(`owner_user_id = $${i++}::uuid`);
    params.push(patch.ownerUserId || null);
  }
  if (patch.nextCallAt !== undefined) {
    sets.push(`next_call_at = $${i++}::timestamptz`);
    params.push(patch.nextCallAt || null);
  }
  if (typeof patch.isBlocked === "boolean") {
    sets.push(`is_blocked = $${i++}`);
    params.push(patch.isBlocked);
  }
  if (!sets.length) return { ok: false, error: "Nothing to update.", status: 400 };
  sets.push("updated_at = now()");
  params.push(userId);
  try {
    const r = await dbQuery(
      `UPDATE people_onboarding SET ${sets.join(", ")}
        WHERE user_id = $${i}::uuid
        RETURNING user_id::text AS "userId"`,
      params
    );
    if (!r.rows[0]) return { ok: false, error: "Person not found.", status: 404 };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "patch failed", status: 503 };
  }
}

/**
 * @param {Function} dbQuery
 * @param {object} input
 */
export async function addOnboardingTouch(dbQuery, input) {
  const userId = String(input.userId || "").trim();
  const kind = String(input.kind || "").trim();
  if (!userId || !["call", "whatsapp", "note"].includes(kind)) {
    return { ok: false, error: "Invalid touch.", status: 400 };
  }
  const outcome = input.outcome
    ? ["reached", "no_answer", "scheduled", "done"].includes(String(input.outcome))
      ? String(input.outcome)
      : null
    : null;
  if (input.outcome && !outcome) {
    return { ok: false, error: "Invalid outcome.", status: 400 };
  }
  const id = crypto.randomUUID();
  try {
    await dbQuery(
      `INSERT INTO onboarding_touches
         (id, user_id, kind, outcome, scheduled_for, note, by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::timestamptz, $6, $7::uuid)`,
      [
        id,
        userId,
        kind,
        outcome,
        input.scheduledFor || null,
        input.note ? String(input.note).slice(0, 2000) : null,
        input.byUserId || null,
      ]
    );
    const touchSets = ["last_touch_at = now()", "updated_at = now()"];
    const touchParams = [userId];
    if (outcome === "scheduled" && input.scheduledFor) {
      touchSets.push(`next_call_at = $2::timestamptz`);
      touchParams.push(input.scheduledFor);
      touchSets.push(`stage = CASE WHEN stage = 'new' THEN 'call_booked' ELSE stage END`);
    } else if (outcome === "reached" || outcome === "done") {
      touchSets.push(
        `stage = CASE WHEN stage IN ('new', 'unreachable') THEN 'contacted' ELSE stage END`
      );
    } else if (outcome === "no_answer") {
      touchSets.push(`stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END`);
    }
    await dbQuery(
      `UPDATE people_onboarding SET ${touchSets.join(", ")} WHERE user_id = $1::uuid`,
      touchParams
    );
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "touch failed", status: 503 };
  }
}

export function buildSignupDeskEmail({
  accountType,
  fullName,
  email,
  phone,
  district,
  source,
  companyName,
}) {
  const typeLabel =
    accountType === "buyer" ? "Buyer" : accountType === "scout" ? "Scout" : "Seller";
  const subject = `New ${typeLabel.toLowerCase()} signup · ${fullName || email || "someone"}`;
  const wa = phone
    ? `https://wa.me/${String(phone).replace(/\D/g, "").replace(/^0/, "250")}`
    : null;
  const lines = [
    `${typeLabel} signed up.`,
    fullName ? `Name: ${fullName}` : null,
    companyName ? `Business: ${companyName}` : null,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
    district ? `District: ${district}` : null,
    source ? `Source: ${source}` : null,
    wa ? `WhatsApp: ${wa}` : null,
    "",
    "Open Signups in the app to call them and move their stage.",
  ].filter((x) => x != null);
  const text = lines.join("\n");
  const html = `<p><strong>${typeLabel}</strong> signed up.</p>
<ul>
${fullName ? `<li>Name: ${escapeHtml(fullName)}</li>` : ""}
${companyName ? `<li>Business: ${escapeHtml(companyName)}</li>` : ""}
${email ? `<li>Email: ${escapeHtml(email)}</li>` : ""}
${phone ? `<li>Phone: ${escapeHtml(phone)}</li>` : ""}
${district ? `<li>District: ${escapeHtml(district)}</li>` : ""}
${source ? `<li>Source: ${escapeHtml(source)}</li>` : ""}
${wa ? `<li><a href="${wa}">WhatsApp</a></li>` : ""}
</ul>
<p>Open <strong>Signups</strong> in the app to call them and move their stage.</p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Scout payout gate: stage must be onboarded or active. */
export async function scoutPayoutAllowed(dbQuery, userId) {
  try {
    const r = await dbQuery(
      `SELECT stage, is_blocked FROM people_onboarding WHERE user_id = $1::uuid`,
      [userId]
    );
    const row = r.rows[0];
    if (!row) return { ok: true, allowed: true, reason: "no_row" };
    if (row.is_blocked) return { ok: true, allowed: false, reason: "blocked" };
    if (row.stage === "onboarded" || row.stage === "active") {
      return { ok: true, allowed: true, reason: row.stage };
    }
    return { ok: true, allowed: false, reason: row.stage };
  } catch {
    return { ok: true, allowed: true, reason: "lookup_failed" };
  }
}
