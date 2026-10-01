/**
 * Best-effort marketplace transactional email (SMTP).
 * Never throws to callers — failures are logged only.
 */

import { sendMail, smtpConfigFromEnv } from "../smtpSend.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} mail
 */
export async function sendMarketMail(mail, sendFn = sendMail, smtpFn = smtpConfigFromEnv) {
  const smtp = smtpFn();
  if (!smtp) return { sent: false, reason: "smtp_unset" };
  const to = String(mail?.to || "").trim();
  if (!to || !to.includes("@")) return { sent: false, reason: "bad_to" };
  try {
    await sendFn(smtp, {
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { sent: true };
  } catch (e) {
    console.error("[market-notify]", e instanceof Error ? e.message : e);
    return { sent: false, reason: "send_failed" };
  }
}

/** @param {Function} dbQuery */
export async function emailsForCompanyAdmins(dbQuery, companyId) {
  if (!companyId) return [];
  try {
    const r = await dbQuery(
      `SELECT email, full_name AS "fullName"
         FROM users
        WHERE company_id = $1::uuid
          AND role IN ('company_admin', 'manager')
          AND COALESCE(is_active, true) = true
          AND email IS NOT NULL AND email <> ''`,
      [companyId]
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** @param {Function} dbQuery */
export async function emailForUserId(dbQuery, userId) {
  if (!userId) return null;
  try {
    const r = await dbQuery(
      `SELECT email, full_name AS "fullName"
         FROM users WHERE id = $1::uuid AND email IS NOT NULL AND email <> '' LIMIT 1`,
      [userId]
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Recipients for a lot: listed_by first, else company admins.
 * @param {Function} dbQuery
 * @param {{ listedBy?: string|null, companyId?: string|null }} lot
 */
export async function emailsForLotOwners(dbQuery, lot) {
  const out = [];
  const seen = new Set();
  if (lot?.listedBy) {
    const u = await emailForUserId(dbQuery, lot.listedBy);
    if (u?.email) {
      out.push(u);
      seen.add(String(u.email).toLowerCase());
    }
  }
  for (const u of await emailsForCompanyAdmins(dbQuery, lot?.companyId)) {
    const key = String(u.email).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export function buildBookingEmail({ name, birds, district, farmLabel }) {
  const who = name || "there";
  const place = district || farmLabel || "your lot";
  const subject = `New booking: ${birds} birds — ${place}`;
  const text = [
    `Hi ${who},`,
    "",
    `A buyer booked ${birds} birds on your market listing (${place}).`,
    "Open Clevafarm → My market listings to see the booking.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>A buyer booked <strong>${escapeHtml(String(birds))}</strong> birds on your market listing (${escapeHtml(place)}).</p>
<p>Open Clevafarm → <strong>My market listings</strong> to see the booking.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildFarmVerifiedEmail({ name }) {
  const who = name || "there";
  const subject = "Your farm is verified — you can list birds";
  const text = [
    `Hi ${who},`,
    "",
    "Cleva verified your farm account. You can now list birds on the broiler market.",
    "Open Clevafarm → My market listings.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Cleva verified your farm account. You can now list birds on the broiler market.</p>
<p>Open Clevafarm → <strong>My market listings</strong>.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildBuyerVerifiedEmail({ name }) {
  const who = name || "there";
  const subject = "Your buyer account is verified — open the market";
  const text = [
    `Hi ${who},`,
    "",
    "Cleva verified your buyer account. You can browse live lots and book birds in-app.",
    "Open Clevafarm → Market.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Cleva verified your buyer account. You can browse live lots and book birds in-app.</p>
<p>Open Clevafarm → <strong>Market</strong>.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildLotLiveEmail({ name, district, birds }) {
  const who = name || "there";
  const place = district || "your listing";
  const subject = `Listing live on market — ${place}`;
  const text = [
    `Hi ${who},`,
    "",
    `Your lot${birds != null ? ` (${birds} birds)` : ""} in ${place} is now live on the broiler market.`,
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Your lot${birds != null ? ` (<strong>${escapeHtml(String(birds))}</strong> birds)` : ""} in ${escapeHtml(place)} is now live on the broiler market.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildCommissionAccruedEmail({ name, amountRwf }) {
  const who = name || "there";
  const amount = Number(amountRwf || 0);
  const subject = `Commission accrued: ${Math.round(amount)} RWF`;
  const text = [
    `Hi ${who},`,
    "",
    `A trade you scouted was delivered. Commission accrued (unpaid): ${Math.round(amount)} RWF.`,
    "Open Clevafarm → Commissions to track payout.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>A trade you scouted was delivered. Commission accrued (unpaid): <strong>${escapeHtml(String(Math.round(amount)))} RWF</strong>.</p>
<p>Open Clevafarm → <strong>Commissions</strong> to track payout.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildCommissionPaidEmail({ name, amountRwf }) {
  const who = name || "there";
  const amount = Number(amountRwf || 0);
  const subject = `Commission marked paid: ${Math.round(amount)} RWF`;
  const text = [
    `Hi ${who},`,
    "",
    `Ops marked your scout commission paid: ${Math.round(amount)} RWF.`,
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Ops marked your scout commission paid: <strong>${escapeHtml(String(Math.round(amount)))} RWF</strong>.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildLeadReceivedEmail({
  reference,
  contactName,
  phone,
  birds,
  district,
  lotRef,
  businessName,
  kind,
}) {
  const sell = kind === "sell" || kind === "public_sell";
  const subject = `${sell ? "New seller lead" : "New market lead"} ${reference || ""}`.trim();
  const intro = sell ? "New seller lead from /sell:" : "New guest request from the public market:";
  const lines = [
    intro,
    "",
    `Reference: ${reference || "—"}`,
    `Name: ${contactName || "—"}`,
    `Phone: ${phone || "—"}`,
    businessName ? `Business: ${businessName}` : null,
    birds != null ? `Birds: ${birds}` : null,
    district ? `District: ${district}` : null,
    lotRef ? `Lot: ${lotRef}` : null,
    "",
    "Open Clevafarm → Market → Leads to triage.",
    "",
    "— Clevafarm",
  ].filter((x) => x != null);
  const text = lines.join("\n");
  const html = `<p>${escapeHtml(intro)}</p>
<ul>
<li>Reference: <strong>${escapeHtml(reference || "—")}</strong></li>
<li>Name: ${escapeHtml(contactName || "—")}</li>
<li>Phone: ${escapeHtml(phone || "—")}</li>
${businessName ? `<li>Business: ${escapeHtml(businessName)}</li>` : ""}
${birds != null ? `<li>Birds: ${escapeHtml(String(birds))}</li>` : ""}
${district ? `<li>District: ${escapeHtml(district)}</li>` : ""}
${lotRef ? `<li>Lot: ${escapeHtml(lotRef)}</li>` : ""}
</ul>
<p>Open Clevafarm → <strong>Market → Leads</strong> to triage.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildFarmClaimEmail({ name, farmName, claimUrl }) {
  const who = name || "there";
  const farm = farmName || "your farm";
  const subject = `Claim ${farm} on Cleva Market`;
  const text = [
    `Hi ${who},`,
    "",
    `A Cleva scout recorded ${farm}. Claim this storefront to publish photos, set visibility, and receive bookings.`,
    claimUrl ? `Open: ${claimUrl}` : "",
    "",
    "— Clevafarm",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>A Cleva scout recorded <strong>${escapeHtml(farm)}</strong>. Claim this storefront to publish photos, set visibility, and receive bookings.</p>
${claimUrl ? `<p><a href="${escapeHtml(claimUrl)}">Claim your farm</a></p>` : ""}
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

/** Buyer login email when the CRM row is linked. */
export async function emailForBuyerId(dbQuery, buyerId) {
  if (!buyerId) return null;
  try {
    const r = await dbQuery(
      `SELECT u.email, u.full_name AS "fullName"
         FROM pipeline_buyers b
         JOIN users u ON u.id = b.user_id
        WHERE b.id = $1::uuid
          AND u.email IS NOT NULL AND u.email <> ''
        LIMIT 1`,
      [buyerId]
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

export function buildFulfillmentPlannedEmail({ name, birds, district }) {
  const who = name || "there";
  const place = district || "this reservation";
  const subject = `Handover planned — ${birds} birds`;
  const text = [
    `Hi ${who},`,
    "",
    `Pickup / delivery details were set for ${birds} birds (${place}).`,
    "Open Clevafarm → Orders or Jobs to confirm the plan.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Pickup / delivery details were set for <strong>${escapeHtml(String(birds))}</strong> birds (${escapeHtml(place)}).</p>
<p>Open Clevafarm → <strong>Orders</strong> or <strong>Jobs</strong> to confirm the plan.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildFulfillmentConfirmedEmail({ name, side, birds, district }) {
  const who = name || "there";
  const whoSide = side === "buyer" ? "The buyer" : "The farm";
  const subject = `${whoSide} confirmed — ${birds} birds`;
  const text = [
    `Hi ${who},`,
    "",
    `${whoSide} confirmed handover for ${birds} birds (${district || "your reservation"}).`,
    "Confirm your side (birds, kg, price) to close the trade.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>${escapeHtml(whoSide)} confirmed handover for <strong>${escapeHtml(String(birds))}</strong> birds (${escapeHtml(district || "your reservation")}).</p>
<p>Confirm your side (birds, kg, price) to close the trade.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildFulfillmentSettledEmail({ name, birds, district }) {
  const who = name || "there";
  const subject = `Trade settled — ${birds} birds`;
  const text = [
    `Hi ${who},`,
    "",
    `Both sides confirmed ${birds} birds (${district || "the reservation"}). Settlement stays offline.`,
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>Both sides confirmed <strong>${escapeHtml(String(birds))}</strong> birds (${escapeHtml(district || "the reservation")}). Settlement stays offline.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

export function buildFulfillmentExceptionEmail({ name, kind, birds, district }) {
  const who = name || "there";
  const subject = `Trade exception — ${kind || "review"}`;
  const text = [
    `Hi ${who},`,
    "",
    `A ${kind || "problem"} was reported on ${birds} birds (${district || "a reservation"}).`,
    "Cleva ops will review. Commission does not accrue until the handshake closes.",
    "",
    "— Clevafarm",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(who)},</p>
<p>A <strong>${escapeHtml(kind || "problem")}</strong> was reported on ${escapeHtml(String(birds))} birds (${escapeHtml(district || "a reservation")}).</p>
<p>Cleva ops will review. Commission does not accrue until the handshake closes.</p>
<p>— Clevafarm</p>`;
  return { subject, text, html };
}

/** Desk roles that triage public leads. */
export async function emailsForDeskRoles(dbQuery) {
  try {
    const r = await dbQuery(
      `SELECT email, full_name AS "fullName"
         FROM users
        WHERE role IN ('superuser', 'sales_coordinator')
          AND COALESCE(is_active, true) = true
          AND email IS NOT NULL AND email <> ''`
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** Fire-and-forget notify many recipients with the same template. */
export async function notifyMany(recipients, buildMail, deps = {}) {
  const send = deps.sendMarketMail || sendMarketMail;
  const list = Array.isArray(recipients) ? recipients : [];
  const results = [];
  for (const r of list) {
    if (!r?.email) continue;
    const mail = typeof buildMail === "function" ? buildMail(r) : buildMail;
    results.push(await send({ to: r.email, ...mail }));
  }
  return results;
}
