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
    return "Odoo authentication failed. Check ODOO_DB, ODOO_USER, and ODOO_API_KEY.";
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
 * @param {unknown} payload
 */
export function validateInvoicePayload(payload) {
  const data = /** @type {any} */ (payload ?? {});
  requireNonEmptyString(data.partnerName, "partnerName");
  requireNonEmptyString(data.partnerEmail, "partnerEmail");
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
    requireNonEmptyString(line.accountCode, `lines[${i}].accountCode`);
    requireNumber(line.quantity, `lines[${i}].quantity`);
    requireNumber(line.unitPrice, `lines[${i}].unitPrice`);
  }
}

/**
 * Validation for journal entry payload.
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
    requireNonEmptyString(line.accountCode, `lines[${i}].accountCode`);
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
