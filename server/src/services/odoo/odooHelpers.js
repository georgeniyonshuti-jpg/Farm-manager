const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 300;

/**
 * Convert raw Odoo/XML-RPC errors into user-facing messages.
 * @param {unknown} error
 */
export function mapOdooError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Odoo error");
  const msg = raw.toLowerCase();

  if (msg.includes("access denied") || msg.includes("authentication failed")) {
    return "Odoo authentication failed. Check ODOO_DB, ODOO_USER, and ODOO_PASSWORD.";
  }
  if (msg.includes("socket hang up") || msg.includes("econnreset") || msg.includes("etimedout")) {
    return "Odoo connection timed out. Please retry shortly.";
  }
  if (msg.includes("name or service not known") || msg.includes("enotfound")) {
    return "Unable to resolve Odoo host. Check ODOO_URL.";
  }
  if (msg.includes("validationerror")) {
    return "Odoo rejected the payload due to validation rules.";
  }
  if (msg.includes("missing required value")) {
    return "Odoo rejected the payload because a required value is missing.";
  }
  return raw;
}

/**
 * True for likely network/availability issues — worker should not burn MAX_ATTEMPTS
 * the same way as validation/business errors.
 * @param {string} message Mapped message from mapOdooError (or similar).
 */
export function isTransientConnectionError(message) {
  const m = String(message ?? "").toLowerCase();
  if (!m) return false;
  return (
    m.includes("connection timed out") ||
    m.includes("socket hang up") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("name or service not known") ||
    m.includes("unable to resolve odoo host") ||
    m.includes("getaddrinfo") ||
    m.includes("network error") ||
    m.includes("eai_again")
  );
}

/**
 * Console logger for Odoo API actions.
 * @param {string} action
 * @param {unknown} result
 * @param {boolean} [ok]
 */
export function logOdooCall(action, result, ok = true) {
  const ts = new Date().toISOString();
  const state = ok ? "SUCCESS" : "ERROR";
  console.log(`[${ts}] [odoo] ${state} ${action}`, result ?? "");
}

/**
 * Retry wrapper for transient Odoo operations.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} action
 * @returns {Promise<T>}
 */
export async function withRetry(fn, action) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await fn();
      logOdooCall(`${action} (attempt ${attempt})`, "ok", true);
      return result;
    } catch (error) {
      lastErr = error;
      const message = mapOdooError(error);
      logOdooCall(`${action} (attempt ${attempt})`, message, false);
      if (attempt >= MAX_RETRIES) break;
      const backoff = BASE_BACKOFF_MS * (2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error(mapOdooError(lastErr));
}

/**
 * @param {string} value
 * @param {string} field
 */
function requireNonEmptyString(value, field) {
  if (!String(value ?? "").trim()) {
    throw new Error(`Invalid payload: ${field} is required.`);
  }
}

/**
 * @param {number} value
 * @param {string} field
 */
function requireNumber(value, field) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Invalid payload: ${field} must be a number.`);
  }
}

/**
 * Validation for customer invoice payload.
 * partnerEmail is optional — we search by name when email is absent.
 * @param {unknown} payload
 */
export function validateInvoicePayload(payload) {
  const data = /** @type {any} */ (payload ?? {});
  requireNonEmptyString(data.partnerName, "partnerName");
  // partnerEmail is optional; partner is resolved by name when email is missing
  requireNonEmptyString(data.date, "date");
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw new Error("Invalid payload: lines must be a non-empty array.");
  }
  for (let i = 0; i < data.lines.length; i += 1) {
    const line = data.lines[i] ?? {};
    requireNonEmptyString(line.productName, `lines[${i}].productName`);
    requireNumber(line.quantity, `lines[${i}].quantity`);
    requireNumber(line.unitPrice, `lines[${i}].unitPrice`);
  }
}

/**
 * Validation for vendor bill payload.
 * accountCode per line is optional — falls back to event-type account or Odoo default.
 * @param {unknown} payload
 */
export function validateVendorBillPayload(payload) {
  const data = /** @type {any} */ (payload ?? {});
  requireNonEmptyString(data.vendorName, "vendorName");
  requireNonEmptyString(data.date, "date");
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw new Error("Invalid payload: lines must be a non-empty array.");
  }
  for (let i = 0; i < data.lines.length; i += 1) {
    const line = data.lines[i] ?? {};
    requireNonEmptyString(line.description, `lines[${i}].description`);
    // accountCode is optional — resolved at dispatch time
    requireNumber(line.quantity, `lines[${i}].quantity`);
    requireNumber(line.unitPrice, `lines[${i}].unitPrice`);
  }
}

/**
 * Validation for journal entry payload.
 * accountCode per line is optional — resolved via farm account map at dispatch time.
 * @param {unknown} payload
 */
export function validateJournalPayload(payload) {
  const data = /** @type {any} */ (payload ?? {});
  requireNonEmptyString(data.ref, "ref");
  requireNonEmptyString(data.date, "date");
  if (!Array.isArray(data.lines) || data.lines.length < 2) {
    throw new Error("Invalid payload: lines must contain at least 2 entries.");
  }
  let debitTotal = 0;
  let creditTotal = 0;
  for (let i = 0; i < data.lines.length; i += 1) {
    const line = data.lines[i] ?? {};
    // accountCode optional — resolved at dispatch time
    requireNonEmptyString(line.label, `lines[${i}].label`);
    requireNumber(line.debit, `lines[${i}].debit`);
    requireNumber(line.credit, `lines[${i}].credit`);
    debitTotal += Number(line.debit);
    creditTotal += Number(line.credit);
  }
  if (Math.abs(debitTotal - creditTotal) > 0.0001) {
    throw new Error("Invalid payload: journal entry is not balanced.");
  }
}

/**
 * Validation for getInvoices filter.
 * @param {unknown} payload
 */
export function validateInvoiceFilters(payload) {
  const data = /** @type {any} */ (payload ?? {});
  if (data.dateFrom != null && !String(data.dateFrom).trim()) throw new Error("dateFrom must be a non-empty date string.");
  if (data.dateTo != null && !String(data.dateTo).trim()) throw new Error("dateTo must be a non-empty date string.");
  if (data.state != null && !String(data.state).trim()) throw new Error("state must be a non-empty string.");
}

/**
 * Map a raw Odoo error string to a user-facing message with a category code.
 * Used by the accounting recovery page to guide users on what to fix.
 * @param {string | null | undefined} errorMsg
 * @returns {{ category: string, message: string }}
 */
export function mapOdooErrorToUserMessage(errorMsg) {
  const raw = String(errorMsg ?? "").trim();
  const msg = raw.toLowerCase();

  if (!raw) return { category: "unknown_error", message: "Unknown error. Try resending." };

  if (msg.includes("access denied") || msg.includes("authentication failed") || msg.includes("api key")) {
    return { category: "auth_error", message: "Odoo authentication failed. Check ODOO_USER and ODOO_PASSWORD in server settings." };
  }
  if (msg.includes("name or service not known") || msg.includes("enotfound") || msg.includes("odoo_url")) {
    return { category: "config_error", message: "Cannot reach Odoo. Check the ODOO_URL server setting." };
  }
  if (msg.includes("socket hang up") || msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("timeout")) {
    return { category: "connection_error", message: "Odoo connection timed out. Odoo may be temporarily offline — try resending." };
  }
  if (msg.includes("res.partner") || (msg.includes("partner") && msg.includes("not found"))) {
    return { category: "missing_supplier", message: "Supplier/partner not found in Odoo. Edit the supplier name so it matches a contact in Odoo, then resend." };
  }
  if ((msg.includes("account") || msg.includes("account.account")) && (msg.includes("not found") || msg.includes("does not exist") || msg.includes("invalid"))) {
    return { category: "missing_account", message: "Account code not found in Odoo. Contact your accountant to verify the chart of accounts." };
  }
  if ((msg.includes("account.journal") || msg.includes("journal")) && (msg.includes("not found") || msg.includes("does not exist"))) {
    return { category: "missing_journal", message: "Journal not found in Odoo. Contact your accountant to verify journal configuration." };
  }
  if (msg.includes("missing required") || msg.includes("required field") || (msg.includes("amount") && msg.includes("0"))) {
    return { category: "missing_amount", message: "A required value (amount, description, or date) is missing. Edit the record to fill it in, then resend." };
  }
  if (msg.includes("validationerror") || msg.includes("validation")) {
    return { category: "validation_error", message: "Odoo rejected this record due to a validation rule. Edit the fields and resend." };
  }
  if (msg.includes("database") && msg.includes("does not exist")) {
    return { category: "config_error", message: "Odoo database name is incorrect. Check the ODOO_DB server setting." };
  }
  if (msg.includes("missing required odoo environment")) {
    return { category: "config_error", message: "Odoo is not configured on this server. Check ODOO_URL, ODOO_DB, ODOO_USER, and ODOO_PASSWORD." };
  }
  return { category: "unknown_error", message: raw };
}
