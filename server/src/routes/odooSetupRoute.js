/**
 * Odoo Setup & Dashboard Routes
 *
 * Gives manager+ users visibility into and control over the Odoo integration:
 *   - Connection test + summary stats
 *   - Farm account status + auto-create
 *   - Partner management (customers, vendors)
 *   - Recent documents (invoices, bills, journal entries)
 *   - Product catalogue
 *
 * Most endpoints require manager or above. GET /status is relaxed for
 * procurement and sales (Command Center visibility); see canViewOdooConnectionStatus.
 */

import express from "express";
import { getAuthenticatedUserId } from "../services/odoo/odooClient.js";
import {
  FARM_ACCOUNT_DEFS,
  checkFarmAccountStatus,
  setupFarmAccounts,
  getOdooSummary,
  getRecentOdooDocuments,
  listOdooPartners,
  listOdooAccounts,
  listOdooProducts,
  createOrFindOdooPartner,
  clearFarmAccountCache,
} from "../services/odoo/odooSetup.js";

const router = express.Router();

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ROLE_RANK = {
  laborer: 1, dispatcher: 1, procurement_officer: 1, sales_coordinator: 1,
  vet: 2, vet_manager: 3, manager: 3, investor: 0, superuser: 99,
};

function isManagerOrAbove(user) {
  return (ROLE_RANK[user?.role] ?? -1) >= (ROLE_RANK["manager"] ?? 999);
}

/** Read-only status for Command Center + existing manager/VT usage (procurement & sales: dashboard only). */
function canViewOdooConnectionStatus(user) {
  if (isManagerOrAbove(user)) return true;
  const r = user?.role;
  return r === "procurement_officer" || r === "sales_coordinator";
}

// ─── Connection & Summary ─────────────────────────────────────────────────────

/**
 * GET /api/odoo-setup/status
 * Tests Odoo connection and returns summary counts.
 */
router.get("/status", async (req, res) => {
  if (!canViewOdooConnectionStatus(req.authUser)) return res.status(403).json({ error: "Not allowed to view Odoo status." });
  try {
    const uid = await getAuthenticatedUserId();
    const summary = await getOdooSummary();
    res.json({ connected: true, uid, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.json({
      connected: false,
      uid: null,
      error: msg,
      customers: 0, vendors: 0, invoices: 0, bills: 0, journalEntries: 0, products: 0, accounts: 0,
    });
  }
});

// ─── Farm accounts ────────────────────────────────────────────────────────────

/**
 * GET /api/odoo-setup/farm-accounts
 * Returns status of each farm account (found/not found in Odoo).
 */
router.get("/farm-accounts", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const statuses = await checkFarmAccountStatus();
    const total = statuses.length;
    const found = statuses.filter(s => s.found).length;
    res.json({ accounts: statuses, total, found, missing: total - found });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not check farm accounts." });
  }
});

/**
 * POST /api/odoo-setup/farm-accounts/setup
 * Creates all missing farm accounts in Odoo. Safe to run multiple times.
 */
router.post("/farm-accounts/setup", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    clearFarmAccountCache();
    const results = await setupFarmAccounts();
    const created = results.filter(r => r.created).length;
    const failed = results.filter(r => r.error).length;
    res.json({ ok: true, results, created, failed });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Account setup failed." });
  }
});

/**
 * GET /api/odoo-setup/farm-accounts/definitions
 * Returns the canonical list of farm account definitions (read-only reference).
 */
router.get("/farm-accounts/definitions", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  res.json({ definitions: FARM_ACCOUNT_DEFS });
});

// ─── Chart of Accounts ────────────────────────────────────────────────────────

/**
 * GET /api/odoo-setup/accounts?search=&limit=
 * Lists all active accounts in Odoo chart of accounts.
 */
router.get("/accounts", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  try {
    const accounts = await listOdooAccounts({ search, limit });
    res.json({ accounts });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not fetch accounts." });
  }
});

// ─── Partners ─────────────────────────────────────────────────────────────────

/**
 * GET /api/odoo-setup/partners?type=customer|vendor|all&search=&limit=
 */
router.get("/partners", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const type = ["customer", "vendor", "all"].includes(String(req.query.type ?? "")) ? String(req.query.type) : "all";
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const partners = await listOdooPartners({ type, search, limit });
    res.json({ partners });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not fetch partners." });
  }
});

/**
 * POST /api/odoo-setup/partners
 * Create or find a partner in Odoo.
 * Body: { name, email?, phone?, isVendor?, isCustomer? }
 */
router.post("/partners", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required." });
  try {
    const result = await createOrFindOdooPartner({
      name,
      email: body.email ? String(body.email).trim() : undefined,
      phone: body.phone ? String(body.phone).trim() : undefined,
      isVendor: Boolean(body.isVendor),
      isCustomer: Boolean(body.isCustomer),
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not create partner." });
  }
});

// ─── Documents (invoices, bills, journal entries) ─────────────────────────────

/**
 * GET /api/odoo-setup/documents?limit=
 * Returns recent accounting documents from Odoo.
 */
router.get("/documents", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  try {
    const documents = await getRecentOdooDocuments({ limit });
    res.json({ documents });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not fetch documents." });
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * GET /api/odoo-setup/products?search=&limit=
 */
router.get("/products", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  try {
    const products = await listOdooProducts({ search, limit });
    res.json({ products });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "Could not fetch products." });
  }
});

export default router;
