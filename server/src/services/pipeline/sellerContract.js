/**
 * Stored recruitment agreements: settings, versions, signing links, review, and the final PDF.
 * Images and PDFs stay in the database and are not returned on the people list.
 */

import crypto from "node:crypto";
import { getRecruitmentContact, promoteIfKycClear } from "./recruitmentContacts.js";
import { sendMarketMail } from "./marketNotify.js";
import { buildContractPdf } from "./sellerContractPdf.js";
import {
  CONTRACT_LINK_DAYS,
  LANGUAGES,
  OTP_TTL_MS,
  RETENTION_NOTE,
  SETTING_FIELDS,
  WANTS,
  acceptOtpSend,
  CONTRACT_VARIABLES,
  blockingGaps,
  canApproveContract,
  canEditContractSettings,
  canSendContract,
  checkOtpCode,
  columnForCamel,
  decodeImageDataUrl,
  fillContract,
  hashToken,
  kycStatusForContract,
  makeContractNumber,
  newSigningToken,
  presentContract,
  describeGaps,
  publicSettings,
  sampleVars,
  settingsFromBody,
  signFileQuery,
  signerAllowed,
  signUrl,
  starterBody,
  variablesIn,
} from "./sellerContractText.js";

function dbError(e, fallback) {
  if (String(e?.code) === "42P01") {
    return { ok: false, status: 503, error: "The contract tables are not in the database yet. Run migration 094 after a backup." };
  }
  return { ok: false, status: 500, error: e instanceof Error ? e.message : fallback };
}

function settingsColumns(withImages) {
  const cols = SETTING_FIELDS.map(([, column]) => column);
  cols.push("otp_required");
  if (withImages) cols.push("logo_bytes", "logo_mime", "signer_signature_bytes", "signer_signature_mime");
  else cols.push("(logo_bytes IS NOT NULL) AS logo_bytes", "(signer_signature_bytes IS NOT NULL) AS signer_signature_bytes");
  return cols.join(", ");
}

async function loadSettingsRow(dbQuery, withImages = false) {
  const r = await dbQuery(`SELECT ${settingsColumns(withImages)} FROM seller_contract_settings WHERE id = 1`);
  return r.rows[0] || null;
}

export async function seedContractTemplates(dbQuery, actorUserId = null) {
  const existing = await dbQuery(`SELECT COUNT(*)::int AS n FROM seller_contract_templates`);
  if (Number(existing.rows[0]?.n || 0) > 0) return { seeded: false };
  for (const want of WANTS) {
    await dbQuery(
      `INSERT INTO seller_contract_templates (want, version, language, body, is_active, created_by)
       VALUES ($1, 1, 'en', $2, true, $3::uuid)
       ON CONFLICT (want, language, version) DO NOTHING`,
      [want, starterBody(want), actorUserId]
    );
  }
  return { seeded: true };
}

async function loadPerson(dbQuery, id) {
  const r = await dbQuery(
    `SELECT c.id::text AS id, c.contact_name AS name, c.phone_e164 AS phone,
            COALESCE(NULLIF(btrim(u.email), ''), NULLIF(btrim(c.email), '')) AS email,
            c.district, c.sector, c.want, c.stage,
            c.user_id::text AS "userId",
            c.kyc_contract_status AS "kycContractStatus",
            c.kyc_location_status AS "kycLocationStatus",
            c.kyc_payment_status AS "kycPaymentStatus",
            c.kyc_identity_status AS "kycIdentityStatus",
            c.kyc_id_number AS "kycIdNumber"
       FROM recruitment_contacts c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = $1::uuid`,
    [id]
  );
  return r.rows[0] || null;
}

async function requireSigner(dbQuery, row, actorUserId) {
  const person = await loadPerson(dbQuery, row.contactId);
  if (!person || !signerAllowed(person.userId, actorUserId)) {
    return { ok: false, status: 403, error: "Log in with the account that received this agreement. Someone else cannot sign it." };
  }
  return { ok: true, person };
}

const ATTEMPT_COLUMNS = `
  id::text AS id, contact_id::text AS "contactId", want, language, status,
  template_id::text AS "templateId", template_version AS "templateVersion",
  contract_number AS "contractNumber", presented_text AS "presentedText", frozen_text AS "frozenText",
  text_sha256 AS "textSha256", token_expires_at AS "tokenExpiresAt", typed_name AS "typedName",
  otp_verified AS "otpVerified", otp_code_hash AS "otpCodeHash", otp_expires_at AS "otpExpiresAt",
  otp_attempts AS "otpAttempts", otp_sent_at AS "otpSentAt", signed_at AS "signedAt",
  signer_ip AS "signerIp", signer_user_agent AS "signerUserAgent",
  rejection_reason AS "rejectionReason", reviewed_at AS "reviewedAt", opened_at AS "openedAt",
  created_at AS "createdAt",
  (signature_bytes IS NOT NULL) AS "hasSignature",
  (selfie_bytes IS NOT NULL) AS "hasSelfie",
  (pdf_bytes IS NOT NULL) AS "hasPdf"
`;

async function latestAttempt(dbQuery, contactId) {
  const r = await dbQuery(
    `SELECT ${ATTEMPT_COLUMNS} FROM seller_contracts WHERE contact_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
    [contactId]
  );
  return r.rows[0] || null;
}

async function byToken(dbQuery, raw) {
  if (!/^[a-f0-9]{64}$/.test(String(raw || ""))) return null;
  const r = await dbQuery(
    `SELECT ${ATTEMPT_COLUMNS} FROM seller_contracts WHERE token_hash = $1 OR download_token_hash = $1 LIMIT 1`,
    [hashToken(raw)]
  );
  return r.rows[0] || null;
}

async function expireIfNeeded(dbQuery, row) {
  if (!row || !["sent", "opened"].includes(row.status)) return row;
  if (!row.tokenExpiresAt || new Date(row.tokenExpiresAt).getTime() >= Date.now()) return row;
  await dbQuery(
    `UPDATE seller_contracts SET status = 'expired', updated_at = now() WHERE id = $1::uuid AND status IN ('sent', 'opened')`,
    [row.id]
  );
  return { ...row, status: "expired" };
}

async function activeTemplate(dbQuery, want, language) {
  const r = await dbQuery(
    `SELECT id::text AS id, want, version, language, body
       FROM seller_contract_templates
      WHERE want = $1 AND language = $2 AND is_active = true
      LIMIT 1`,
    [want, language]
  );
  return r.rows[0] || null;
}

async function activeLanguages(dbQuery, want) {
  const r = await dbQuery(
    `SELECT language FROM seller_contract_templates WHERE want = $1 AND is_active = true`,
    [want]
  );
  return r.rows.map((row) => row.language);
}

async function syncKyc(dbQuery, contactId, contractStatus, snapshot) {
  await dbQuery(
    `UPDATE recruitment_contacts
        SET kyc_contract_status = $2,
            kyc_contract_snapshot = COALESCE($3, kyc_contract_snapshot),
            kyc_signed_at = CASE WHEN $2 = 'submitted' THEN now() ELSE kyc_signed_at END,
            updated_at = now()
      WHERE id = $1::uuid`,
    [contactId, kycStatusForContract(contractStatus), snapshot || null]
  );
}

async function reloadContact(dbQuery, contactId) {
  const loaded = await getRecruitmentContact(dbQuery, contactId);
  return loaded.ok ? loaded.contact : null;
}

function audit(actor, action, id, metadata) {
  if (typeof actor?.audit === "function") {
    actor.audit(actor.userId, actor.role, action, "seller_contract", id, metadata || {});
  }
}

async function issueLink(dbQuery, person, actor, { replaceId = null, contractNumber = null } = {}) {
  const template = await activeTemplate(dbQuery, person.want, "en");
  if (!template) return { ok: false, status: 400, error: "Add an English agreement for this person first." };
  const settings = publicSettings(await loadSettingsRow(dbQuery));
  const gaps = blockingGaps(template.body, settings, person);
  if (!String(person.name || "").trim()) gaps.push("seller_full_name");
  if (gaps.length) return { ok: false, status: 400, error: describeGaps(gaps) };
  if (!person.userId) return { ok: false, status: 400, error: "This person needs an account before you can send the agreement." };
  if (!person.email) return { ok: false, status: 400, error: "This account has no email address, so the agreement cannot be sent." };
  const token = newSigningToken();
  const expires = new Date(Date.now() + CONTRACT_LINK_DAYS * 24 * 60 * 60 * 1000);
  const url = signUrl(token);
  if (!url.startsWith("http")) {
    return { ok: false, status: 500, error: "The website address is not set, so the email cannot include a link." };
  }
  const number = contractNumber || makeContractNumber();
  if (replaceId) {
    await dbQuery(
      `UPDATE seller_contracts
          SET token_hash = $2, token_expires_at = $3, status = 'sent', presented_text = NULL,
              opened_at = NULL, template_id = $4::uuid, template_version = $5, updated_at = now()
        WHERE id = $1::uuid`,
      [replaceId, hashToken(token), expires, template.id, template.version]
    );
  } else {
    await dbQuery(
      `INSERT INTO seller_contracts (
         contact_id, want, template_id, template_version, language, contract_number, status, token_hash, token_expires_at
       ) VALUES ($1::uuid, $2, $3::uuid, $4, 'en', $5, 'sent', $6, $7)`,
      [person.id, person.want, template.id, template.version, number, hashToken(token), expires]
    );
  }
  await syncKyc(dbQuery, person.id, "sent", null);
  return { ok: true, token, url, expiresAt: expires.toISOString() };
}

async function mailLink(person, url, kind) {
  if (!person?.email || !String(url || "").startsWith("http")) return false;
  const text = kind === "approved"
    ? `Your agreement is approved. Log in with this email address, then open the link to download your copy:\n${url}\n\nOnly this account can open it.`
    : `Your Cleva agreement is ready. Log in with this email address, then open the link to read and sign:\n${url}\n\nThe link expires in ${CONTRACT_LINK_DAYS} days. Only this account can sign it.`;
  const mail = await sendMarketMail({
    to: person.email,
    subject: kind === "approved" ? "Your Cleva agreement is approved" : "Your Cleva agreement",
    text,
  });
  return Boolean(mail.sent);
}

export async function getContractSettings(dbQuery) {
  try {
    await seedContractTemplates(dbQuery);
    const row = await loadSettingsRow(dbQuery);
    const templates = await dbQuery(
      `SELECT id::text AS id, want, version, language, body, is_active AS "isActive", created_at AS "createdAt"
         FROM seller_contract_templates
        ORDER BY want, language, version DESC`
    );
    return {
      ok: true,
      settings: publicSettings(row),
      templates: templates.rows,
      variables: CONTRACT_VARIABLES,
      retentionNote: RETENTION_NOTE,
      smsReady: false,
    };
  } catch (e) {
    return dbError(e, "Could not load contract settings.");
  }
}

export async function saveContractSettings(dbQuery, body, actor) {
  try {
    if (!canEditContractSettings(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    await seedContractTemplates(dbQuery, actor.userId);
    const patch = settingsFromBody(body);
    const sets = [];
    const params = [];
    const changed = [];
    let i = 1;
    for (const [camel, value] of Object.entries(patch)) {
      const column = columnForCamel(camel);
      if (!column) continue;
      sets.push(`${column} = $${i++}`);
      params.push(value);
      changed.push(camel);
    }
    if (body.logoDataUrl) {
      const image = decodeImageDataUrl(body.logoDataUrl);
      if (!image.ok) return { ok: false, status: 400, error: image.error };
      sets.push(`logo_bytes = $${i++}`, `logo_mime = $${i++}`);
      params.push(image.bytes, image.mime);
      changed.push("logo");
    }
    if (body.signatureDataUrl) {
      const image = decodeImageDataUrl(body.signatureDataUrl);
      if (!image.ok) return { ok: false, status: 400, error: image.error };
      sets.push(`signer_signature_bytes = $${i++}`, `signer_signature_mime = $${i++}`);
      params.push(image.bytes, image.mime);
      changed.push("signature");
    }
    if (!sets.length) {
      const row = await loadSettingsRow(dbQuery);
      return { ok: true, settings: publicSettings(row), changed: [] };
    }
    sets.push("updated_at = now()", `updated_by = $${i++}::uuid`);
    params.push(actor.userId || null);
    await dbQuery(`UPDATE seller_contract_settings SET ${sets.join(", ")} WHERE id = 1`, params);
    audit(actor, "seller_contract.settings", "1", { changed });
    const row = await loadSettingsRow(dbQuery);
    return {
      ok: true,
      settings: publicSettings(row),
      changed,
      warning: patch.otpRequired
        ? "Phone codes are on, but SMS is not connected. People will not be able to finish signing until you turn this off or connect SMS."
        : null,
    };
  } catch (e) {
    return dbError(e, "Could not save contract settings.");
  }
}

export async function saveContractTemplate(dbQuery, input, actor) {
  const want = String(input.want || "");
  const language = String(input.language || "");
  try {
    if (!canEditContractSettings(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    const body = String(input.body || "").trim();
    if (!WANTS.includes(want)) return { ok: false, status: 400, error: "Choose seller, buyer, or scout." };
    if (!LANGUAGES.includes(language)) return { ok: false, status: 400, error: "Choose English or Kinyarwanda." };
    if (body.length < 20) return { ok: false, status: 400, error: "The agreement is too short." };
    if (body.length > 200_000) return { ok: false, status: 400, error: "The agreement is too long." };
    await dbQuery(
      `UPDATE seller_contract_templates
          SET is_active = false
        WHERE want = $1 AND language = $2 AND is_active = true`,
      [want, language]
    );
    const inserted = await dbQuery(
      `INSERT INTO seller_contract_templates (want, version, language, body, is_active, created_by)
       VALUES (
         $1,
         COALESCE((SELECT MAX(version) FROM seller_contract_templates WHERE want = $1 AND language = $2), 0) + 1,
         $2, $3, true, $4::uuid
       )
       RETURNING id::text AS id, version`,
      [want, language, body, actor.userId || null]
    );
    const row = inserted.rows[0];
    audit(actor, "seller_contract.template", row.id, { want, language, version: row.version });
    return { ok: true, template: { id: row.id, want, language, version: row.version, isActive: true, body } };
  } catch (e) {
    if (WANTS.includes(want) && LANGUAGES.includes(language)) {
      await dbQuery(
        `UPDATE seller_contract_templates
            SET is_active = true
          WHERE id = (
            SELECT id FROM seller_contract_templates
             WHERE want = $1 AND language = $2
             ORDER BY version DESC
             LIMIT 1
          )
            AND NOT EXISTS (
              SELECT 1 FROM seller_contract_templates
               WHERE want = $1 AND language = $2 AND is_active = true
            )`,
        [want, language]
      ).catch(() => undefined);
    }
    return dbError(e, "Could not save the agreement.");
  }
}

export async function previewContract(dbQuery, input) {
  try {
    const want = WANTS.includes(input.want) ? input.want : "sell";
    const language = LANGUAGES.includes(input.language) ? input.language : "en";
    let body = String(input.body || "").trim();
    if (!body) {
      await seedContractTemplates(dbQuery);
      const template = await activeTemplate(dbQuery, want, language);
      if (!template) return { ok: false, status: 404, error: "That language is not ready yet." };
      body = template.body;
    }
    const settings = publicSettings(await loadSettingsRow(dbQuery));
    const text = fillContract(body, sampleVars(settings));
    return { ok: true, text, missing: variablesIn(text), sample: true };
  } catch (e) {
    return dbError(e, "Could not preview the agreement.");
  }
}

export async function previewContractPdf(dbQuery, input) {
  try {
    const preview = await previewContract(dbQuery, input);
    if (!preview.ok) return preview;
    const images = await loadSettingsRow(dbQuery, true);
    const settings = publicSettings(images);
    const pdf = await buildContractPdf({
      title: "Sample agreement",
      header: settings?.letterheadHeader || "SAMPLE — not a signed agreement",
      footer: settings?.letterheadFooter || "Sample only. Company details that are still blank are filled with sample words.",
      logo: images?.logo_bytes || null,
      logoMime: images?.logo_mime || null,
      body: `SAMPLE — not a signed agreement.\n\n${preview.text}`,
    });
    return { ok: true, pdf, filename: `${input.want || "sell"}-contract-preview.pdf` };
  } catch (e) {
    return dbError(e, "Could not build the preview PDF.");
  }
}

export async function readSettingsImage(dbQuery, kind) {
  const row = await loadSettingsRow(dbQuery, true);
  if (!row) return null;
  if (kind === "logo" && row.logo_bytes) return { bytes: row.logo_bytes, mime: row.logo_mime || "image/png" };
  if (kind === "signature" && row.signer_signature_bytes) {
    return { bytes: row.signer_signature_bytes, mime: row.signer_signature_mime || "image/png" };
  }
  return null;
}

export async function sendPersonContract(dbQuery, contactId, actor, { resend = false } = {}) {
  try {
    if (!canSendContract(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    await seedContractTemplates(dbQuery, actor.userId);
    const person = await loadPerson(dbQuery, contactId);
    if (!person) return { ok: false, status: 404, error: "Person not found." };
    if (person.kycContractStatus === "approved") {
      return { ok: false, status: 400, error: "This contract is already approved." };
    }
    const latest = await expireIfNeeded(dbQuery, await latestAttempt(dbQuery, contactId));
    if (latest && (latest.status === "signed" || latest.status === "approved")) {
      return { ok: false, status: 400, error: "This contract is already signed." };
    }
    const replaceId = latest && ["sent", "opened"].includes(latest.status) ? latest.id : null;
    const issued = await issueLink(dbQuery, person, actor, {
      replaceId,
      contractNumber: replaceId ? latest.contractNumber : null,
    });
    if (!issued.ok) return issued;
    const emailSent = await mailLink(person, issued.url, "sign");
    audit(actor, resend ? "seller_contract.resend" : "seller_contract.send", contactId, { emailSent });
    if (!emailSent) {
      return { ok: false, status: 502, error: "The agreement is saved, but the email did not send. Use Resend in a moment." };
    }
    return { ok: true, url: issued.url, expiresAt: issued.expiresAt, emailSent, contact: await reloadContact(dbQuery, contactId) };
  } catch (e) {
    return dbError(e, "Could not send the contract.");
  }
}

function sessionPayload(row, person, settings, languages, logoDataUrl) {
  const waiting = row.status === "signed";
  const done = row.status === "approved";
  return {
    status: row.status,
    name: person?.name || "",
    want: row.want,
    language: row.language,
    languages,
    otpRequired: Boolean(settings?.otpRequired),
    smsReady: false,
    text: row.presentedText || row.frozenText || "",
    letterheadHeader: settings?.letterheadHeader || "",
    letterheadFooter: settings?.letterheadFooter || "",
    logoDataUrl,
    expiresAt: row.tokenExpiresAt,
    hasPdf: Boolean(done && row.hasPdf),
    message: done
      ? "Your agreement is approved. You can download your copy."
      : waiting
        ? "Thank you. We are reviewing your agreement."
        : row.status === "expired"
          ? "This link has expired. Ask Cleva for a new one."
          : row.status === "rejected"
            ? "This agreement was not accepted. Ask Cleva for a new link."
            : null,
  };
}

async function logoDataUrl(dbQuery) {
  const images = await loadSettingsRow(dbQuery, true);
  if (!images?.logo_bytes) return null;
  const mime = images.logo_mime || "image/png";
  return `data:${mime};base64,${Buffer.from(images.logo_bytes).toString("base64")}`;
}

export async function openSigningLink(dbQuery, token, actorUserId) {
  try {
    let row = await expireIfNeeded(dbQuery, await byToken(dbQuery, token));
    if (!row) return { ok: false, status: 404, error: "This link is not valid." };
    const signer = await requireSigner(dbQuery, row, actorUserId);
    if (!signer.ok) return signer;
    const person = signer.person;
    const settings = publicSettings(await loadSettingsRow(dbQuery));
    if (row.status === "sent") {
      const template = await activeTemplate(dbQuery, row.want, row.language || "en");
      const source = template?.body || "";
      const text = presentContract(source, settings, person || {}, row.contractNumber || makeContractNumber());
      await dbQuery(
        `UPDATE seller_contracts
            SET status = 'opened', presented_text = $2, opened_at = COALESCE(opened_at, now()), updated_at = now()
          WHERE id = $1::uuid AND status = 'sent'`,
        [row.id, text]
      );
      row = { ...row, status: "opened", presentedText: text };
    }
    const languages = await activeLanguages(dbQuery, row.want);
    return { ok: true, session: sessionPayload(row, person, settings, languages, await logoDataUrl(dbQuery)) };
  } catch (e) {
    return dbError(e, "Could not open this agreement.");
  }
}

export async function setSigningLanguage(dbQuery, token, language, actorUserId) {
  try {
    const lang = String(language || "");
    if (!LANGUAGES.includes(lang)) return { ok: false, status: 400, error: "Choose English or Kinyarwanda." };
    const row = await expireIfNeeded(dbQuery, await byToken(dbQuery, token));
    if (!row) return { ok: false, status: 404, error: "This link is not valid." };
    const signer = await requireSigner(dbQuery, row, actorUserId);
    if (!signer.ok) return signer;
    if (!["sent", "opened"].includes(row.status)) {
      return { ok: false, status: 400, error: "This agreement can no longer be changed." };
    }
    const template = await activeTemplate(dbQuery, row.want, lang);
    if (!template) return { ok: false, status: 400, error: "That language is not ready yet. Please read the other version." };
    const person = await loadPerson(dbQuery, row.contactId);
    const settings = publicSettings(await loadSettingsRow(dbQuery));
    const text = presentContract(template.body, settings, person || {}, row.contractNumber || makeContractNumber());
    await dbQuery(
      `UPDATE seller_contracts
          SET language = $2, presented_text = $3, template_id = $4::uuid, template_version = $5,
              status = 'opened', opened_at = COALESCE(opened_at, now()), updated_at = now()
        WHERE id = $1::uuid AND status IN ('sent', 'opened')`,
      [row.id, lang, text, template.id, template.version]
    );
    return openSigningLink(dbQuery, token, actorUserId);
  } catch (e) {
    return dbError(e, "Could not change the language.");
  }
}

export async function signContract(dbQuery, token, input, reqMeta = {}) {
  try {
    const row = await expireIfNeeded(dbQuery, await byToken(dbQuery, token));
    if (!row) return { ok: false, status: 404, error: "This link is not valid." };
    const signer = await requireSigner(dbQuery, row, reqMeta.userId);
    if (!signer.ok) return signer;
    if (row.status === "signed" || row.status === "approved") {
      return { ok: false, status: 409, error: "This agreement is already signed." };
    }
    if (row.status === "expired") return { ok: false, status: 410, error: "This link has expired. Ask Cleva for a new one." };
    if (!["sent", "opened"].includes(row.status)) {
      return { ok: false, status: 400, error: "This link can no longer be signed." };
    }
    if (input?.readConfirmed !== true || input?.electronicConsent !== true) {
      return { ok: false, status: 400, error: "Tick both boxes before you sign." };
    }
    const typedName = String(input?.typedName || "").trim().slice(0, 200);
    if (typedName.length < 3) return { ok: false, status: 400, error: "Type your full name as it is on your ID." };
    const signature = decodeImageDataUrl(input?.signatureDataUrl);
    if (!signature.ok || signature.bytes.length < 200) {
      return { ok: false, status: 400, error: signature.ok ? "Draw your signature." : signature.error };
    }
    const selfie = decodeImageDataUrl(input?.selfieDataUrl);
    if (!selfie.ok || selfie.bytes.length < 500) {
      return { ok: false, status: 400, error: selfie.ok ? "Take a clear selfie." : selfie.error };
    }
    const settings = publicSettings(await loadSettingsRow(dbQuery));
    if (settings?.otpRequired && !row.otpVerified) {
      return { ok: false, status: 400, error: "Enter the code from your phone first." };
    }
    let text = row.presentedText;
    if (!text) {
      const person = await loadPerson(dbQuery, row.contactId);
      const template = await activeTemplate(dbQuery, row.want, row.language || "en");
      text = presentContract(template?.body || "", settings, person || {}, row.contractNumber || makeContractNumber());
    }
    const fingerprint = hashToken(text);
    const updated = await dbQuery(
      `UPDATE seller_contracts
          SET status = 'signed', presented_text = COALESCE(presented_text, $2), frozen_text = $2, text_sha256 = $3,
              typed_name = $4, signature_bytes = $5, signature_mime = $6, selfie_bytes = $7, selfie_mime = $8,
              read_confirmed = true, electronic_consent = true, signed_at = now(),
              signer_ip = $9, signer_user_agent = $10, updated_at = now()
        WHERE id = $1::uuid AND status IN ('sent', 'opened')
        RETURNING id`,
      [
        row.id,
        text,
        fingerprint,
        typedName,
        signature.bytes,
        signature.mime,
        selfie.bytes,
        selfie.mime,
        String(reqMeta.ip || "").slice(0, 80) || null,
        String(reqMeta.userAgent || "").slice(0, 300) || null,
      ]
    );
    if (!updated.rowCount) return { ok: false, status: 409, error: "This agreement is already signed." };
    await syncKyc(dbQuery, row.contactId, "signed", text);
    return { ok: true, status: "signed" };
  } catch (e) {
    return dbError(e, "Could not save the signature.");
  }
}

export async function requestContractOtp(dbQuery, token, sender = null, actorUserId = null) {
  try {
    const row = await expireIfNeeded(dbQuery, await byToken(dbQuery, token));
    if (!row) return { ok: false, status: 404, error: "This link is not valid." };
    const signer = await requireSigner(dbQuery, row, actorUserId);
    if (!signer.ok) return signer;
    if (!["sent", "opened"].includes(row.status)) {
      return { ok: false, status: 400, error: "This agreement can no longer be signed." };
    }
    const settings = publicSettings(await loadSettingsRow(dbQuery));
    const decision = acceptOtpSend({
      otpRequired: settings?.otpRequired,
      smsReady: typeof sender === "function",
      lastSentAt: row.otpSentAt,
    });
    if (!decision.ok) return { ok: false, status: 400, error: decision.error };
    const person = await loadPerson(dbQuery, row.contactId);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const sent = await sender({ phone: person?.phone, code });
    if (!sent?.ok) return { ok: false, status: 400, error: sent?.error || "The text message could not be sent." };
    await dbQuery(
      `UPDATE seller_contracts
          SET otp_code_hash = $2, otp_expires_at = $3, otp_sent_at = now(), otp_attempts = 0, otp_verified = false, updated_at = now()
        WHERE id = $1::uuid`,
      [row.id, hashToken(code), new Date(Date.now() + OTP_TTL_MS)]
    );
    return { ok: true };
  } catch (e) {
    return dbError(e, "Could not send the code.");
  }
}

export async function checkContractOtp(dbQuery, token, code, actorUserId = null) {
  try {
    const row = await byToken(dbQuery, token);
    if (!row) return { ok: false, status: 404, error: "This link is not valid." };
    const signer = await requireSigner(dbQuery, row, actorUserId);
    if (!signer.ok) return signer;
    const result = checkOtpCode({
      code,
      hash: row.otpCodeHash,
      expiresAt: row.otpExpiresAt,
      attempts: Number(row.otpAttempts || 0),
    });
    if (!result.ok) {
      await dbQuery(
        `UPDATE seller_contracts SET otp_attempts = otp_attempts + 1, updated_at = now() WHERE id = $1::uuid`,
        [row.id]
      );
      return { ok: false, status: 400, error: result.error };
    }
    await dbQuery(
      `UPDATE seller_contracts
          SET otp_verified = true, otp_code_hash = NULL, otp_expires_at = NULL, updated_at = now()
        WHERE id = $1::uuid`,
      [row.id]
    );
    return { ok: true };
  } catch (e) {
    return dbError(e, "Could not check the code.");
  }
}

function filePath(contactId, kind) {
  const { exp, sig } = signFileQuery(contactId, kind);
  return `/api/insights/market/recruitment/contacts/${contactId}/contract/file/${kind}?exp=${exp}&sig=${sig}`;
}

export async function contractReview(dbQuery, contactId, actor) {
  try {
    if (!canSendContract(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    const latest = await expireIfNeeded(dbQuery, await latestAttempt(dbQuery, contactId));
    const history = await dbQuery(
      `SELECT id::text AS id, status, language, template_version AS "templateVersion",
              signed_at AS "signedAt", rejection_reason AS "rejectionReason", created_at AS "createdAt"
         FROM seller_contracts
        WHERE contact_id = $1::uuid
        ORDER BY created_at DESC`,
      [contactId]
    );
    if (!latest) {
      return { ok: true, contract: null, history: [], canApprove: canApproveContract(actor.role) };
    }
    const files = {};
    if (latest.hasSignature) files.signature = filePath(contactId, "signature");
    if (latest.hasSelfie) files.selfie = filePath(contactId, "selfie");
    if (latest.hasPdf) files.pdf = filePath(contactId, "pdf");
    return {
      ok: true,
      canApprove: canApproveContract(actor.role),
      files,
      history: history.rows,
      contract: {
        id: latest.id,
        status: latest.status,
        language: latest.language,
        templateVersion: latest.templateVersion,
        contractNumber: latest.contractNumber,
        text: latest.frozenText || latest.presentedText || "",
        typedName: latest.typedName,
        signedAt: latest.signedAt,
        ip: latest.signerIp,
        userAgent: latest.signerUserAgent,
        otpVerified: Boolean(latest.otpVerified),
        rejectionReason: latest.rejectionReason,
        fingerprint: latest.textSha256,
      },
    };
  } catch (e) {
    return dbError(e, "Could not load the contract.");
  }
}

export async function readContractFile(dbQuery, contactId, kind) {
  const columns = {
    signature: ["signature_bytes", "signature_mime"],
    selfie: ["selfie_bytes", "selfie_mime"],
    pdf: ["pdf_bytes", null],
  }[kind];
  if (!columns) return null;
  const r = await dbQuery(
    `SELECT ${columns[0]} AS bytes, ${columns[1] ? `${columns[1]} AS mime` : "NULL AS mime"}
       FROM seller_contracts
      WHERE contact_id = $1::uuid AND ${columns[0]} IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [contactId]
  );
  const row = r.rows[0];
  if (!row?.bytes) return null;
  return { bytes: row.bytes, mime: kind === "pdf" ? "application/pdf" : row.mime || "image/png" };
}

export async function approveContract(dbQuery, contactId, actor) {
  try {
    if (!canApproveContract(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    const latest = await latestAttempt(dbQuery, contactId);
    if (!latest) return { ok: false, status: 404, error: "No contract has been sent." };
    if (latest.status === "approved") {
      const contact = await promoteIfKycClear(dbQuery, await reloadContact(dbQuery, contactId), actor);
      return { ok: true, already: true, contact };
    }
    if (latest.status !== "signed") return { ok: false, status: 400, error: "Nothing is waiting for approval." };
    const files = await dbQuery(
      `SELECT frozen_text, signature_bytes, signature_mime, selfie_bytes, selfie_mime, contract_number, typed_name, signed_at, signer_ip, signer_user_agent, otp_verified, text_sha256
         FROM seller_contracts WHERE id = $1::uuid`,
      [latest.id]
    );
    const signed = files.rows[0];
    const images = await loadSettingsRow(dbQuery, true);
    const settings = publicSettings(images);
    const pdf = await buildContractPdf({
      title: latest.contractNumber || "Agreement",
      header: settings?.letterheadHeader || settings?.companyLegalName || "Agreement",
      footer: settings?.letterheadFooter || "",
      logo: images?.logo_bytes || null,
      logoMime: images?.logo_mime || null,
      body: signed.frozen_text || "",
      signature: signed.signature_bytes,
      signatureMime: signed.signature_mime,
      selfie: signed.selfie_bytes,
      selfieMime: signed.selfie_mime,
      companySignature: images?.signer_signature_bytes || null,
      companySignatureMime: images?.signer_signature_mime || null,
      record: {
        contractNumber: signed.contract_number,
        typedName: signed.typed_name,
        signedAt: signed.signed_at ? new Date(signed.signed_at).toISOString() : "",
        approvedAt: new Date().toISOString(),
        ip: signed.signer_ip,
        userAgent: signed.signer_user_agent,
        otpVerified: Boolean(signed.otp_verified),
        fingerprint: signed.text_sha256,
        signerName: settings?.signerName || "",
        signerTitle: settings?.signerTitle || "",
      },
    });
    const downloadToken = newSigningToken();
    const updated = await dbQuery(
      `UPDATE seller_contracts
          SET status = 'approved', pdf_bytes = $2, reviewed_by = $3::uuid, reviewed_at = now(),
              download_token_hash = $4, updated_at = now()
        WHERE id = $1::uuid AND status = 'signed'
        RETURNING id`,
      [latest.id, pdf, actor.userId || null, hashToken(downloadToken)]
    );
    if (!updated.rowCount) return { ok: false, status: 409, error: "This contract was already reviewed." };
    await syncKyc(dbQuery, contactId, "approved", signed.frozen_text || "");
    let contact = await reloadContact(dbQuery, contactId);
    contact = await promoteIfKycClear(dbQuery, contact, actor);
    const person = await loadPerson(dbQuery, contactId);
    const copyUrl = signUrl(downloadToken);
    const emailSent = await mailLink(person, copyUrl, "approved");
    audit(actor, "seller_contract.approve", contactId, { emailSent, stage: contact?.stage || null });
    return { ok: true, contact, copyUrl, emailSent };
  } catch (e) {
    return dbError(e, "Could not approve the contract.");
  }
}

export async function rejectContract(dbQuery, contactId, actor, reason) {
  try {
    if (!canApproveContract(actor?.role)) return { ok: false, status: 403, error: "Forbidden" };
    const why = String(reason || "").trim().slice(0, 500);
    if (why.length < 3) return { ok: false, status: 400, error: "Write a short reason." };
    const latest = await latestAttempt(dbQuery, contactId);
    if (!latest || latest.status !== "signed") {
      return { ok: false, status: 400, error: "Nothing is waiting for approval." };
    }
    await dbQuery(
      `UPDATE seller_contracts
          SET status = 'rejected', rejection_reason = $2, reviewed_by = $3::uuid, reviewed_at = now(), updated_at = now()
        WHERE id = $1::uuid AND status = 'signed'`,
      [latest.id, why, actor.userId || null]
    );
    await syncKyc(dbQuery, contactId, "rejected", null);
    const person = await loadPerson(dbQuery, contactId);
    const issued = await issueLink(dbQuery, person, actor);
    audit(actor, "seller_contract.reject", contactId, { relinked: Boolean(issued.ok) });
    return {
      ok: true,
      url: issued.ok ? issued.url : null,
      linkError: issued.ok ? null : issued.error,
      contact: await reloadContact(dbQuery, contactId),
    };
  } catch (e) {
    return dbError(e, "Could not reject the contract.");
  }
}

export async function readApprovedPdf(dbQuery, token, actorUserId) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return { ok: false, status: 404, error: "The signed copy is not ready yet." };
  const hash = hashToken(token);
  const r = await dbQuery(
    `SELECT pdf_bytes AS bytes, contact_id::text AS "contactId"
       FROM seller_contracts
      WHERE status = 'approved' AND (token_hash = $1 OR download_token_hash = $1)
      LIMIT 1`,
    [hash]
  );
  const row = r.rows[0];
  if (!row?.bytes) return { ok: false, status: 404, error: "The signed copy is not ready yet." };
  const signer = await requireSigner(dbQuery, row, actorUserId);
  if (!signer.ok) return signer;
  return { ok: true, bytes: row.bytes, mime: "application/pdf" };
}
