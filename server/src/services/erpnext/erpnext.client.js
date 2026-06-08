/**
 * ERPNext (Frappe) REST API client.
 * Auth: API key (server-to-server) or session cookie passthrough (user-initiated).
 */

const ERPNEXT_BASE_URL = (process.env.ERPNEXT_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const ERPNEXT_API_KEY = process.env.ERPNEXT_API_KEY || "";
const ERPNEXT_API_SECRET = process.env.ERPNEXT_API_SECRET || "";

function ensureCredentials() {
  const missing = [];
  if (!ERPNEXT_API_KEY) missing.push("ERPNEXT_API_KEY");
  if (!ERPNEXT_API_SECRET) missing.push("ERPNEXT_API_SECRET");
  if (missing.length) {
    throw new Error(`Missing ERPNext credentials: ${missing.join(", ")}`);
  }
}

function getApiKeyHeader() {
  ensureCredentials();
  return `token ${ERPNEXT_API_KEY}:${ERPNEXT_API_SECRET}`;
}

function buildAuthHeaders(sessionCookie) {
  if (sessionCookie) {
    return { Cookie: sessionCookie };
  }
  return { Authorization: getApiKeyHeader() };
}

async function erpnextFetch(path, options = {}, sessionCookie = null) {
  const url = `${ERPNEXT_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...buildAuthHeaders(sessionCookie),
      ...options.headers,
    },
    credentials: sessionCookie ? "include" : "omit",
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      payload?.message ||
      payload?.exc ||
      payload?._server_messages ||
      `ERPNext error ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  if (payload.data !== undefined) return payload.data;
  return payload.message ?? payload;
}

function resourceFilters(filters) {
  return encodeURIComponent(JSON.stringify(filters));
}

export async function loginSession(usr, pwd) {
  const url = `${ERPNEXT_BASE_URL}/api/method/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ usr, pwd }),
  });
  const payload = await res.json().catch(() => ({}));
  const setCookie = res.headers.get("set-cookie") || "";
  const sidMatch = setCookie.match(/sid=([^;]+)/);
  return {
    ok: res.ok,
    message: payload.message,
    sid: sidMatch?.[1] || null,
    setCookie,
    fullName: payload.full_name,
  };
}

export async function logoutSession(sessionCookie) {
  if (!sessionCookie) return;
  await fetch(`${ERPNEXT_BASE_URL}/api/method/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  }).catch(() => {});
}

export async function exchangeOAuthToken({ code, redirectUri, clientId, clientSecret }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId || process.env.ERPNEXT_OAUTH_CLIENT_ID || "clevafarm",
    client_secret: clientSecret || process.env.ERPNEXT_OAUTH_CLIENT_SECRET || "",
  });
  const res = await fetch(`${ERPNEXT_BASE_URL}/api/method/frappe.integrations.oauth2.get_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || payload?.error || "OAuth token exchange failed");
  }
  return payload.message ?? payload;
}

export async function pingHealth(sessionCookie = null) {
  const start = Date.now();
  await erpnextFetch("/api/method/frappe.auth.get_logged_user", {}, sessionCookie);
  return { responseMs: Date.now() - start };
}

export async function testConnection(sessionCookie = null) {
  const user = await erpnextFetch("/api/method/frappe.auth.get_logged_user", {}, sessionCookie);
  return { connected: true, user };
}

export async function getAccounts(company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Account?filters=${resourceFilters([
      ["company", "=", company],
      ["is_group", "=", 0],
    ])}&fields=${encodeURIComponent(JSON.stringify(["name", "account_name", "account_type", "parent_account"]))}&limit_page_length=200`,
    {},
    sessionCookie
  );
}

export async function createJournalEntry({ company, date, narration, accounts, farmEntityId }, sessionCookie = null) {
  const body = {
    company,
    posting_date: date,
    voucher_type: "Journal Entry",
    user_remark: narration,
    accounts,
  };
  if (farmEntityId) body.custom_farm_entity_id = farmEntityId;
  return erpnextFetch("/api/resource/Journal Entry", { method: "POST", body: JSON.stringify(body) }, sessionCookie);
}

export async function createCustomer({ name, customerGroup = "Individual", territory = "Rwanda" }, sessionCookie = null) {
  return erpnextFetch(
    "/api/resource/Customer",
    {
      method: "POST",
      body: JSON.stringify({
        customer_name: name,
        customer_group: customerGroup,
        territory,
      }),
    },
    sessionCookie
  );
}

export async function getCustomers(_company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Customer?fields=${encodeURIComponent(JSON.stringify(["name", "customer_name", "customer_group"]))}&limit_page_length=100`,
    {},
    sessionCookie
  );
}

export async function createSupplier({ name, supplierGroup = "Services" }, sessionCookie = null) {
  return erpnextFetch(
    "/api/resource/Supplier",
    {
      method: "POST",
      body: JSON.stringify({
        supplier_name: name,
        supplier_group: supplierGroup,
      }),
    },
    sessionCookie
  );
}

export async function createPurchaseInvoice(
  { company, supplier, date, items, costCenter, farmEntityId },
  sessionCookie = null
) {
  const body = {
    company,
    supplier,
    posting_date: date,
    items: items.map((item) => ({
      ...item,
      cost_center: item.cost_center || costCenter,
    })),
  };
  if (farmEntityId) body.custom_farm_entity_id = farmEntityId;
  return erpnextFetch("/api/resource/Purchase Invoice", { method: "POST", body: JSON.stringify(body) }, sessionCookie);
}

export async function createSalesInvoice(
  { company, customer, date, items, costCenter, farmEntityId },
  sessionCookie = null
) {
  const body = {
    company,
    customer,
    posting_date: date,
    items: items.map((item) => ({
      ...item,
      cost_center: item.cost_center || costCenter,
    })),
  };
  if (farmEntityId) body.custom_farm_entity_id = farmEntityId;
  return erpnextFetch("/api/resource/Sales Invoice", { method: "POST", body: JSON.stringify(body) }, sessionCookie);
}

export async function getPayrollEntries(company, fromDate, toDate, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Payroll Entry?filters=${resourceFilters([
      ["company", "=", company],
      ["posting_date", "between", [fromDate, toDate]],
    ])}&fields=${encodeURIComponent(JSON.stringify(["name", "posting_date", "total_amount_paid", "payroll_frequency"]))}&limit_page_length=50`,
    {},
    sessionCookie
  );
}

export async function createStockEntry({ company, items, type = "Material Receipt", date, farmEntityId }, sessionCookie = null) {
  const body = {
    company,
    stock_entry_type: type,
    posting_date: date,
    items,
  };
  if (farmEntityId) body.custom_farm_entity_id = farmEntityId;
  return erpnextFetch("/api/resource/Stock Entry", { method: "POST", body: JSON.stringify(body) }, sessionCookie);
}

export async function getItemList(sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Item?filters=${resourceFilters([["disabled", "=", 0]])}&fields=${encodeURIComponent(JSON.stringify(["name", "item_name", "item_group", "stock_uom"]))}&limit_page_length=200`,
    {},
    sessionCookie
  );
}

export async function getWarehouses(company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Warehouse?filters=${resourceFilters([["company", "=", company]])}&fields=${encodeURIComponent(JSON.stringify(["name", "warehouse_name"]))}&limit_page_length=100`,
    {},
    sessionCookie
  );
}

export async function getWebhooks(sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Webhook?fields=${encodeURIComponent(JSON.stringify(["name", "webhook_doctype", "webhook_docevent", "request_url", "enabled"]))}&limit_page_length=50`,
    {},
    sessionCookie
  );
}

export async function getLoanApplications(company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Loan Application?filters=${resourceFilters([["company", "=", company]])}&fields=${encodeURIComponent(JSON.stringify(["name", "applicant", "loan_amount", "status", "posting_date"]))}&limit_page_length=50`,
    {},
    sessionCookie
  );
}

export async function createLoanApplication(
  { company, applicant, loanType, amount, repaymentPeriods },
  sessionCookie = null
) {
  return erpnextFetch(
    "/api/resource/Loan Application",
    {
      method: "POST",
      body: JSON.stringify({
        company,
        applicant,
        applicant_type: "Customer",
        loan_product: loanType,
        loan_amount: amount,
        repayment_periods: repaymentPeriods,
      }),
    },
    sessionCookie
  );
}

export async function getLoans(company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Loan?filters=${resourceFilters([["company", "=", company]])}&fields=${encodeURIComponent(JSON.stringify(["name", "applicant", "loan_amount", "status", "disbursement_date", "total_payment", "total_principal_paid"]))}&limit_page_length=100`,
    {},
    sessionCookie
  );
}

async function runQueryReport(reportName, filters, sessionCookie = null) {
  return erpnextFetch(
    "/api/method/frappe.desk.query_report.run",
    {
      method: "POST",
      body: JSON.stringify({ report_name: reportName, filters }),
    },
    sessionCookie
  );
}

export async function getTrialBalance(company, fromDate, toDate, sessionCookie = null) {
  return runQueryReport("Trial Balance", { company, from_date: fromDate, to_date: toDate }, sessionCookie);
}

export async function getProfitAndLoss(company, fromDate, toDate, sessionCookie = null) {
  return runQueryReport(
    "Profit and Loss Statement",
    { company, from_date: fromDate, to_date: toDate },
    sessionCookie
  );
}

export async function getBalanceSheet(company, fromDate, toDate, sessionCookie = null) {
  return runQueryReport("Balance Sheet", { company, from_date: fromDate, to_date: toDate }, sessionCookie);
}

export async function getCompanyList(sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Company?fields=${encodeURIComponent(JSON.stringify(["name", "company_name", "default_currency", "country"]))}&limit_page_length=50`,
    {},
    sessionCookie
  );
}

export async function getCostCenters(company, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Cost Center?filters=${resourceFilters([
      ["company", "=", company],
      ["is_group", "=", 0],
    ])}&fields=${encodeURIComponent(JSON.stringify(["name", "cost_center_name"]))}&limit_page_length=100`,
    {},
    sessionCookie
  );
}

export async function getRecentJournalEntries(company, limit = 20, sessionCookie = null) {
  return erpnextFetch(
    `/api/resource/Journal Entry?filters=${resourceFilters([["company", "=", company]])}&fields=${encodeURIComponent(JSON.stringify(["name", "posting_date", "user_remark", "total_debit", "docstatus"]))}&order_by=creation desc&limit_page_length=${limit}`,
    {},
    sessionCookie
  );
}

export function getDefaultCompany() {
  return process.env.ERPNEXT_COMPANY || null;
}

export function getErpnextBaseUrl() {
  return ERPNEXT_BASE_URL;
}

export function hasApiKeyCredentials() {
  return Boolean(ERPNEXT_API_KEY && ERPNEXT_API_SECRET);
}
