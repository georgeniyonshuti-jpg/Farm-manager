import { execute } from "./odooClient.js";
import {
  validateInvoicePayload,
  validateVendorBillPayload,
  validateJournalPayload,
  validateInvoiceFilters,
  withRetry,
} from "./odooHelpers.js";

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

/**
 * Creates and posts customer invoice in account.move (move_type=out_invoice).
 * @param {{ partnerName: string, partnerEmail: string, lines: Array<{productName:string, quantity:number, unitPrice:number}>, date: string }} data
 */
export async function createCustomerInvoice(data) {
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

  const moveId = await withRetry(
    () => execute("account.move", "create", [{
      move_type: "out_invoice",
      partner_id: partnerId,
      invoice_date: String(data.date),
      invoice_line_ids: invoiceLines,
    }]),
    "account.move.create(out_invoice)"
  );

  await withRetry(
    () => execute("account.move", "action_post", [[moveId]]),
    "account.move.action_post(out_invoice)"
  );

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
 * Creates vendor bill in account.move (move_type=in_invoice).
 * @param {{ vendorName: string, lines: Array<{description:string, quantity:number, unitPrice:number, accountCode:string}>, date: string }} data
 */
export async function createVendorBill(data) {
  validateVendorBillPayload(data);
  const partnerId = await findOrCreatePartner({
    name: data.vendorName,
    email: "",
    supplierRank: 1,
  });
  const journalId = await resolvePurchaseJournalId();

  const lines = [];
  for (const line of data.lines) {
    const accountId = await findAccountByCode(line.accountCode);
    lines.push([0, 0, {
      name: String(line.description),
      quantity: Number(line.quantity),
      price_unit: Number(line.unitPrice),
      account_id: accountId,
    }]);
  }

  const moveId = await withRetry(
    () => execute("account.move", "create", [{
      move_type: "in_invoice",
      partner_id: partnerId,
      invoice_date: String(data.date),
      journal_id: journalId,
      invoice_line_ids: lines,
    }]),
    "account.move.create(in_invoice)"
  );

  return { id: moveId };
}

/**
 * Creates and posts direct journal entry in account.move (move_type=entry).
 * @param {{ ref: string, date: string, lines: Array<{accountCode:string, debit:number, credit:number, label:string}> }} data
 */
export async function createJournalEntry(data) {
  validateJournalPayload(data);
  const journalId = await resolveMiscJournalId();

  const lineIds = [];
  for (const line of data.lines) {
    const accountId = await findAccountByCode(line.accountCode);
    lineIds.push([0, 0, {
      name: String(line.label),
      account_id: accountId,
      debit: Number(line.debit),
      credit: Number(line.credit),
    }]);
  }

  const moveId = await withRetry(
    () => execute("account.move", "create", [{
      move_type: "entry",
      date: String(data.date),
      ref: String(data.ref),
      journal_id: journalId,
      line_ids: lineIds,
    }]),
    "account.move.create(entry)"
  );

  await withRetry(
    () => execute("account.move", "action_post", [[moveId]]),
    "account.move.action_post(entry)"
  );

  return { id: moveId };
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
