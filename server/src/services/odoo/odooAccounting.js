import { execute } from "./odooClient.js";
import {
  validateInvoicePayload,
  validateVendorBillPayload,
  validateJournalPayload,
  validateInvoiceFilters,
  withRetry,
} from "./odooHelpers.js";

/**
 * Whether to auto-post (confirm) the document after creation.
 * All farm-triggered events default to draft=true (manager reviews in Odoo).
 * Pass draft=false only for system-confirmed entries.
 */

async function findPartnerByEmail(email) {
  const ids = await withRetry(
    () => execute("res.partner", "search", [[["email", "=", String(email).trim()]]], { limit: 1 }),
    "res.partner.search(email)"
  );
  return Array.isArray(ids) && ids.length ? ids[0] : null;
}

async function createPartner(name, email, supplierRank = 0) {
  return withRetry(
    () => execute("res.partner", "create", [{
      name: String(name).trim(),
      email: String(email ?? "").trim() || false,
      customer_rank: 1,
      supplier_rank: supplierRank,
    }]),
    "res.partner.create"
  );
}

async function findOrCreatePartner({ name, email, supplierRank = 0 }) {
  if (email) {
    const existingId = await findPartnerByEmail(email);
    if (existingId) return existingId;
  }
  return createPartner(name, email, supplierRank);
}

async function findProductByName(name) {
  const ids = await withRetry(
    () => execute("product.product", "search", [[["name", "=", String(name).trim()]]], { limit: 1 }),
    "product.product.search(name)"
  );
  return Array.isArray(ids) && ids.length ? ids[0] : null;
}

async function createServiceProduct(name) {
  // product.template create also creates product.product variant
  const templateId = await withRetry(
    () => execute("product.template", "create", [{
      name: String(name).trim(),
      type: "service",
      list_price: 0,
    }]),
    "product.template.create"
  );
  const variants = await withRetry(
    () => execute("product.product", "search", [[["product_tmpl_id", "=", templateId]]], { limit: 1 }),
    "product.product.search(template)"
  );
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`Product variant not found after creating template for "${name}".`);
  }
  return variants[0];
}

async function findOrCreateProduct(name) {
  const existing = await findProductByName(name);
  if (existing) return existing;
  return createServiceProduct(name);
}

async function findAccountByCode(accountCode) {
  const ids = await withRetry(
    () => execute("account.account", "search", [[["code", "=", String(accountCode).trim()]]], { limit: 1 }),
    "account.account.search(code)"
  );
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(`Account code not found in Odoo: ${accountCode}`);
  }
  return ids[0];
}

async function resolvePurchaseJournalId() {
  const ids = await withRetry(
    () => execute("account.journal", "search", [[["type", "=", "purchase"]]], { limit: 1 }),
    "account.journal.search(purchase)"
  );
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("No purchase journal found in Odoo.");
  }
  return ids[0];
}

async function resolveMiscJournalId() {
  const ids = await withRetry(
    () => execute("account.journal", "search", [[["type", "=", "general"]]], { limit: 1 }),
    "account.journal.search(general)"
  );
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("No miscellaneous journal found in Odoo.");
  }
  return ids[0];
}

async function resolveSaleJournalId() {
  const ids = await withRetry(
    () => execute("account.journal", "search", [[["type", "=", "sale"]]], { limit: 1 }),
    "account.journal.search(sale)"
  );
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("No sale journal found in Odoo.");
  }
  return ids[0];
}

/** Fallback: first active expense-type account if no explicit code provided. */
async function resolveDefaultExpenseAccountId() {
  const ids = await withRetry(
    () => execute("account.account", "search", [[
      ["account_type", "=", "expense"],
      ["deprecated", "=", false],
    ]], { limit: 1 }),
    "account.account.search(expense-default)"
  );
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("No expense account found in Odoo chart of accounts.");
  }
  return ids[0];
}

/**
 * Creates a customer invoice in Odoo.
 * @param {{ partnerName: string, partnerEmail: string, lines: Array<{productName:string, quantity:number, unitPrice:number}>, date: string, externalRef?: string }} data
 * @param {{ draft?: boolean }} [opts] - draft=true (default) leaves invoice in draft; draft=false posts immediately.
 */
export async function createCustomerInvoice(data, { draft = true } = {}) {
  validateInvoicePayload(data);

  const partnerId = await findOrCreatePartner({
    name: data.partnerName,
    email: data.partnerEmail,
    supplierRank: 0,
  });

  const invoiceLines = [];
  for (const line of data.lines) {
    const productId = await findOrCreateProduct(line.productName);
    invoiceLines.push([0, 0, {
      product_id: productId,
      quantity: Number(line.quantity),
      price_unit: Number(line.unitPrice),
      name: String(line.productName).trim(),
    }]);
  }

  const createPayload = {
    move_type: "out_invoice",
    partner_id: partnerId,
    invoice_date: String(data.date),
    invoice_line_ids: invoiceLines,
  };
  if (data.externalRef) createPayload.ref = String(data.externalRef);

  const moveId = await withRetry(
    () => execute("account.move", "create", [createPayload]),
    "account.move.create(out_invoice)"
  );

  if (!draft) {
    await withRetry(
      () => execute("account.move", "action_post", [[moveId]]),
      "account.move.action_post(out_invoice)"
    );
  }

  const [invoice] = await withRetry(
    () => execute("account.move", "read", [[moveId], ["id", "name", "state"]]),
    "account.move.read(out_invoice)"
  );

  return {
    id: invoice?.id ?? moveId,
    invoiceNumber: invoice?.name ?? null,
    state: invoice?.state ?? null,
  };
}

/**
 * Creates a vendor bill (expense) in Odoo.
 * @param {{ vendorName: string, vendorEmail?: string, lines: Array<{description:string, quantity:number, unitPrice:number, accountCode?:string}>, date: string, externalRef?: string }} data
 * @param {{ draft?: boolean, defaultAccountCode?: string }} [opts]
 */
export async function createVendorBill(data, { draft = true, defaultAccountCode } = {}) {
  validateVendorBillPayload(data);
  const partnerId = await findOrCreatePartner({
    name: data.vendorName,
    email: data.vendorEmail ?? "",
    supplierRank: 1,
  });
  const journalId = await resolvePurchaseJournalId();

  const lines = [];
  for (const line of data.lines) {
    const effectiveCode = line.accountCode || defaultAccountCode;
    let accountId = null;
    if (effectiveCode) {
      accountId = await findAccountByCode(effectiveCode);
    } else {
      // Fallback to first expense account available
      accountId = await resolveDefaultExpenseAccountId();
    }
    lines.push([0, 0, {
      name: String(line.description),
      quantity: Number(line.quantity),
      price_unit: Number(line.unitPrice),
      account_id: accountId,
    }]);
  }

  const createPayload = {
    move_type: "in_invoice",
    partner_id: partnerId,
    invoice_date: String(data.date),
    journal_id: journalId,
    invoice_line_ids: lines,
  };
  if (data.externalRef) createPayload.ref = String(data.externalRef);

  const moveId = await withRetry(
    () => execute("account.move", "create", [createPayload]),
    "account.move.create(in_invoice)"
  );

  if (!draft) {
    await withRetry(
      () => execute("account.move", "action_post", [[moveId]]),
      "account.move.action_post(in_invoice)"
    );
  }

  const [bill] = await withRetry(
    () => execute("account.move", "read", [[moveId], ["id", "name", "state"]]),
    "account.move.read(in_invoice)"
  );

  return {
    id: bill?.id ?? moveId,
    billNumber: bill?.name ?? null,
    state: bill?.state ?? null,
  };
}

/**
 * Creates a journal entry in Odoo.
 * Lines may omit accountCode when they carry null; a placeholder line is used.
 * @param {{ ref: string, date: string, lines: Array<{accountCode:string|null, debit:number, credit:number, label:string}>, externalRef?: string }} data
 * @param {{ draft?: boolean }} [opts]
 */
export async function createJournalEntry(data, { draft = true } = {}) {
  validateJournalPayload(data);
  const journalId = await resolveMiscJournalId();

  const lineIds = [];
  for (const line of data.lines) {
    let accountId;
    if (line.accountCode) {
      accountId = await findAccountByCode(line.accountCode);
    } else {
      accountId = await resolveDefaultExpenseAccountId();
    }
    lineIds.push([0, 0, {
      name: String(line.label),
      account_id: accountId,
      debit: Number(line.debit),
      credit: Number(line.credit),
    }]);
  }

  const createPayload = {
    move_type: "entry",
    date: String(data.date),
    ref: String(data.ref),
    journal_id: journalId,
    line_ids: lineIds,
  };

  const moveId = await withRetry(
    () => execute("account.move", "create", [createPayload]),
    "account.move.create(entry)"
  );

  if (!draft) {
    await withRetry(
      () => execute("account.move", "action_post", [[moveId]]),
      "account.move.action_post(entry)"
    );
  }

  const [entry] = await withRetry(
    () => execute("account.move", "read", [[moveId], ["id", "name", "state"]]),
    "account.move.read(entry)"
  );

  return {
    id: entry?.id ?? moveId,
    entryName: entry?.name ?? null,
    state: entry?.state ?? null,
  };
}

/**
 * Returns chart of accounts from account.account.
 */
export async function getAccountList() {
  const ids = await withRetry(
    () => execute("account.account", "search", [[]], { limit: 5000 }),
    "account.account.search"
  );
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const rows = await withRetry(
    () => execute("account.account", "read", [ids, ["id", "code", "name", "account_type", "deprecated"]]),
    "account.account.read"
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Dispatches a farm accounting event to Odoo based on event type.
 * All events are created as drafts by default.
 * Returns { id, name, state } of the created Odoo document.
 *
 * @param {string} eventType - accounting_event_configs.event_type
 * @param {object} mappedPayload - output from an odooFarmMappers.js mapper function
 * @param {{ draft?: boolean }} [opts]
 */
export async function dispatchFarmAccountingEvent(eventType, mappedPayload, { draft = true } = {}) {
  switch (eventType) {
    case "feed_purchase":
    case "medicine_purchase": {
      const result = await createVendorBill(mappedPayload, { draft });
      return { odooMoveId: result.id, odooMoveName: result.billNumber, state: result.state };
    }
    case "meat_sale": {
      const result = await createCustomerInvoice(mappedPayload, { draft });
      return { odooMoveId: result.id, odooMoveName: result.invoiceNumber, state: result.state };
    }
    case "slaughter_conversion":
    case "fcr_fair_value_adjustment":
    case "payroll_expense": {
      const result = await createJournalEntry(mappedPayload, { draft });
      return { odooMoveId: result.id, odooMoveName: result.entryName, state: result.state };
    }
    default:
      throw new Error(`Unknown farm accounting event type: ${eventType}`);
  }
}

/**
 * Fetches customer/vendor invoices from account.move.
 * @param {{ dateFrom?: string, dateTo?: string, state?: string }} filters
 */
export async function getInvoices(filters = {}) {
  validateInvoiceFilters(filters);
  const domain = [["move_type", "in", ["out_invoice", "in_invoice"]]];
  if (filters.dateFrom) domain.push(["invoice_date", ">=", String(filters.dateFrom)]);
  if (filters.dateTo) domain.push(["invoice_date", "<=", String(filters.dateTo)]);
  if (filters.state) domain.push(["state", "=", String(filters.state)]);

  const rows = await withRetry(
    () => execute("account.move", "search_read", [domain], {
      fields: ["id", "name", "state", "move_type", "invoice_date", "partner_id", "amount_total", "currency_id"],
      limit: 500,
      order: "invoice_date desc, id desc",
    }),
    "account.move.search_read(invoices)"
  );
  return Array.isArray(rows) ? rows : [];
}
