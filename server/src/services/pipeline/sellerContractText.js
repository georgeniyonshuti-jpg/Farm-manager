/**
 * Contract wording, fill-in values, and checks that do not need the database.
 * English version 1 is read from docs/. Kinyarwanda stays empty until someone pastes it.
 */

import { readFileSync } from "node:fs";
import { marketPublicOrigin } from "./sellerClaim.js";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const DOC_FILES = {
  sell: "seller-contract-v1.md",
  buy: "buyer-contract-v1.md",
  scout: "scout-contract-v1.md",
};

export const WANTS = ["sell", "buy", "scout"];
export const LANGUAGES = ["en", "rw"];
export const CONTRACT_LINK_DAYS = 7;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const FILE_LINK_MS = 10 * 60 * 1000;

export const RETENTION_NOTE =
  "Selfies and signatures are personal data. They are kept until you choose how long to store them. Nothing is deleted automatically.";

/** camelCase for the API, database column, {{name}} in the agreement, label. */
export const SETTING_FIELDS = [
  ["companyLegalName", "company_legal_name", "company_legal_name", "Company legal name"],
  ["companyRegistrationNo", "company_registration_no", "company_registration_no", "Registration number"],
  ["companyTin", "company_tin", "company_tin", "TIN"],
  ["companyAddress", "company_address", "company_address", "Address"],
  ["companyPhone", "company_phone", "company_phone", "Phone"],
  ["companyEmail", "company_email", "company_email", "Email"],
  ["letterheadHeader", "letterhead_header", "letterhead_header", "Letterhead header"],
  ["letterheadFooter", "letterhead_footer", "letterhead_footer", "Letterhead footer"],
  ["signerName", "signer_name", "company_signer_name", "Signer name"],
  ["signerTitle", "signer_title", "company_signer_title", "Signer job title"],
  ["commissionPercent", "commission_percent", "commission_percent", "Commission percent"],
  ["payoutDays", "payout_days", "payout_days", "Payout days"],
  ["acceptanceHours", "acceptance_hours", "acceptance_hours", "Acceptance hours"],
  ["rateChangeNoticeDays", "rate_change_notice_days", "rate_change_notice_days", "Rate-change notice days"],
  ["terminationNoticeDays", "termination_notice_days", "termination_notice_days", "Termination notice days"],
  ["cancellationFeeRule", "cancellation_fee_rule", "cancellation_fee_rule", "Cancellation fee rule"],
  ["nonCircumventionMonths", "non_circumvention_months", "non_circumvention_months", "Non-circumvention months"],
  ["circumventionPenaltyRule", "circumvention_penalty_rule", "circumvention_penalty_rule", "Non-circumvention penalty"],
  ["disputeForum", "dispute_forum", "dispute_forum", "Dispute forum"],
  ["mediationDays", "mediation_days", "mediation_days", "Mediation days"],
  ["dataProtectionLawReference", "data_protection_law_reference", "data_protection_law_reference", "Data protection law"],
  ["prevailingLanguage", "prevailing_language", "prevailing_language", "Language that prevails"],
  ["payoutFeeRule", "payout_fee_rule", "payout_fee_rule", "Payout fee rule"],
];

export const CONTRACT_VARIABLES = [
  ...SETTING_FIELDS.map(([, , key, label]) => ({ key, label, when: "Company settings" })),
  { key: "seller_full_name", label: "Person's name", when: "Their record" },
  { key: "seller_id_number", label: "ID number", when: "Their KYC record, or “Not provided”" },
  { key: "seller_phone", label: "Phone", when: "Their record" },
  { key: "seller_district", label: "District", when: "Their record" },
  { key: "seller_sector", label: "Sector", when: "Their record" },
  { key: "contract_number", label: "Contract number", when: "Filled when the link is opened" },
  { key: "signing_date", label: "Signing date", when: "Filled when the link is opened" },
  { key: "signing_datetime", label: "Signing time", when: "Shown on the signature page" },
  { key: "seller_signature_image", label: "Drawn signature", when: "Shown on the signature page" },
  { key: "seller_selfie_thumbnail", label: "Selfie", when: "Shown on the signature page" },
  { key: "company_signature_image", label: "Company signature", when: "Added when the company approves" },
  { key: "approval_datetime", label: "Approval time", when: "Added when the company approves" },
];

const OPEN_TIME = new Set([
  "contract_number",
  "signing_date",
  "signing_datetime",
  "seller_signature_image",
  "seller_selfie_thumbnail",
  "company_signature_image",
  "approval_datetime",
]);

const COLUMN_BY_CAMEL = Object.fromEntries(SETTING_FIELDS.map(([camel, column]) => [camel, column]));

export function agreementFromDoc(filename) {
  const file = fileURLToPath(new URL(`../../../../docs/${filename}`, import.meta.url));
  const raw = readFileSync(file, "utf8");
  const marker = "\n---\n";
  const cut = raw.indexOf(marker);
  return (cut === -1 ? raw : raw.slice(cut + marker.length)).trim();
}

export function starterBody(want) {
  const file = DOC_FILES[want] || DOC_FILES.sell;
  return agreementFromDoc(file);
}

export function isStarterBody(want, body) {
  if (want !== "buy" && want !== "scout") return false;
  return String(body || "").trim() === starterBody(want);
}

export function variablesIn(body) {
  const found = [];
  const seen = new Set();
  for (const match of String(body || "").matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const key = match[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(key);
  }
  return found;
}

export function fillContract(body, vars) {
  return String(body || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (full, key) => {
    const value = vars[String(key).toLowerCase()];
    if (value == null || String(value).trim() === "") return full;
    return String(value);
  });
}

export function kigaliDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function kigaliDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function makeContractNumber(date = new Date(), rand = crypto.randomBytes(3).toString("hex").toUpperCase()) {
  const year = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", year: "numeric" }).format(date);
  return `CVA-${year}-${rand}`;
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "").trim()).digest("hex");
}

export function newSigningToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function maskIdNumber(value) {
  const text = String(value || "").replace(/\s/g, "");
  if (!text) return null;
  if (text.length < 5) return "••••";
  return `${text.slice(0, 2)}••••${text.slice(-2)}`;
}

export function kycStatusForContract(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "signed") return "submitted";
  return "missing";
}

export function canEditContractSettings(role) {
  return role === "superuser";
}

export function canApproveContract(role) {
  return role === "superuser" || role === "sales_coordinator";
}

export function canSendContract(role) {
  return canApproveContract(role) || role === "sales_officer";
}

export function contractBadgeLabel(contractStatus, kycStatus) {
  const labels = {
    not_sent: "Not sent",
    sent: "Contract sent",
    opened: "Opened",
    signed: "Signed, awaiting approval",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Link expired",
  };
  if (contractStatus && labels[contractStatus]) return labels[contractStatus];
  if (kycStatus === "approved") return "Approved";
  if (kycStatus === "submitted") return "Needs the new link";
  if (kycStatus === "rejected") return "Rejected";
  return "Not sent";
}

export function settingsToVars(settings = {}) {
  const vars = {};
  for (const [camel, , key] of SETTING_FIELDS) {
    vars[key] = String(settings[camel] ?? "").trim();
  }
  return vars;
}

export function personVars(person = {}) {
  const name = String(person.name || "").trim();
  const phone = String(person.phone || "").trim();
  return {
    seller_full_name: name,
    seller_phone: phone,
    seller_id_number: String(person.kycIdNumber || "").trim() || "Not provided",
    seller_district: String(person.district || "").trim() || "Not provided",
    seller_sector: String(person.sector || "").trim() || "Not provided",
  };
}

export function openTimeVars(contractNumber, date = new Date()) {
  return {
    contract_number: contractNumber,
    signing_date: kigaliDate(date),
    signing_datetime: "the time recorded on the signature page",
    seller_signature_image: "drawn signature, shown on the signature page",
    seller_selfie_thumbnail: "selfie, shown on the signature page",
    company_signature_image: "added when the company approves",
    approval_datetime: "added when the company approves",
  };
}

export function sampleVars(settings = {}) {
  const vars = settingsToVars(settings);
  const samples = {
    company_legal_name: "Sample Company Ltd",
    company_registration_no: "000000000",
    company_tin: "000000000",
    company_address: "Kigali, Rwanda",
    company_phone: "+250788000000",
    company_email: "hello@example.com",
    company_signer_name: "Sample Signer",
    company_signer_title: "Director",
    commission_percent: "5",
    payout_days: "2",
    acceptance_hours: "24",
    rate_change_notice_days: "14",
    termination_notice_days: "14",
    cancellation_fee_rule: "none in this sample",
    non_circumvention_months: "6",
    circumvention_penalty_rule: "none in this sample",
    dispute_forum: "the courts of Rwanda",
    mediation_days: "30",
    data_protection_law_reference: "Law n° 058/2021 of 13/10/2021",
    prevailing_language: "English",
    payout_fee_rule: "paid by the Seller",
    seller_full_name: "Aline Uwase",
    seller_id_number: "1000000000000000",
    seller_phone: "+250788000000",
    seller_district: "Gasabo",
    seller_sector: "Kacyiru",
  };
  for (const [key, value] of Object.entries(samples)) {
    if (!vars[key]) vars[key] = value;
  }
  Object.assign(vars, openTimeVars("CVA-SAMPLE-0001"));
  return vars;
}

/** {{names}} that still have no value. Open-time names are filled with phrases. */
export function blockingGaps(body, settings, person) {
  const vars = {
    ...settingsToVars(settings),
    ...personVars(person),
    ...openTimeVars(person.contractNumber || "CVA-PENDING"),
  };
  if (!String(person?.name || "").trim()) vars.seller_full_name = "";
  return variablesIn(fillContract(body, vars));
}

export function presentContract(body, settings, person, contractNumber, date = new Date()) {
  const vars = {
    ...settingsToVars(settings),
    ...personVars(person),
    ...openTimeVars(contractNumber, date),
  };
  return fillContract(body, vars);
}

export function decodeImageDataUrl(value, maxBytes = 1_500_000) {
  const raw = String(value || "").trim();
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(raw);
  if (!match) return { ok: false, error: "Use a PNG, JPEG, or WebP image." };
  let mime = match[1].toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  } catch {
    return { ok: false, error: "That image could not be read." };
  }
  if (!bytes.length || bytes.length > maxBytes) {
    return { ok: false, error: "That image is too large. Use a smaller photo." };
  }
  return { ok: true, mime, bytes };
}

export function publicSettings(row) {
  if (!row) return null;
  const out = { otpRequired: Boolean(row.otp_required), hasLogo: Boolean(row.logo_bytes), hasSignature: Boolean(row.signer_signature_bytes) };
  for (const [camel, column] of SETTING_FIELDS) {
    out[camel] = row[column] == null ? "" : String(row[column]);
  }
  return out;
}

export function settingsFromBody(body = {}) {
  const next = {};
  for (const [camel] of SETTING_FIELDS) {
    if (body[camel] === undefined) continue;
    next[camel] = String(body[camel] ?? "").trim().slice(0, 2000);
  }
  if (body.letterheadHeader !== undefined) next.letterheadHeader = String(body.letterheadHeader ?? "").trim().slice(0, 2000);
  if (body.letterheadFooter !== undefined) next.letterheadFooter = String(body.letterheadFooter ?? "").trim().slice(0, 2000);
  if (body.otpRequired !== undefined) next.otpRequired = Boolean(body.otpRequired);
  return next;
}

export function columnForCamel(camel) {
  if (camel === "otpRequired") return "otp_required";
  return COLUMN_BY_CAMEL[camel] || null;
}

export function fileLinkSecret() {
  return process.env.SESSION_SECRET || "cleva-contract-dev";
}

export function signFileQuery(contactId, kind, now = Date.now()) {
  const exp = now + FILE_LINK_MS;
  const payload = `${contactId}.${kind}.${exp}`;
  const sig = crypto.createHmac("sha256", fileLinkSecret()).update(payload).digest("hex");
  return { exp, sig };
}

export function verifyFileQuery(contactId, kind, exp, sig, now = Date.now()) {
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN < now) return false;
  const payload = `${contactId}.${kind}.${expN}`;
  const expected = crypto.createHmac("sha256", fileLinkSecret()).update(payload).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signerAllowed(personUserId, actorUserId) {
  if (!personUserId || !actorUserId) return false;
  return String(personUserId) === String(actorUserId);
}

export function describeGaps(keys) {
  const labels = [...new Set(keys)].map((key) => CONTRACT_VARIABLES.find((item) => item.key === key)?.label || key);
  return `Save these on the Contracts page before sending: ${labels.join(", ")}.`;
}

export function signUrl(token) {
  const base = marketPublicOrigin();
  if (!base) return "";
  return `${base}/sign/${token}`;
}

export function smsConfigured() {
  return false;
}

export function acceptOtpSend({ otpRequired, smsReady, lastSentAt, now = Date.now() }) {
  if (!otpRequired) return { ok: false, error: "Phone codes are turned off." };
  if (!smsReady) {
    return { ok: false, error: "SMS is not connected yet. Leave phone codes off, and send the link by WhatsApp." };
  }
  if (lastSentAt && now - new Date(lastSentAt).getTime() < OTP_RESEND_MS) {
    return { ok: false, error: "Wait a minute before sending another code." };
  }
  return { ok: true };
}

export function checkOtpCode({ code, hash, expiresAt, attempts, now = Date.now() }) {
  if (Number(attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many tries. Ask Cleva for a new link." };
  }
  if (!hash || !expiresAt || new Date(expiresAt).getTime() < now) {
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }
  const given = hashToken(String(code || "").trim());
  const a = Buffer.from(given);
  const b = Buffer.from(String(hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "That code is not correct." };
  }
  return { ok: true };
}
