import { API_BASE_URL } from "./config";
import { readAuthHeaders, jsonAuthHeaders } from "../lib/authHeaders";
import { getStoredErpnextAccountMappings } from "../lib/erpnextPrefs";

export type ErpnextConfigPayload = {
  erpnextBaseUrl?: string;
  erpnextCompany?: string;
  erpnextDefaultCostCenter?: string;
  accountFeedExpense?: string;
  accountMortalityLoss?: string;
  accountLivestockAsset?: string;
  accountSalesRevenue?: string;
  accountPayrollExpense?: string;
  accountMedicineExpense?: string;
  autoSyncFeed?: boolean;
  autoSyncMortality?: boolean;
  autoSyncSlaughter?: boolean;
  autoSyncPayroll?: boolean;
};

export async function loginERPNextSession(token: string, usr: string, pwd: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/session/login`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    credentials: "include",
    body: JSON.stringify({ usr, pwd }),
  });
  return res.json();
}

export async function getERPNextStatus(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/status`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function getERPNextHealth(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/health`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function getErpnextConfig(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/config`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function saveErpnextConfig(token: string, config: ErpnextConfigPayload) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/config`, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function saveWarehouseMapping(token: string, barnName: string, erpnextWarehouse: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/warehouse-mapping`, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ barnName, erpnextWarehouse }),
  });
  return res.json();
}

export async function getWebhookStatus(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/webhooks/status`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function getCompanies(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/companies`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function getAccounts(token: string, company: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/accounts?company=${encodeURIComponent(company)}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getCostCenters(token: string, company: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/cost-centers?company=${encodeURIComponent(company)}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getWarehouses(token: string, company: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/warehouses?company=${encodeURIComponent(company)}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getLoans(token: string, company: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/loans?company=${encodeURIComponent(company)}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getLoanApplications(token: string, company: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/loan-applications?company=${encodeURIComponent(company)}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function createLoanApplication(
  token: string,
  payload: {
    company: string;
    applicant: string;
    loanType: string;
    amount: number;
    repaymentPeriods: number;
  }
) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/loans`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function syncFeedPurchaseToERPNext(
  token: string,
  payload: {
    company: string;
    supplier: string;
    date: string;
    feedType: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    costCenter?: string;
    expenseAccount?: string;
    sourceId?: string;
    warehouse?: string;
  }
) {
  const maps = getStoredErpnextAccountMappings();
  const res = await fetch(`${API_BASE_URL}/api/erpnext/purchase-invoice`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({
      company: payload.company,
      supplier: payload.supplier,
      date: payload.date,
      costCenter: payload.costCenter,
      farmEntityId: payload.sourceId,
      sourceTable: "flock_feed_entries",
      sourceId: payload.sourceId,
      items: [
        {
          item_name: payload.feedType,
          qty: payload.quantity,
          rate: payload.unitPrice,
          amount: payload.totalAmount,
          expense_account: payload.expenseAccount || maps.feedExpense || "Cost of Goods Sold - CD",
          warehouse: payload.warehouse,
        },
      ],
    }),
  });
  return res.json();
}

export async function syncFeedStockReceiptToERPNext(
  token: string,
  payload: {
    company: string;
    date: string;
    itemCode: string;
    qty: number;
    warehouse: string;
    sourceId?: string;
  }
) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/stock-entry`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({
      company: payload.company,
      date: payload.date,
      type: "Material Receipt",
      farmEntityId: payload.sourceId,
      sourceTable: "flock_feed_entries",
      sourceId: payload.sourceId,
      items: [{ item_code: payload.itemCode, qty: payload.qty, t_warehouse: payload.warehouse }],
    }),
  });
  return res.json();
}

export async function syncSlaughterSaleToERPNext(
  token: string,
  payload: {
    company: string;
    customer: string;
    date: string;
    flockId: string;
    weightKg: number;
    pricePerKg: number;
    totalAmount: number;
    costCenter?: string;
    sourceId?: string;
  }
) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/sales-invoice`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({
      company: payload.company,
      customer: payload.customer,
      date: payload.date,
      costCenter: payload.costCenter,
      farmEntityId: payload.sourceId,
      sourceTable: "flock_slaughter_events",
      sourceId: payload.sourceId,
      items: [
        {
          item_name: `Broiler Chicken - Flock ${payload.flockId}`,
          qty: payload.weightKg,
          rate: payload.pricePerKg,
          uom: "Kg",
          amount: payload.totalAmount,
        },
      ],
    }),
  });
  return res.json();
}

export async function syncMortalityToERPNext(
  token: string,
  payload: {
    company: string;
    date: string;
    flockId: string;
    count: number;
    estimatedValuePerBird: number;
    costCenter?: string;
    mortalityAccount?: string;
    assetAccount?: string;
    sourceId?: string;
  }
) {
  const maps = getStoredErpnextAccountMappings();
  const totalLoss = payload.count * payload.estimatedValuePerBird;
  const res = await fetch(`${API_BASE_URL}/api/erpnext/journal-entry`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({
      company: payload.company,
      date: payload.date,
      farmEntityId: payload.sourceId,
      sourceTable: "flock_mortality_events",
      sourceId: payload.sourceId,
      narration: `Mortality write-off — Flock ${payload.flockId} — ${payload.count} birds`,
      accounts: [
        {
          account: payload.mortalityAccount || maps.mortalityLoss || "Indirect Expenses - CD",
          debit_in_account_currency: totalLoss,
          credit_in_account_currency: 0,
          cost_center: payload.costCenter,
        },
        {
          account: payload.assetAccount || maps.livestockAsset || "Current Assets - CD",
          debit_in_account_currency: 0,
          credit_in_account_currency: totalLoss,
          cost_center: payload.costCenter,
        },
      ],
    }),
  });
  return res.json();
}

export async function syncTreatmentToERPNext(
  token: string,
  payload: {
    company: string;
    supplier: string;
    date: string;
    medicineName: string;
    amount: number;
    costCenter?: string;
    expenseAccount?: string;
    sourceId?: string;
  }
) {
  const maps = getStoredErpnextAccountMappings();
  const res = await fetch(`${API_BASE_URL}/api/erpnext/purchase-invoice`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({
      company: payload.company,
      supplier: payload.supplier,
      date: payload.date,
      costCenter: payload.costCenter,
      farmEntityId: payload.sourceId,
      sourceTable: "flock_treatments",
      sourceId: payload.sourceId,
      items: [
        {
          item_name: payload.medicineName,
          qty: 1,
          rate: payload.amount,
          amount: payload.amount,
          expense_account: payload.expenseAccount || maps.medicineExpense || maps.feedExpense || "Cost of Goods Sold - CD",
        },
      ],
    }),
  });
  return res.json();
}

export async function getTrialBalance(token: string, company: string, fromDate: string, toDate: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/reports/trial-balance?company=${encodeURIComponent(company)}&fromDate=${fromDate}&toDate=${toDate}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getProfitAndLoss(token: string, company: string, fromDate: string, toDate: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/reports/pnl?company=${encodeURIComponent(company)}&fromDate=${fromDate}&toDate=${toDate}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getPayrollFromERPNext(
  token: string,
  company: string,
  fromDate: string,
  toDate: string
) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/payroll?company=${encodeURIComponent(company)}&fromDate=${fromDate}&toDate=${toDate}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getErpnextSyncLog(token: string, limit = 20) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/sync-log?limit=${limit}`, {
    headers: readAuthHeaders(token),
  });
  return res.json();
}

export async function retryFailedErpnextSyncs(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/sync-log/retry-failed`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
  });
  return res.json();
}

export async function getErpnextJournalEntries(token: string, company: string, limit = 20) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/journal-entries?company=${encodeURIComponent(company)}&limit=${limit}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function getBalanceSheet(token: string, company: string, fromDate: string, toDate: string) {
  const res = await fetch(
    `${API_BASE_URL}/api/erpnext/reports/balance-sheet?company=${encodeURIComponent(company)}&fromDate=${fromDate}&toDate=${toDate}`,
    { headers: readAuthHeaders(token) }
  );
  return res.json();
}

export async function exchangeERPNextOAuthToken(token: string, code: string, redirectUri: string) {
  const res = await fetch(`${API_BASE_URL}/api/erpnext/auth/token`, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  return res.json();
}
