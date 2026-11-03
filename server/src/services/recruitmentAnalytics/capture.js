/**
 * Writes that keep first touch, stage, and targets honest.
 * Each write is skipped cleanly when migration 088 is not applied yet.
 */

import { randomBytes } from "node:crypto";
import { normaliseChannel } from "./channels.js";

function missing(err) {
  const code = String(err?.code || "");
  return code === "42P01" || code === "42703" || code === "3F000";
}

export async function applyFirstTouch(dbQuery, userId, attr = {}) {
  if (typeof dbQuery !== "function" || !userId) return { ok: false };
  const linkCode = String(attr.linkCode || "").trim().toLowerCase();
  const scoutCode = String(attr.scoutCode || "").trim();
  const selfReported = String(attr.selfReported || "").trim().slice(0, 80) || null;
  const visitorId = String(attr.visitorId || "").trim().slice(0, 80) || null;
  if (!linkCode && !scoutCode && !selfReported && !visitorId) return { ok: true, skipped: true };
  try {
    let channel = null;
    let campaign = null;
    if (linkCode) {
      const link = await dbQuery(
        `SELECT channel, campaign FROM tracked_links WHERE lower(code) = $1`,
        [linkCode]
      );
      channel = link.rows[0]?.channel || null;
      campaign = link.rows[0]?.campaign || null;
    }
    let scoutId = null;
    if (scoutCode) {
      const scout = await dbQuery(
        `SELECT user_id::text AS id FROM scout_referral_codes WHERE lower(code) = lower($1)`,
        [scoutCode]
      );
      scoutId = scout.rows[0]?.id || null;
      if (scoutId && !channel) channel = "scout_referral";
    }
    if (channel) channel = normaliseChannel(channel);
    await dbQuery(
      `UPDATE people_onboarding SET
         visitor_id = COALESCE(visitor_id, $2),
         self_reported_source = COALESCE(self_reported_source, $3),
         referred_by_scout_id = COALESCE(referred_by_scout_id, $4::uuid)
       WHERE user_id = $1::uuid`,
      [userId, visitorId, selfReported, scoutId]
    );
    let stamped = false;
    if (channel) {
      const stampedRow = await dbQuery(
        `UPDATE people_onboarding SET
           first_touch_channel = $2,
           first_touch_campaign = COALESCE(first_touch_campaign, $3),
           first_touch_at = COALESCE(first_touch_at, now())
         WHERE user_id = $1::uuid
           AND first_touch_channel IS NULL
         RETURNING user_id`,
        [userId, channel, campaign]
      );
      stamped = (stampedRow.rowCount ?? 0) > 0;
    }
    if (stamped) {
      await dbQuery(
        `INSERT INTO person_events (person_id, role, type, occurred_at, actor_id, source, payload)
         SELECT $1, CASE account_type WHEN 'farmer' THEN 'seller' WHEN 'buyer' THEN 'buyer' ELSE 'scout' END,
                'account_created', now(), 'system', 'system', $2::jsonb
           FROM people_onboarding WHERE user_id = $1::uuid`,
        [userId, JSON.stringify({ channel, linkCode: linkCode || null })]
      ).catch((err) => {
        if (!missing(err)) throw err;
      });
    }
    return { ok: true, channel, scoutId };
  } catch (err) {
    if (missing(err)) return { ok: false, skipped: true };
    return { ok: false, error: err instanceof Error ? err.message : "first touch failed" };
  }
}

const FORWARD_STAGES = new Set([
  "application",
  "contact",
  "kyc",
  "call_scheduled",
  "called",
  "follow_up",
  "new",
  "contacted",
  "call_booked",
]);

function deskWrite(stage) {
  const map = {
    application: ["application", null],
    contact: ["contact", "called"],
    kyc: ["kyc", null],
    onboarded: ["onboarded", null],
    closed: ["closed", "not_a_fit"],
    active: ["onboarded", null],
    listing_live: ["onboarded", null],
    call_scheduled: ["contact", "call_scheduled"],
    called: ["contact", "called"],
    follow_up: ["contact", "follow_up"],
    unreachable: ["contact", "unreachable"],
    not_a_fit: ["closed", "not_a_fit"],
    duplicate: ["closed", "duplicate"],
  };
  return map[String(stage || "")] || null;
}

/** A verified live listing moves the seller forward. It never moves them backward. */
export async function noteLiveVerifiedLot(dbQuery, { ownerUserId, actorId, lotId }) {
  if (typeof dbQuery !== "function" || !ownerUserId) return { ok: false };
  try {
    const contact = await dbQuery(
      `SELECT id::text AS id, stage, phone_e164
         FROM recruitment_contacts
        WHERE user_id = $1::uuid`,
      [ownerUserId]
    );
    const row = contact.rows[0];
    if (row && FORWARD_STAGES.has(row.stage)) {
      await dbQuery(
        `UPDATE recruitment_contacts
            SET stage = 'onboarded', desk_status = NULL, updated_at = now()
          WHERE id = $1::uuid
            AND stage = ANY($2::text[])`,
        [row.id, [...FORWARD_STAGES]]
      );
    }
    await dbQuery(
      `INSERT INTO person_events (person_id, role, type, occurred_at, actor_id, source, payload)
       VALUES ($1, 'seller', 'listing_live', now(), $2, 'system', $3::jsonb)`,
      [ownerUserId, actorId || "system", JSON.stringify({ lotId: lotId || null })]
    );
    return { ok: true };
  } catch (err) {
    if (missing(err)) return { ok: false, skipped: true };
    return { ok: false };
  }
}

export function newLinkCode() {
  return randomBytes(4).toString("hex");
}

export async function recordStaffEvent(dbQuery, input) {
  const reason = String(input.reason || "").trim();
  const type = String(input.type || "");
  if ((type === "marked_unreachable" || type === "marked_not_a_fit") && reason.length < 3) {
    return { ok: false, status: 400, error: "Unreachable and Not a fit need a reason." };
  }
  try {
    await dbQuery(
      `INSERT INTO person_events (person_id, role, type, occurred_at, actor_id, source, payload)
       VALUES ($1, $2, $3, now(), $4, 'staff', $5::jsonb)`,
      [
        String(input.personId),
        String(input.role || "seller"),
        type,
        String(input.actorId || "staff"),
        JSON.stringify({ reason, note: String(input.note || "").slice(0, 2000) }),
      ]
    );
    if (type === "stage_changed_manually" || type === "marked_unreachable" || type === "marked_not_a_fit") {
      const stage =
        type === "marked_unreachable" ? "unreachable" : type === "marked_not_a_fit" ? "not_a_fit" : String(input.stage || "");
      const written = deskWrite(stage);
      if (written) {
        await dbQuery(
          `UPDATE recruitment_contacts
              SET stage = $2, desk_status = $3, updated_at = now()
            WHERE user_id = $1::uuid`,
          [input.personId, written[0], written[1]]
        ).catch((err) => {
          if (!missing(err)) throw err;
        });
      }
    }
    return { ok: true };
  } catch (err) {
    if (missing(err)) return { ok: false, status: 503, error: "Event ledger is not installed yet. Apply migration 088." };
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not save the event." };
  }
}
