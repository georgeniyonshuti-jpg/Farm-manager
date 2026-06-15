/** ERPNext prefs — server-backed with localStorage cache for offline reads. */

import type { ErpnextConfigPayload } from "../api/erpnext.api";

/**
 * Entity registry sync (flocks, feed, mortality, etc.) runs server-side via clevafarm_sync_outbox.
 * Set VITE_CLIENT_ERPNEXT_ENTITY_SYNC=true only for legacy double-post debugging.
 */
export const CLIENT_ERPNEXT_ENTITY_SYNC =
  import.meta.env.VITE_CLIENT_ERPNEXT_ENTITY_SYNC === "true";

const LS_COMPANY = "clevafarm.erpnext.company";
const LS_COST_CENTER = "clevafarm.erpnext.costCenter";
const LS_ACCOUNTS = "clevafarm.erpnext.accountMappings";

export type ErpnextAccountMappings = {
  feedExpense?: string;
  mortalityLoss?: string;
  livestockAsset?: string;
  revenue?: string;
  medicineExpense?: string;
  payrollExpense?: string;
};

export function getStoredErpnextCompany(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_COMPANY) || "";
}

export function getStoredErpnextCostCenter(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LS_COST_CENTER) || "";
}

export function getStoredErpnextAccountMappings(): ErpnextAccountMappings {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "{}") as ErpnextAccountMappings;
  } catch {
    return {};
  }
}

export function cacheErpnextPrefs(config: ErpnextConfigPayload) {
  if (config.erpnextCompany) localStorage.setItem(LS_COMPANY, config.erpnextCompany);
  if (config.erpnextDefaultCostCenter) localStorage.setItem(LS_COST_CENTER, config.erpnextDefaultCostCenter);
  const mappings: ErpnextAccountMappings = {
    feedExpense: config.accountFeedExpense,
    mortalityLoss: config.accountMortalityLoss,
    livestockAsset: config.accountLivestockAsset,
    revenue: config.accountSalesRevenue,
    medicineExpense: config.accountMedicineExpense,
    payrollExpense: config.accountPayrollExpense,
  };
  localStorage.setItem(LS_ACCOUNTS, JSON.stringify(mappings));
}

export function saveStoredErpnextAccountMappings(mappings: ErpnextAccountMappings) {
  localStorage.setItem(LS_ACCOUNTS, JSON.stringify(mappings));
}

export function configToApiPayload(
  selectedCompany: string,
  selectedCostCenter: string,
  accountMappings: ErpnextAccountMappings,
  syncFlags?: Partial<Pick<ErpnextConfigPayload, "autoSyncFeed" | "autoSyncMortality" | "autoSyncSlaughter" | "autoSyncPayroll">>
): ErpnextConfigPayload {
  return {
    erpnextCompany: selectedCompany || undefined,
    erpnextDefaultCostCenter: selectedCostCenter || undefined,
    accountFeedExpense: accountMappings.feedExpense,
    accountMortalityLoss: accountMappings.mortalityLoss,
    accountLivestockAsset: accountMappings.livestockAsset,
    accountSalesRevenue: accountMappings.revenue,
    accountMedicineExpense: accountMappings.medicineExpense,
    accountPayrollExpense: accountMappings.payrollExpense,
    ...syncFlags,
  };
}

export function apiConfigToLocal(config: {
  erpnextCompany?: string | null;
  erpnextDefaultCostCenter?: string | null;
  accountFeedExpense?: string | null;
  accountMortalityLoss?: string | null;
  accountLivestockAsset?: string | null;
  accountSalesRevenue?: string | null;
  accountMedicineExpense?: string | null;
  accountPayrollExpense?: string | null;
} | null): {
  company: string;
  costCenter: string;
  accountMappings: ErpnextAccountMappings;
} {
  if (!config) {
    return {
      company: getStoredErpnextCompany(),
      costCenter: getStoredErpnextCostCenter(),
      accountMappings: getStoredErpnextAccountMappings(),
    };
  }
  const accountMappings: ErpnextAccountMappings = {
    feedExpense: config.accountFeedExpense || undefined,
    mortalityLoss: config.accountMortalityLoss || undefined,
    livestockAsset: config.accountLivestockAsset || undefined,
    revenue: config.accountSalesRevenue || undefined,
    medicineExpense: config.accountMedicineExpense || undefined,
    payrollExpense: config.accountPayrollExpense || undefined,
  };
  cacheErpnextPrefs({
    erpnextCompany: config.erpnextCompany || undefined,
    erpnextDefaultCostCenter: config.erpnextDefaultCostCenter || undefined,
    ...accountMappings,
    accountFeedExpense: accountMappings.feedExpense,
    accountMortalityLoss: accountMappings.mortalityLoss,
    accountLivestockAsset: accountMappings.livestockAsset,
    accountSalesRevenue: accountMappings.revenue,
    accountMedicineExpense: accountMappings.medicineExpense,
    accountPayrollExpense: accountMappings.payrollExpense,
  });
  return {
    company: config.erpnextCompany || "",
    costCenter: config.erpnextDefaultCostCenter || "",
    accountMappings,
  };
}
