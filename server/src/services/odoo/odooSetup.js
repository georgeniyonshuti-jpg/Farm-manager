/**
 * Odoo Farm Account Setup
 *
 * Defines the farm-specific accounts needed in Odoo's chart of accounts
 * and provides helpers to create or locate them.
 *
 * Uses a two-step resolution:
 *   1. Search by code — if found, use it
 *   2. Search by name — if found, record its code
 *   3. If neither found — create it
 *
 * Results are cached in memory for the process lifetime to avoid
 * repeated API calls. Cache is cleared on demand via clearFarmAccountCache().
 */

import { execute } from "./odooClient.js";
import { withRetry } from "./odooHelpers.js";

// ─── Farm account definitions ─────────────────────────────────────────────────

/**
 * The canonical farm accounts needed for Clevafarm transactions.
 * These map to IAS 41 agriculture standards.
 * Code range 1000–6999 is used; search-by-name is tried before creation.
 *
 * @type {Array<{key: string, code: string, name: string, accountType: string, groupLabel: string}>}
 */
export const FARM_ACCOUNT_DEFS = [
  // ── Assets ──
  {
    key: "bio_assets",
    code: "101001",
    name: "Biological Assets — Live Birds",
    accountType: "asset_current",
    groupLabel: "Assets",
    description: "IAS 41: live birds at fair value less costs to sell",
  },
  {
    key: "meat_inventory",
    code: "101002",
    name: "Meat Stock — Processed Inventory",
    accountType: "asset_current",
    groupLabel: "Assets",
    description: "Carcass/processed meat awaiting sale",
  },
  {
    key: "feed_inventory",
    code: "101003",
    name: "Feed Inventory",
    accountType: "asset_current",
    groupLabel: "Assets",
    description: "Feed stock on hand (mash, pellets, etc.)",
  },
  {
    key: "medicine_inventory",
    code: "101004",
    name: "Medicine & Vet Supplies",
    accountType: "asset_current",
    groupLabel: "Assets",
    description: "Veterinary drugs and supplies in stock",
  },

  // ── Revenue / Gains ──
  {
    key: "meat_sales_revenue",
    code: "401001",
    name: "Revenue — Meat & Poultry Sales",
    accountType: "income",
    groupLabel: "Revenue",
    description: "Income from selling birds or processed meat",
  },
  {
    key: "bio_asset_gain",
    code: "401002",
    name: "Gain on Biological Asset Revaluation",
    accountType: "income",
    groupLabel: "Revenue",
    description: "IAS 41 fair-value increase on live birds (FCR weigh-in)",
  },
  {
    key: "harvest_gain",
    code: "401003",
    name: "Gain on Harvest (IAS 41)",
    accountType: "income",
    groupLabel: "Revenue",
    description: "Fair value of meat stock exceeds carrying value at slaughter",
  },

  // ── Expenses ──
  {
    key: "feed_expense",
    code: "601001",
    name: "Feed Purchases Expense",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "Cost of feed purchased for the flock",
  },
  {
    key: "medicine_expense",
    code: "601002",
    name: "Veterinary & Medicine Expense",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "Cost of drugs, vaccines, and vet services",
  },
  {
    key: "wage_expense",
    code: "601003",
    name: "Field Labor Wages",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "Wages paid to coop laborers",
  },
  {
    key: "mortality_loss",
    code: "601004",
    name: "Impairment Loss — Bird Mortality",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "IAS 41 impairment when birds die (fair value derecognised)",
  },
  {
    key: "harvest_loss",
    code: "601005",
    name: "Loss on Harvest (IAS 41)",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "Carrying value of live birds exceeds meat fair value at slaughter",
  },
  {
    key: "bio_asset_loss",
    code: "601006",
    name: "Loss on Biological Asset Revaluation",
    accountType: "expense",
    groupLabel: "Expenses",
    description: "IAS 41 fair-value decrease on live birds",
  },

  // ── Liabilities ──
  {
    key: "wages_payable",
    code: "201001",
    name: "Wages Payable — Field Labor",
    accountType: "liability_current",
    groupLabel: "Liabilities",
    description: "Accrued wages not yet paid to coop laborers",
  },
];

/**
 * Lookup: account key → Odoo account ID (in-memory cache for process lifetime).
 * Cleared by clearFarmAccountCache().
 * @type {Map<string, number>}
 */
const _accountIdCache = new Map();

/**
 * Clear the account ID cache (e.g. after setup changes).
 */
export function clearFarmAccountCache() {
  _accountIdCache.clear();
}

// ─── Account resolution helpers ───────────────────────────────────────────────

/**
 * Resolve an Odoo account ID by code. Returns null if not found.
 * @param {string} code
 * @returns {Promise<number|null>}
 */
async function findAccountIdByCode(code) {
  const ids = await withRetry(
    () => execute("account.account", "search", [[["code", "=", String(code).trim()]]], { limit: 1 }),
    `account.account.search(code:${code})`
  );
  return Array.isArray(ids) && ids.length ? ids[0] : null;
}

/**
 * Resolve an Odoo account ID by name (partial match). Returns null if not found.
 * @param {string} name
 * @returns {Promise<number|null>}
 */
async function findAccountIdByName(name) {
  const ids = await withRetry(
    () => execute("account.account", "search", [[["name", "ilike", String(name).trim()]]], { limit: 1 }),
    `account.account.search(name:${name})`
  );
  return Array.isArray(ids) && ids.length ? ids[0] : null;
}

/**
 * Create a new Odoo account. Returns the new ID.
 * @param {{ code: string, name: string, accountType: string }} def
 * @returns {Promise<number>}
 */
async function createOdooAccount({ code, name, accountType }) {
  return withRetry(
    () => execute("account.account", "create", [{
      code: String(code),
      name: String(name),
      account_type: String(accountType),
    }]),
    `account.account.create(${code})`
  );
}

/**
 * Find OR create a single farm account in Odoo.
 * Tries code first, then name, then creates.
 * @param {{ key: string, code: string, name: string, accountType: string }} def
 * @returns {Promise<{ id: number, code: string, name: string, created: boolean }>}
 */
export async function resolveOrCreateFarmAccount(def) {
  // 1. Try by code
  let id = await findAccountIdByCode(def.code);
  if (id) return { id, code: def.code, name: def.name, created: false };

  // 2. Try by name
  id = await findAccountIdByName(def.name);
  if (id) {
    // Read actual code from Odoo
    const rows = await withRetry(
      () => execute("account.account", "read", [[id], ["code", "name"]]),
      "account.account.read(found-by-name)"
    );
    const actual = rows?.[0] ?? {};
    return { id, code: actual.code ?? def.code, name: actual.name ?? def.name, created: false };
  }

  // 3. Create
  id = await createOdooAccount(def);
  return { id, code: def.code, name: def.name, created: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the Odoo account ID for a farm account key.
 * Uses cache; looks up by code if not cached.
 * Returns null if the account doesn't exist and lookupOnly=true.
 *
 * @param {string} key - one of FARM_ACCOUNT_DEFS[].key
 * @param {{ lookupOnly?: boolean }} [opts]
 * @returns {Promise<number|null>}
 */
export async function getFarmAccountId(key, { lookupOnly = false } = {}) {
  if (_accountIdCache.has(key)) return _accountIdCache.get(key) ?? null;

  const def = FARM_ACCOUNT_DEFS.find(d => d.key === key);
  if (!def) return null;

  const id = await findAccountIdByCode(def.code);
  if (id) {
    _accountIdCache.set(key, id);
    return id;
  }

  if (lookupOnly) return null;

  // Fall back to name lookup only (don't create automatically)
  const idByName = await findAccountIdByName(def.name);
  if (idByName) {
    _accountIdCache.set(key, idByName);
    return idByName;
  }

  return null;
}

/**
 * Set up ALL farm accounts in Odoo.
 * Finds existing ones (by code then name) or creates missing ones.
 * Returns a status report.
 *
 * @returns {Promise<Array<{ key: string, code: string, name: string, id: number, created: boolean, error?: string }>>}
 */
export async function setupFarmAccounts() {
  const results = [];
  for (const def of FARM_ACCOUNT_DEFS) {
    try {
      const result = await resolveOrCreateFarmAccount(def);
      _accountIdCache.set(def.key, result.id);
      results.push({ key: def.key, code: result.code, name: result.name, id: result.id, created: result.created, error: null });
    } catch (err) {
      results.push({
        key: def.key,
        code: def.code,
        name: def.name,
        id: null,
        created: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/**
 * Check status of all farm accounts without creating missing ones.
 * @returns {Promise<Array<{ key: string, code: string, name: string, groupLabel: string, description: string, id: number|null, found: boolean }>>}
 */
export async function checkFarmAccountStatus() {
  const results = [];
  for (const def of FARM_ACCOUNT_DEFS) {
    let id = _accountIdCache.get(def.key) ?? null;
    if (!id) {
      try {
        id = await getFarmAccountId(def.key, { lookupOnly: true });
      } catch {
        id = null;
      }
    }
    results.push({
      key: def.key,
      code: def.code,
      name: def.name,
      groupLabel: def.groupLabel,
      description: def.description,
      accountType: def.accountType,
      id,
      found: id != null,
    });
  }
  return results;
}

/**
 * Get a summary of key Odoo objects for the dashboard.
 * @returns {Promise<{ customers: number, vendors: number, invoices: number, bills: number, journalEntries: number, products: number, accounts: number }>}
 */
export async function getOdooSummary() {
  const counts = await Promise.allSettled([
    withRetry(() => execute("res.partner", "search_count", [[["customer_rank", ">", 0]]]), "count.customers"),
    withRetry(() => execute("res.partner", "search_count", [[["supplier_rank", ">", 0]]]), "count.vendors"),
    withRetry(() => execute("account.move", "search_count", [[["move_type", "=", "out_invoice"]]]), "count.invoices"),
    withRetry(() => execute("account.move", "search_count", [[["move_type", "=", "in_invoice"]]]), "count.bills"),
    withRetry(() => execute("account.move", "search_count", [[["move_type", "=", "entry"]]]), "count.entries"),
    withRetry(() => execute("product.product", "search_count", [[[]]]), "count.products"),
    withRetry(() => execute("account.account", "search_count", [[["deprecated", "=", false]]]), "count.accounts"),
  ]);

  const [customers, vendors, invoices, bills, journalEntries, products, accounts] = counts.map(r =>
    r.status === "fulfilled" ? Number(r.value ?? 0) : 0
  );

  return { customers, vendors, invoices, bills, journalEntries, products, accounts };
}

/**
 * List recent Odoo documents (invoices + bills + journal entries).
 * @param {{ limit?: number }} opts
 */
export async function getRecentOdooDocuments({ limit = 30 } = {}) {
  return withRetry(
    () => execute("account.move", "search_read", [
      [["move_type", "in", ["out_invoice", "in_invoice", "entry"]]],
    ], {
      fields: ["id", "name", "move_type", "state", "invoice_date", "date", "partner_id", "amount_total", "ref"],
      limit,
      order: "id desc",
    }),
    "account.move.search_read(recent)"
  );
}

/**
 * List Odoo partners (customers or vendors).
 * @param {{ type?: 'customer'|'vendor'|'all', search?: string, limit?: number }} opts
 */
export async function listOdooPartners({ type = "all", search = "", limit = 50 } = {}) {
  const domain = [];
  if (type === "customer") domain.push(["customer_rank", ">", 0]);
  else if (type === "vendor") domain.push(["supplier_rank", ">", 0]);
  else domain.push("|", ["customer_rank", ">", 0], ["supplier_rank", ">", 0]);
  if (search) domain.push(["name", "ilike", String(search).trim()]);

  return withRetry(
    () => execute("res.partner", "search_read", [domain], {
      fields: ["id", "name", "email", "phone", "customer_rank", "supplier_rank"],
      limit,
      order: "name asc",
    }),
    "res.partner.search_read"
  );
}

/**
 * List Odoo accounts (chart of accounts), optionally filtered.
 * @param {{ search?: string, limit?: number }} opts
 */
export async function listOdooAccounts({ search = "", limit = 200 } = {}) {
  const domain = [["deprecated", "=", false]];
  if (search) domain.push("|", ["code", "ilike", search], ["name", "ilike", search]);

  return withRetry(
    () => execute("account.account", "search_read", [domain], {
      fields: ["id", "code", "name", "account_type"],
      limit,
      order: "code asc",
    }),
    "account.account.search_read"
  );
}

/**
 * List Odoo products.
 * @param {{ search?: string, limit?: number }} opts
 */
export async function listOdooProducts({ search = "", limit = 100 } = {}) {
  const domain = [["active", "=", true]];
  if (search) domain.push(["name", "ilike", search]);

  return withRetry(
    () => execute("product.product", "search_read", [domain], {
      fields: ["id", "name", "type", "list_price", "standard_price"],
      limit,
      order: "name asc",
    }),
    "product.product.search_read"
  );
}

/**
 * Create or find a partner in Odoo.
 * @param {{ name: string, email?: string, isVendor?: boolean, isCustomer?: boolean, phone?: string }} data
 */
export async function createOrFindOdooPartner({ name, email, isVendor = false, isCustomer = false, phone }) {
  // Try by email
  if (email) {
    const byEmail = await withRetry(
      () => execute("res.partner", "search", [[["email", "=", email.trim()]]], { limit: 1 }),
      "res.partner.search(email)"
    ).catch(() => []);
    if (byEmail?.length) return { id: byEmail[0], created: false };
  }
  // Try by name
  const byName = await withRetry(
    () => execute("res.partner", "search", [[["name", "ilike", name.trim()]]], { limit: 1 }),
    "res.partner.search(name)"
  ).catch(() => []);
  if (byName?.length) {
    // Update ranks
    const updates = {};
    if (isVendor) updates.supplier_rank = 1;
    if (isCustomer) updates.customer_rank = 1;
    if (Object.keys(updates).length) {
      await withRetry(() => execute("res.partner", "write", [[byName[0]], updates]), "res.partner.write").catch(() => {});
    }
    return { id: byName[0], created: false };
  }
  // Create
  const id = await withRetry(
    () => execute("res.partner", "create", [{
      name: name.trim(),
      email: email?.trim() || false,
      phone: phone?.trim() || false,
      supplier_rank: isVendor ? 1 : 0,
      customer_rank: isCustomer ? 1 : 0,
    }]),
    "res.partner.create"
  );
  return { id, created: true };
}
