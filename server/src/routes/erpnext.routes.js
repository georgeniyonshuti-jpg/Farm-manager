/**
 * ERPNext integration routes — proxy to Frappe REST API from the farm server.
 */

import express from "express";
import * as erp from "../services/erpnext/erpnext.client.js";
import {
  appendErpnextSyncLog,
  listErpnextSyncLog,
  listFailedErpnextSyncLog,
  getErpnextSyncStats,
} from "../services/erpnext/erpnext.syncLog.js";
import {
  getErpnextConfig,
  upsertErpnextConfig,
  listWarehouseMappings,
  upsertWarehouseMapping,
  getUserCompanyId,
} from "../services/erpnext/erpnext.config.js";
import { isClevaFarmSecretConfigured } from "../services/clevafarm/clevafarmSecret.js";
import { getClevaFarmOutboxStats } from "../services/clevafarm/syncOutbox.js";

const router = express.Router();

const ROLE_RANK = {
  laborer: 1,
  dispatcher: 1,
  procurement_officer: 1,
  sales_coordinator: 1,
  vet: 2,
  vet_manager: 3,
  manager: 3,
  investor: 0,
  superuser: 99,
};

function isManagerOrAbove(user) {
  return (ROLE_RANK[user?.role] ?? -1) >= (ROLE_RANK.manager ?? 999);
}

function canViewErpnextConnectionStatus(user) {
  if (isManagerOrAbove(user)) return true;
  const r = user?.role;
  return r === "procurement_officer" || r === "sales_coordinator";
}

function getSessionCookie(req) {
  const header = req.headers["x-erpnext-session"];
  if (header) {
    return header.startsWith("sid=") ? header : `sid=${header}`;
  }
  return null;
}

async function resolveCompany(req) {
  const fromReq = req.query.company || req.body?.company;
  if (fromReq) return fromReq;
  const companyId = await getUserCompanyId(req.authUser?.id);
  if (companyId) {
    const cfg = await getErpnextConfig(companyId);
    if (cfg?.erpnextCompany) return cfg.erpnextCompany;
  }
  return erp.getDefaultCompany() || null;
}

async function logSync(req, result) {
  const companyId = await getUserCompanyId(req.authUser?.id);
  await appendErpnextSyncLog({
    companyId,
    status: result.status,
    eventType: result.eventType,
    entityType: req.body?.sourceTable || result.entityType || null,
    sourceTable: req.body?.sourceTable || null,
    sourceId: req.body?.sourceId || null,
    erpnextRef: result.erpnextRef || null,
    erpnextDoctype: result.erpnextDoctype || null,
    error: result.error || null,
    payload: req.body?.payload || req.body || null,
  });
}

async function handleCreate(res, eventType, fn, req, erpnextDoctype = null) {
  try {
    const doc = await fn();
    const ref = doc?.name || null;
    await logSync(req, { status: "success", eventType, erpnextRef: ref, erpnextDoctype });
    res.json({ success: true, name: ref, entry: doc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync(req, { status: "failed", eventType, erpnextDoctype, error: msg });
    res.status(500).json({ error: msg });
  }
}

router.post("/session/login", async (req, res) => {
  const { usr, pwd } = req.body ?? {};
  if (!usr || !pwd) return res.status(400).json({ error: "usr and pwd are required." });
  try {
    const result = await erp.loginSession(usr, pwd);
    if (!result.ok) {
      return res.status(401).json({ error: result.message || "ERPNext login failed." });
    }
    if (result.setCookie) res.setHeader("Set-Cookie", result.setCookie);
    res.json({
      message: result.message,
      sid: result.sid,
      fullName: result.fullName,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/session/logout", async (req, res) => {
  const sessionCookie = getSessionCookie(req);
  await erp.logoutSession(sessionCookie);
  res.json({ ok: true });
});

router.post("/auth/token", async (req, res) => {
  const { code, redirect_uri: redirectUri } = req.body ?? {};
  if (!code || !redirectUri) {
    return res.status(400).json({ error: "code and redirect_uri are required." });
  }
  try {
    const token = await erp.exchangeOAuthToken({ code, redirectUri });
    res.json(token);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/health", async (req, res) => {
  if (!canViewErpnextConnectionStatus(req.authUser)) {
    return res.status(403).json({ error: "Not allowed." });
  }
  const sessionCookie = getSessionCookie(req);
  const companyId = await getUserCompanyId(req.authUser?.id);
  try {
    const ping = await erp.pingHealth(sessionCookie);
    const stats = await getErpnextSyncStats(companyId);
    const outbox = await getClevaFarmOutboxStats();
    res.json({
      ok: true,
      responseMs: ping.responseMs,
      authMode: sessionCookie ? "session" : erp.hasApiKeyCredentials() ? "api_key" : "none",
      clevafarm_secret_configured: isClevaFarmSecretConfigured(),
      outbox_pending: outbox.pending,
      outbox_failed: outbox.failed,
      last_outbound_success_at: outbox.lastOutboundSuccessAt,
      ...stats,
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      authMode: sessionCookie ? "session" : erp.hasApiKeyCredentials() ? "api_key" : "none",
    });
  }
});

router.get("/config", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const companyId = await getUserCompanyId(req.authUser?.id);
  if (!companyId) return res.status(400).json({ error: "User has no company." });
  try {
    const config = await getErpnextConfig(companyId);
    const warehouseMappings = await listWarehouseMappings(companyId);
    res.json({ config, warehouseMappings });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.put("/config", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const companyId = await getUserCompanyId(req.authUser?.id);
  if (!companyId) return res.status(400).json({ error: "User has no company." });
  try {
    const config = await upsertErpnextConfig(companyId, req.body ?? {});
    res.json({ config });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.put("/warehouse-mapping", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const companyId = await getUserCompanyId(req.authUser?.id);
  const { barnName, erpnextWarehouse } = req.body ?? {};
  if (!companyId || !barnName || !erpnextWarehouse) {
    return res.status(400).json({ error: "barnName and erpnextWarehouse are required." });
  }
  try {
    const mapping = await upsertWarehouseMapping(companyId, barnName, erpnextWarehouse);
    res.json({ mapping });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/webhooks/status", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  const expected = [
    { doctype: "Sales Invoice", event: "on_submit", path: "/api/webhooks/erpnext/sales-invoice" },
    { doctype: "Purchase Invoice", event: "on_submit", path: "/api/webhooks/erpnext/purchase-invoice" },
    { doctype: "Payment Entry", event: "on_submit", path: "/api/webhooks/erpnext/payment-entry" },
    { doctype: "Loan Application", event: "on_change", path: "/api/webhooks/erpnext/loan-application" },
  ];
  try {
    const registered = await erp.getWebhooks(sessionCookie).catch(() => []);
    const base = process.env.RENDER_EXTERNAL_URL || process.env.FRONTEND_URL?.replace("farm.", "farmapi.") || "";
    const withStatus = expected.map((exp) => {
      const match = (Array.isArray(registered) ? registered : []).find(
        (w) =>
          w.webhook_doctype === exp.doctype &&
          w.webhook_docevent === exp.event &&
          String(w.request_url || "").includes(exp.path.split("/").pop())
      );
      return { ...exp, url: `${base}${exp.path}`, active: Boolean(match?.enabled), name: match?.name || null };
    });
    res.json({ webhooks: withStatus });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/webhooks/test", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { type } = req.body ?? {};
  const secret = process.env.ERPNEXT_WEBHOOK_SECRET || process.env.CLEVAFARM_API_SECRET;
  if (!secret) return res.status(400).json({ error: "ERPNEXT_WEBHOOK_SECRET not configured on server." });
  const samples = {
    "sales-invoice": { name: "TEST-SINV", customer: "Test Customer", grand_total: 1000, posting_date: new Date().toISOString().slice(0, 10) },
    "purchase-invoice": { name: "TEST-PINV", supplier: "Test Supplier", grand_total: 500 },
    "payment-entry": { name: "TEST-PE", party: "Test Customer", paid_amount: 100, posting_date: new Date().toISOString().slice(0, 10) },
    "loan-application": { name: "TEST-LA", status: "Approved", applicant: "Test", loan_amount: 50000 },
  };
  const payload = samples[type];
  if (!payload) return res.status(400).json({ error: "Invalid webhook type." });
  res.json({ received: true, test: true, payload });
});

router.get("/status", async (req, res) => {
  if (!canViewErpnextConnectionStatus(req.authUser)) {
    return res.status(403).json({ error: "Not allowed to view ERPNext status." });
  }
  const sessionCookie = getSessionCookie(req);
  try {
    const conn = await erp.testConnection(sessionCookie);
    const companies = await erp.getCompanyList(sessionCookie);
    const company = (await resolveCompany(req)) || companies[0]?.name;
    const [customers, loans, accounts] = await Promise.all([
      company ? erp.getCustomers(company, sessionCookie).catch(() => []) : Promise.resolve([]),
      company ? erp.getLoans(company, sessionCookie).catch(() => []) : Promise.resolve([]),
      company ? erp.getAccounts(company, sessionCookie).catch(() => []) : Promise.resolve([]),
    ]);
    res.json({
      connected: true,
      user: conn.user,
      company,
      companies: companies.length,
      customers: Array.isArray(customers) ? customers.length : 0,
      loans: Array.isArray(loans) ? loans.length : 0,
      accounts: Array.isArray(accounts) ? accounts.length : 0,
      erpnextUrl: erp.getErpnextBaseUrl(),
      authMode: sessionCookie ? "session" : erp.hasApiKeyCredentials() ? "api_key" : "none",
    });
  } catch (e) {
    res.status(200).json({
      connected: false,
      error: e instanceof Error ? e.message : String(e),
      erpnextUrl: erp.getErpnextBaseUrl(),
      authMode: sessionCookie ? "session" : erp.hasApiKeyCredentials() ? "api_key" : "none",
    });
  }
});

router.get("/companies", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    res.json(await erp.getCompanyList(getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/accounts", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    res.json(await erp.getAccounts(company, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/cost-centers", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    res.json(await erp.getCostCenters(company, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/warehouses", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    res.json(await erp.getWarehouses(company, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/journal-entry", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  await handleCreate(
    res,
    "journal_entry",
    () => erp.createJournalEntry(req.body ?? {}, sessionCookie),
    req,
    "Journal Entry"
  );
});

router.get("/sync-log", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const companyId = await getUserCompanyId(req.authUser?.id);
  const entries = await listErpnextSyncLog(limit, companyId);
  res.json({ entries });
});

router.get("/sync-log/failed", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const companyId = await getUserCompanyId(req.authUser?.id);
  const entries = await listFailedErpnextSyncLog(companyId);
  res.json({ entries });
});

router.post("/sync-log/retry-failed", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  const companyId = await getUserCompanyId(req.authUser?.id);
  const failed = await listFailedErpnextSyncLog(companyId);
  const retried = [];
  for (const entry of failed.slice(0, 10)) {
    if (!entry.payload) continue;
    try {
      let doc;
      if (entry.eventType === "purchase_invoice") {
        doc = await erp.createPurchaseInvoice(entry.payload, sessionCookie);
      } else if (entry.eventType === "sales_invoice") {
        doc = await erp.createSalesInvoice(entry.payload, sessionCookie);
      } else if (entry.eventType === "journal_entry") {
        doc = await erp.createJournalEntry(entry.payload, sessionCookie);
      } else {
        continue;
      }
      await logSync(req, {
        status: "success",
        eventType: entry.eventType,
        erpnextRef: doc?.name,
        erpnextDoctype: entry.erpnextDoctype,
      });
      retried.push({ id: entry.id, status: "success", ref: doc?.name });
    } catch (e) {
      retried.push({ id: entry.id, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  res.json({ retried });
});

router.get("/journal-entries", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    res.json(await erp.getRecentJournalEntries(company, limit, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/customers", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    res.json(await erp.getCustomers(await resolveCompany(req), getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/customers", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    const customer = await erp.createCustomer(req.body ?? {}, getSessionCookie(req));
    res.json({ success: true, customer });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/purchase-invoice", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  await handleCreate(
    res,
    "purchase_invoice",
    () => erp.createPurchaseInvoice(req.body ?? {}, sessionCookie),
    req,
    "Purchase Invoice"
  );
});

router.post("/sales-invoice", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  await handleCreate(
    res,
    "sales_invoice",
    () => erp.createSalesInvoice(req.body ?? {}, sessionCookie),
    req,
    "Sales Invoice"
  );
});

router.get("/payroll", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { fromDate, toDate } = req.query;
  const company = await resolveCompany(req);
  if (!company || !fromDate || !toDate) {
    return res.status(400).json({ error: "company, fromDate, and toDate are required." });
  }
  try {
    res.json(await erp.getPayrollEntries(company, String(fromDate), String(toDate), getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/stock-entry", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  try {
    const entry = await erp.createStockEntry(req.body ?? {}, sessionCookie);
    await logSync(req, { status: "success", eventType: "stock_entry", erpnextRef: entry?.name, erpnextDoctype: "Stock Entry" });
    res.json({ success: true, name: entry?.name, entry });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync(req, { status: "failed", eventType: "stock_entry", error: msg });
    res.status(500).json({ error: msg });
  }
});

router.get("/items", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  try {
    res.json(await erp.getItemList(getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/loans", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    res.json(await erp.getLoans(company, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/loans", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const sessionCookie = getSessionCookie(req);
  await handleCreate(
    res,
    "loan_application",
    () => erp.createLoanApplication(req.body ?? {}, sessionCookie),
    req,
    "Loan Application"
  );
});

router.get("/loan-applications", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const company = await resolveCompany(req);
  if (!company) return res.status(400).json({ error: "company is required." });
  try {
    res.json(await erp.getLoanApplications(company, getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/reports/trial-balance", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { fromDate, toDate } = req.query;
  const company = await resolveCompany(req);
  if (!company || !fromDate || !toDate) {
    return res.status(400).json({ error: "company, fromDate, and toDate are required." });
  }
  try {
    res.json(await erp.getTrialBalance(company, String(fromDate), String(toDate), getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/reports/pnl", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { fromDate, toDate } = req.query;
  const company = await resolveCompany(req);
  if (!company || !fromDate || !toDate) {
    return res.status(400).json({ error: "company, fromDate, and toDate are required." });
  }
  try {
    res.json(await erp.getProfitAndLoss(company, String(fromDate), String(toDate), getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/reports/balance-sheet", async (req, res) => {
  if (!isManagerOrAbove(req.authUser)) return res.status(403).json({ error: "Manager or above required." });
  const { fromDate, toDate } = req.query;
  const company = await resolveCompany(req);
  if (!company || !fromDate || !toDate) {
    return res.status(400).json({ error: "company, fromDate, and toDate are required." });
  }
  try {
    res.json(await erp.getBalanceSheet(company, String(fromDate), String(toDate), getSessionCookie(req)));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
