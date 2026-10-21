/**
 * Cleva side of the CRM bridge.
 * Frappe owns the WhatsApp inbox. This module links leads into market records,
 * hands sellers to scouts, and queues milestone events. It never publishes a listing.
 */

import crypto from "node:crypto";
import { marketPublicOrigin } from "./sellerClaim.js";

const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600];
const MAX_ATTEMPTS = 8;
const SIGNATURE_WINDOW_SEC = 5 * 60;
const SIGNUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SSO_TTL_SEC = 60;

export const SELLER_QUEUE_INSERT = `INSERT INTO crm_seller_queue
  (crm_lead_name, contact_name, phone_e164, district, bird_count, availability_date, handoff_note, ambiguous)
  VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)`;

let _dbQuery = null;

export function initCrmBridge(dbQuery) {
  _dbQuery = typeof dbQuery === "function" ? dbQuery : null;
}

export function crmEnabled(env = process.env) {
  return String(env.CRM_INTEGRATION_ENABLED || "").toLowerCase() === "true";
}

export function toE164(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 10) digits = `250${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("7")) digits = `250${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

export function phoneDigits(value) {
  const e164 = toE164(value);
  return e164 ? e164.slice(1) : null;
}

/** Mask for logs. Never print the full number. */
export function maskPhone(value) {
  const e164 = toE164(value) || "";
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 6)}*****${e164.slice(-2)}`;
}

export function contactTypeKey(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "seller" || s === "farmer") return "seller";
  if (s === "buyer") return "buyer";
  if (s === "scout" || s === "scout_candidate") return "scout_candidate";
  return null;
}

export function accountTypeForContact(contactType) {
  if (contactType === "seller") return "farmer";
  if (contactType === "buyer") return "buyer";
  if (contactType === "scout_candidate") return "scout";
  return null;
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "").trim()).digest("hex");
}

export function newSignupToken() {
  return crypto.randomBytes(16).toString("base64url");
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function signBody(secret, timestamp, rawBody) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyCrmSignature({ secret, timestamp, signature, rawBody, nowMs = Date.now() }) {
  const ts = Number(timestamp);
  if (!secret || !Number.isFinite(ts)) return { ok: false, code: "unauthorized" };
  if (Math.abs(nowMs / 1000 - ts) > SIGNATURE_WINDOW_SEC) return { ok: false, code: "unauthorized" };
  const expected = `v1=${signBody(secret, String(Math.trunc(ts)), rawBody)}`;
  const got = String(signature || "");
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: "unauthorized" };
  return { ok: true };
}

/**
 * Desk only. Ignores any role sent by the client.
 * @param {{ role?: string, isActive?: boolean } | null} user
 */
export function crmRoleForUser(user) {
  if (!user || user.isActive === false) return null;
  if (user.role === "superuser") return "supervisor";
  if (user.role === "sales_coordinator") return "marketer";
  return null;
}

export function buildSsoClaims(user, nowSec = Math.floor(Date.now() / 1000)) {
  const crmRole = crmRoleForUser(user);
  if (!crmRole || !user?.id || !user?.email) return null;
  return {
    iss: "cleva-market",
    aud: "cleva-crm",
    sub: String(user.id),
    email: String(user.email),
    name: String(user.displayName || user.fullName || user.email),
    crm_role: crmRole,
    jti: crypto.randomUUID(),
    iat: nowSec,
    exp: nowSec + SSO_TTL_SEC,
  };
}

export function signCrmJwt(claims, pem) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = crypto.sign("sha256", Buffer.from(data), crypto.createPrivateKey(pem));
  return `${data}.${b64url(sig)}`;
}

export function loadSsoPrivateKey(env = process.env) {
  const raw = String(env.CRM_SSO_PRIVATE_KEY || "").trim();
  if (!raw) return null;
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function signupUrlForToken(token, contactType) {
  const origin = marketPublicOrigin();
  if (!origin) return { ok: false, error: "FRONTEND_URL is not set." };
  const accountType = accountTypeForContact(contactType) || "farmer";
  const q = new URLSearchParams({
    from: "market",
    accountType,
    t: token,
  });
  const expires = new Date(Date.now() + SIGNUP_TTL_MS).toISOString();
  return { ok: true, url: `${origin}/signup?${q.toString()}`, expires_at: expires, accountType };
}

export function classifySignupToken(row, now = new Date()) {
  if (!row) return { ok: false, code: "invalid", status: 404, message: "This signup link is not valid." };
  if (row.used_at || row.usedAt) return { ok: false, code: "used", status: 409, message: "This signup link was already used." };
  const exp = new Date(row.expires_at || row.expiresAt || 0);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return { ok: false, code: "expired", status: 410, message: "This signup link has expired." };
  }
  return { ok: true };
}

export function matchIsCompatible(contactType, entityType) {
  if (contactType === "seller") return entityType === "farm_profile" || entityType === "seller_queue";
  if (contactType === "buyer") return entityType === "market_lead" || entityType === "pipeline_buyer";
  if (contactType === "scout_candidate") return entityType === "scout_application" || entityType === "user";
  return false;
}

/**
 * Pure convert decision. Never returns a public lot.
 */
export function decideConvert({ contactType, existingLeadLink, phoneMatches }) {
  if (!contactType) return { action: "reject", error: "contact_type is required." };
  if (existingLeadLink) {
    return {
      action: "existing",
      recordType: existingLeadLink.cleva_entity_type || existingLeadLink.entityType,
      recordId: existingLeadLink.cleva_entity_id || existingLeadLink.entityId,
      ambiguous: Boolean(existingLeadLink.ambiguous),
    };
  }
  const matches = Array.isArray(phoneMatches) ? phoneMatches : [];
  if (matches.length > 1) return { action: "ambiguous", matches };
  if (matches.length === 1) {
    const match = matches[0];
    if (match.entityType === "seller_queue") return { action: "ambiguous", matches };
    if (!matchIsCompatible(contactType, match.entityType)) return { action: "ambiguous", matches };
    return { action: "link", match };
  }
  if (contactType === "seller") return { action: "create_seller_queue" };
  if (contactType === "buyer") return { action: "create_market_lead" };
  if (contactType === "scout_candidate") return { action: "pending_scout" };
  return { action: "reject", error: "Unknown contact type." };
}

/** Assign is refused until staff have written why the scout is going. */
export function requireHandoffNote(existingNote, incomingNote) {
  const note = String(incomingNote || existingNote || "").trim();
  if (!note) return { ok: false, status: 400, error: "A handoff note is required before assigning a scout." };
  return { ok: true, note: note.slice(0, 2000) };
}

export function scoutCoversDistrict(scoutDistrict, sellerDistrict) {
  const scout = String(scoutDistrict || "").trim().toLowerCase();
  if (!scout) return true;
  return scout === String(sellerDistrict || "").trim().toLowerCase();
}

const VISIT_FROM = {
  contacted: new Set(["new", "contacted"]),
  visit_scheduled: new Set(["new", "contacted", "visit_scheduled"]),
  visit_completed: new Set(["visit_scheduled", "visit_completed"]),
  outcome_recorded: new Set(["visit_completed", "outcome_recorded"]),
};

export function nextVisitStatus(current, action) {
  const allowed = VISIT_FROM[action];
  if (!allowed || !allowed.has(current)) return null;
  return action;
}

export function scoutOwnsRow(row, userId) {
  if (!row || !userId) return false;
  const owner = row.assigned_scout_user_id || row.assignedScoutUserId;
  return owner && String(owner) === String(userId);
}

export function outboxAfterFailure(attemptsSoFar, httpStatus) {
  if (httpStatus >= 400 && httpStatus < 500) {
    return { status: "dead", attempts: attemptsSoFar + 1, delaySeconds: null };
  }
  const attempts = attemptsSoFar + 1;
  if (attempts >= MAX_ATTEMPTS) return { status: "dead", attempts, delaySeconds: null };
  const delaySeconds = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  return { status: "failed", attempts, delaySeconds };
}

function db() {
  if (!_dbQuery) throw new Error("CRM bridge database is not initialized.");
  return _dbQuery;
}

export async function rememberInbound(query, requestId) {
  const r = await query(
    `INSERT INTO crm_inbound_requests (request_id, result)
     VALUES ($1, 'received')
     ON CONFLICT (request_id) DO NOTHING
     RETURNING id`,
    [requestId]
  );
  return r.rows.length > 0;
}

export async function enqueueCrmEvent(query, event) {
  const eventId = event.eventId || crypto.randomUUID();
  await query(
    `INSERT INTO crm_sync_outbox (event_id, event_type, payload_json)
     VALUES ($1::uuid, $2, $3::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      eventId,
      event.eventType,
      JSON.stringify({
        event_id: eventId,
        event_type: event.eventType,
        occurred_at: new Date().toISOString(),
        crm_lead: event.crmLead || null,
        cleva: {
          entity_type: event.entityType || null,
          entity_id: event.entityId || null,
          phone_e164: event.phoneE164 || null,
        },
        data: event.data || {},
      }),
    ]
  );
  return eventId;
}

export async function findCrmLead(query, entities) {
  for (const entity of entities) {
    if (!entity?.type || !entity?.id) continue;
    const r = await query(
      `SELECT crm_lead_name AS "crmLead", phone_e164 AS "phoneE164"
         FROM crm_links
        WHERE cleva_entity_type = $1 AND cleva_entity_id = $2
        LIMIT 1`,
      [entity.type, String(entity.id)]
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

export async function emitCrmMilestone(input) {
  if (!crmEnabled() || !_dbQuery) return;
  try {
    const link = await findCrmLead(_dbQuery, input.entities || []);
    if (!link) return;
    await enqueueCrmEvent(_dbQuery, {
      eventType: input.eventType,
      crmLead: link.crmLead,
      entityType: input.entities?.[0]?.type,
      entityId: input.entities?.[0]?.id,
      phoneE164: link.phoneE164,
      data: input.data || {},
    });
  } catch (e) {
    console.error("[ERROR]", "[crm] milestone enqueue failed:", e instanceof Error ? e.message : "error");
  }
}

export async function enqueueUserDeactivated(userId) {
  if (!crmEnabled() || !_dbQuery || !userId) return;
  try {
    const link = await _dbQuery(
      `SELECT crm_user_email AS email, crm_role AS role FROM crm_user_links WHERE cleva_user_id = $1::uuid`,
      [userId]
    );
    if (!link.rows[0]) return;
    await _dbQuery(
      `UPDATE crm_user_links SET disabled_at = now() WHERE cleva_user_id = $1::uuid AND disabled_at IS NULL`,
      [userId]
    );
    await enqueueCrmEvent(_dbQuery, {
      eventType: "user.deactivated",
      entityType: "user",
      entityId: String(userId),
      data: { crm_role: link.rows[0].role },
    });
  } catch (e) {
    console.error("[ERROR]", "[crm] deactivate enqueue failed:", e instanceof Error ? e.message : "error");
  }
}

async function phoneMatches(query, phoneE164) {
  const digits = phoneDigits(phoneE164);
  if (!digits) return [];
  const r = await query(
    `SELECT 'market_lead' AS "entityType", id::text AS "entityId" FROM market_leads
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
     UNION ALL
     SELECT 'pipeline_buyer', id::text FROM pipeline_buyers
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
         OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $1
     UNION ALL
     SELECT 'farm_profile', id::text FROM farm_profiles
      WHERE regexp_replace(COALESCE(contact_phone, ''), '\\D', '', 'g') = $1
         OR regexp_replace(COALESCE(contact_whatsapp, ''), '\\D', '', 'g') = $1
     UNION ALL
     SELECT 'seller_queue', id::text FROM crm_seller_queue
      WHERE regexp_replace(phone_e164, '\\D', '', 'g') = $1
     UNION ALL
     SELECT 'scout_application', user_id::text FROM scout_applications
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
     LIMIT 8`,
    [digits]
  );
  return r.rows;
}

export async function createSignupLink(query, body) {
  const contactType = contactTypeKey(body.contact_type || body.contactType);
  const crmLead = String(body.crm_lead || body.crmLead || "").trim();
  if (!contactType || !crmLead) {
    return { ok: false, status: 400, error: "crm_lead and contact_type are required." };
  }
  const token = newSignupToken();
  const built = signupUrlForToken(token, contactType);
  if (!built.ok) return { ok: false, status: 503, error: built.error };
  const prefill = body.prefill && typeof body.prefill === "object" ? body.prefill : {};
  await query(
    `INSERT INTO signup_tracking_links
       (token_hash, crm_lead_name, contact_type, prefill_json, expires_at, created_by_crm_user)
     VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6)`,
    [hashToken(token), crmLead, contactType, JSON.stringify(prefill), built.expires_at, body.created_by || null]
  );
  return { ok: true, url: built.url, expires_at: built.expires_at };
}

export async function loadSignupToken(query, raw) {
  const r = await query(
    `SELECT token_hash, crm_lead_name, contact_type, prefill_json, expires_at, used_at
       FROM signup_tracking_links WHERE token_hash = $1`,
    [hashToken(raw)]
  );
  return r.rows[0] || null;
}

export async function consumeSignupToken(query, { raw, userId, entityType, entityId, phone }) {
  const row = await loadSignupToken(query, raw);
  const gate = classifySignupToken(row);
  if (!gate.ok) return gate;
  const used = await query(
    `UPDATE signup_tracking_links
        SET used_at = now(), used_by_user_id = $2::uuid
      WHERE token_hash = $1 AND used_at IS NULL
      RETURNING crm_lead_name, contact_type`,
    [row.token_hash, userId]
  );
  if (!used.rows[0]) return { ok: false, code: "used", status: 409, message: "This signup link was already used." };
  const phoneE164 = toE164(phone);
  await query(
    `INSERT INTO crm_links (cleva_entity_type, cleva_entity_id, crm_lead_name, phone_e164)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (crm_lead_name) DO UPDATE SET
       cleva_entity_type = EXCLUDED.cleva_entity_type,
       cleva_entity_id = EXCLUDED.cleva_entity_id,
       phone_e164 = COALESCE(EXCLUDED.phone_e164, crm_links.phone_e164)`,
    [entityType, String(entityId), used.rows[0].crm_lead_name, phoneE164]
  );
  await enqueueCrmEvent(query, {
    eventType: "signup.completed",
    crmLead: used.rows[0].crm_lead_name,
    entityType,
    entityId: String(entityId),
    phoneE164,
    data: { contact_type: used.rows[0].contact_type },
  });
  if (used.rows[0].contact_type === "scout_candidate") {
    await enqueueCrmEvent(query, {
      eventType: "scout.application_submitted",
      crmLead: used.rows[0].crm_lead_name,
      entityType: "user",
      entityId: String(userId),
      phoneE164,
    });
  }
  return { ok: true, crmLead: used.rows[0].crm_lead_name, contactType: used.rows[0].contact_type };
}

async function linkLead(query, { entityType, entityId, crmLead, phoneE164, ambiguous, detail }) {
  await query(
    `INSERT INTO crm_links (cleva_entity_type, cleva_entity_id, crm_lead_name, phone_e164, ambiguous, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (crm_lead_name) DO UPDATE SET
       ambiguous = crm_links.ambiguous OR EXCLUDED.ambiguous`,
    [entityType, String(entityId), crmLead, phoneE164, Boolean(ambiguous), JSON.stringify(detail || {})]
  );
}

export async function convertLead(query, body) {
  const contactType = contactTypeKey(body.contact_type || body.contactType);
  const crmLead = String(body.crm_lead || body.crmLead || "").trim();
  const name = String(body.name || body.contact_name || "").trim().slice(0, 160);
  const phoneE164 = toE164(body.phone || body.phone_e164);
  const district = String(body.district || "").trim().slice(0, 80);
  if (!crmLead || !name || !phoneE164) {
    return { ok: false, status: 400, error: "crm_lead, name, and phone are required." };
  }
  if (contactType === "seller" && !district) {
    return { ok: false, status: 400, error: "district is required for a seller." };
  }
  const existing = await query(
    `SELECT cleva_entity_type, cleva_entity_id, ambiguous FROM crm_links WHERE crm_lead_name = $1`,
    [crmLead]
  );
  const matches = await phoneMatches(query, phoneE164);
  const decision = decideConvert({
    contactType,
    existingLeadLink: existing.rows[0],
    phoneMatches: matches,
  });
  if (decision.action === "reject") return { ok: false, status: 400, error: decision.error };
  if (decision.action === "existing") {
    return {
      ok: true,
      cleva_record_type: decision.recordType,
      cleva_record_id: decision.recordId,
      ambiguous: decision.ambiguous,
      duplicate: true,
    };
  }

  const birds = Number(body.bird_count ?? body.birds);
  const birdCount = Number.isFinite(birds) && birds > 0 ? Math.round(birds) : null;
  const available = body.availability_date || body.availabilityDate || null;
  const note = String(body.handoff_note || body.notes || "").slice(0, 2000);

  if (decision.action === "ambiguous") {
    const summary = decision.matches.map((m) => `${m.entityType}:${m.entityId}`).join(", ");
    const ins = await query(
      `${SELLER_QUEUE_INSERT} RETURNING id::text AS id`,
      [crmLead, name, phoneE164, district || null, birdCount, available, `Review matches: ${summary}`, true]
    );
    await linkLead(query, {
      entityType: "seller_queue",
      entityId: ins.rows[0].id,
      crmLead,
      phoneE164,
      ambiguous: true,
      detail: { contact_type: contactType, matches: decision.matches },
    });
    return {
      ok: true,
      cleva_record_type: "seller_queue",
      cleva_record_id: ins.rows[0].id,
      ambiguous: true,
    };
  }

  if (decision.action === "link") {
    await linkLead(query, {
      entityType: decision.match.entityType,
      entityId: decision.match.entityId,
      crmLead,
      phoneE164,
      ambiguous: false,
    });
    return {
      ok: true,
      cleva_record_type: decision.match.entityType,
      cleva_record_id: decision.match.entityId,
      linked: true,
    };
  }

  if (decision.action === "create_seller_queue") {
    const ins = await query(
      `${SELLER_QUEUE_INSERT} RETURNING id::text AS id`,
      [crmLead, name, phoneE164, district, birdCount, available, note || null, false]
    );
    await linkLead(query, {
      entityType: "seller_queue",
      entityId: ins.rows[0].id,
      crmLead,
      phoneE164,
      ambiguous: false,
    });
    return { ok: true, cleva_record_type: "seller_queue", cleva_record_id: ins.rows[0].id };
  }

  if (decision.action === "create_market_lead") {
    const ins = await query(
      `INSERT INTO market_leads (contact_name, phone, district, birds, source, status, message)
       VALUES ($1, $2, $3, $4, 'crm', 'new', $5)
       RETURNING id::text AS id`,
      [name, phoneE164, district || null, birdCount, note || null]
    );
    await linkLead(query, {
      entityType: "market_lead",
      entityId: ins.rows[0].id,
      crmLead,
      phoneE164,
      ambiguous: false,
    });
    return { ok: true, cleva_record_type: "market_lead", cleva_record_id: ins.rows[0].id };
  }

  const pendingId = `pending:${crmLead}`;
  await linkLead(query, {
    entityType: "scout_pending",
    entityId: pendingId,
    crmLead,
    phoneE164,
    ambiguous: false,
    detail: { name, district, phone_e164: phoneE164 },
  });
  return { ok: true, cleva_record_type: "scout_pending", cleva_record_id: pendingId };
}

export async function assignSeller(query, body) {
  const crmLead = String(body.crm_lead || body.crmLead || "").trim();
  const scoutId = String(body.scout_user_id || body.scoutUserId || "").trim();
  if (!crmLead || !scoutId) return { ok: false, status: 400, error: "crm_lead and scout_user_id are required." };
  const seller = await query(
    `SELECT id::text AS id, district, handoff_note AS "handoffNote",
            assigned_scout_user_id AS "assignedScoutUserId"
       FROM crm_seller_queue WHERE crm_lead_name = $1`,
    [crmLead]
  );
  if (!seller.rows[0]) return { ok: false, status: 404, error: "Seller queue row not found." };
  const handoff = requireHandoffNote(seller.rows[0].handoffNote, body.handoff_note || body.handoffNote);
  if (!handoff.ok) return handoff;
  const scout = await query(
    `SELECT u.id::text AS id, u.role, COALESCE(u.is_active, true) AS "isActive", sa.district
       FROM users u
       LEFT JOIN scout_applications sa ON sa.user_id = u.id
      WHERE u.id = $1::uuid`,
    [scoutId]
  );
  const row = scout.rows[0];
  if (!row || row.isActive === false || !["vet", "vet_manager"].includes(row.role)) {
    return { ok: false, status: 400, error: "That user is not an active scout." };
  }
  if (!scoutCoversDistrict(row.district, seller.rows[0].district)) {
    return { ok: false, status: 409, error: "This scout does not cover that district." };
  }
  await query(
    `UPDATE crm_seller_queue
        SET assigned_scout_user_id = $2::uuid,
            handoff_note = $3,
            updated_at = now()
      WHERE id = $1::uuid`,
    [seller.rows[0].id, scoutId, handoff.note]
  );
  await enqueueCrmEvent(query, {
    eventType: "seller.assigned",
    crmLead,
    entityType: "seller_queue",
    entityId: seller.rows[0].id,
    data: { scout_user_id: scoutId },
  });
  return { ok: true, cleva_record_type: "seller_queue", cleva_record_id: seller.rows[0].id };
}

export async function listScoutSellers(query, userId) {
  const r = await query(
    `SELECT id::text AS id, contact_name AS "contactName", phone_e164 AS "phone",
            district, bird_count AS "birdCount", availability_date AS "availabilityDate",
            handoff_note AS "handoffNote", visit_status AS "visitStatus",
            next_action_at AS "nextActionAt", outcome_note AS "outcomeNote",
            assigned_scout_user_id::text AS "assignedScoutUserId"
       FROM crm_seller_queue
      WHERE assigned_scout_user_id = $1::uuid
      ORDER BY updated_at DESC
      LIMIT 80`,
    [userId]
  );
  return r.rows;
}

export async function loadScoutSeller(query, id, userId) {
  const r = await query(
    `SELECT id::text AS id, contact_name AS "contactName", phone_e164 AS "phone",
            district, bird_count AS "birdCount", availability_date AS "availabilityDate",
            handoff_note AS "handoffNote", visit_status AS "visitStatus",
            next_action_at AS "nextActionAt", outcome_note AS "outcomeNote",
            assigned_scout_user_id::text AS "assignedScoutUserId",
            crm_lead_name AS "crmLead"
       FROM crm_seller_queue WHERE id = $1::uuid`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return { ok: false, status: 404, error: "Seller not found." };
  if (!scoutOwnsRow(row, userId)) return { ok: false, status: 404, error: "Seller not found." };
  return { ok: true, seller: row };
}

const ACTION_EVENT = {
  contacted: "seller.contacted",
  visit_scheduled: "visit.scheduled",
  visit_completed: "visit.completed",
  outcome_recorded: "visit.completed",
};

export async function updateScoutSeller(query, { id, userId, action, nextActionAt, outcomeNote }) {
  const loaded = await loadScoutSeller(query, id, userId);
  if (!loaded.ok) return loaded;
  const next = nextVisitStatus(loaded.seller.visitStatus, action);
  if (!next) return { ok: false, status: 400, error: "That update is not available yet." };
  await query(
    `UPDATE crm_seller_queue
        SET visit_status = $2,
            next_action_at = COALESCE($3::timestamptz, next_action_at),
            outcome_note = COALESCE($4, outcome_note),
            updated_at = now()
      WHERE id = $1::uuid AND assigned_scout_user_id = $5::uuid`,
    [id, next, nextActionAt || null, outcomeNote ? String(outcomeNote).slice(0, 2000) : null, userId]
  );
  await enqueueCrmEvent(query, {
    eventType: ACTION_EVENT[next],
    crmLead: loaded.seller.crmLead,
    entityType: "seller_queue",
    entityId: id,
    phoneE164: loaded.seller.phone,
    data: { visit_status: next },
  });
  return loadScoutSeller(query, id, userId);
}

export async function processCrmOutbox(limit = 20, fetchImpl = globalThis.fetch) {
  if (!crmEnabled() || !_dbQuery) return { skipped: true };
  const base = String(process.env.CRM_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRM_OUTBOX_SECRET || "";
  if (!base || !secret) return { skipped: true, reason: "crm_url_unset" };
  const due = await _dbQuery(
    `SELECT id, event_id::text AS "eventId", event_type AS "eventType", payload_json AS payload, attempts
       FROM crm_sync_outbox
      WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit]
  );
  let sent = 0;
  let dead = 0;
  for (const row of due.rows) {
    const rawBody = JSON.stringify(row.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v1=${signBody(secret, timestamp, rawBody)}`;
    let status = 0;
    let error = "";
    try {
      const res = await fetchImpl(`${base}/api/method/cleva_bridge.events.ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cleva-Timestamp": timestamp,
          "X-Cleva-Signature": signature,
          "X-Cleva-Event-Id": row.eventId,
        },
        body: rawBody,
      });
      status = res.status;
      if (!res.ok) error = `http_${status}`;
    } catch {
      status = 503;
      error = "network";
    }
    if (status >= 200 && status < 300) {
      await _dbQuery(
        `UPDATE crm_sync_outbox
            SET status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = NULL
          WHERE id = $1`,
        [row.id]
      );
      sent += 1;
      continue;
    }
    const next = outboxAfterFailure(row.attempts, status || 503);
    if (next.status === "dead") {
      dead += 1;
      console.error("[ERROR]", `[crm] event dead type=${row.eventType} id=${row.eventId}`);
    }
    await _dbQuery(
      `UPDATE crm_sync_outbox
          SET status = $2, attempts = $3, last_error = $4,
              next_attempt_at = now() + ($5 * interval '1 second')
        WHERE id = $1`,
      [row.id, next.status, next.attempts, error || "failed", next.delaySeconds || 0]
    );
  }
  return { sent, dead, checked: due.rows.length };
}

export async function retryDeadEvent(query, eventId) {
  const r = await query(
    `UPDATE crm_sync_outbox
        SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
      WHERE event_id = $1::uuid AND status = 'dead'
      RETURNING event_id::text AS id`,
    [eventId]
  );
  if (!r.rows[0]) return { ok: false, status: 404, error: "Dead event not found." };
  return { ok: true };
}

export async function recordStaffLink(query, user) {
  const role = crmRoleForUser(user);
  if (!role) return;
  await query(
    `INSERT INTO crm_user_links (cleva_user_id, crm_user_email, crm_role, last_sync_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (cleva_user_id) DO UPDATE SET
       crm_user_email = EXCLUDED.crm_user_email,
       crm_role = EXCLUDED.crm_role,
       disabled_at = NULL,
       last_sync_at = now()`,
    [user.id, user.email, role]
  );
}

export function launchCrm(user, env = process.env) {
  if (!crmEnabled(env)) return { ok: false, status: 404, error: "Not found." };
  const role = crmRoleForUser(user);
  if (!role) return { ok: false, status: 403, error: "Not allowed." };
  const base = String(env.CRM_BASE_URL || "").replace(/\/$/, "");
  const pem = loadSsoPrivateKey(env);
  if (!base || !pem) {
    return {
      ok: true,
      configured: false,
      message: "WhatsApp inbox is not connected yet. An admin still needs to set the CRM address and login key.",
    };
  }
  const claims = buildSsoClaims(user);
  return {
    ok: true,
    configured: true,
    url: `${base}/api/method/cleva_bridge.sso.login`,
    token: signCrmJwt(claims, pem),
  };
}

export { db as crmDb };
