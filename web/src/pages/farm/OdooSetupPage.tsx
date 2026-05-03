/**
 * Odoo Integration Setup Page
 *
 * Gives manager+ users:
 *  - Live Odoo connection status + stats
 *  - Farm account setup (create all IAS 41 accounts in one click)
 *  - Chart of accounts browser
 *  - Customers & vendors in Odoo
 *  - Recent documents (invoices, bills, journal entries)
 *  - Product catalogue
 *
 * Access: manager and above only.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { roleAtLeast } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = {
  connected: boolean;
  uid: number | null;
  error?: string;
  customers: number;
  vendors: number;
  invoices: number;
  bills: number;
  journalEntries: number;
  products: number;
  accounts: number;
};

type FarmAccountStatus = {
  key: string;
  code: string;
  name: string;
  groupLabel: string;
  description: string;
  accountType: string;
  id: number | null;
  found: boolean;
};

type SetupResult = {
  key: string;
  code: string;
  name: string;
  id: number | null;
  created: boolean;
  error: string | null;
};

type OdooPartner = {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  customer_rank: number;
  supplier_rank: number;
};

type OdooDocument = {
  id: number;
  name: string;
  move_type: string;
  state: string;
  invoice_date: string | false;
  date: string | false;
  partner_id: [number, string] | false;
  amount_total: number;
  ref: string | false;
};

type OdooAccount = {
  id: number;
  code: string;
  name: string;
  account_type: string;
};

type OdooProduct = {
  id: number;
  name: string;
  type: string;
  list_price: number;
  standard_price: number;
};

type Tab = "overview" | "accounts" | "partners" | "documents" | "products";
type ActionQueueLite = { outboxStatus: string; sourceStatus: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function moveTypeLabel(t: string): string {
  const m: Record<string, string> = {
    out_invoice: "Customer Invoice",
    in_invoice: "Vendor Bill",
    entry: "Journal Entry",
    out_refund: "Credit Note",
    in_refund: "Vendor Credit",
  };
  return m[t] ?? t;
}

function moveTypeColor(t: string): string {
  if (t === "out_invoice") return "bg-emerald-100 text-emerald-800";
  if (t === "in_invoice") return "bg-blue-100 text-blue-800";
  if (t === "entry") return "bg-purple-100 text-purple-800";
  return "bg-gray-100 text-gray-600";
}

function stateColor(s: string): string {
  if (s === "posted") return "bg-emerald-100 text-emerald-700";
  if (s === "draft") return "bg-amber-100 text-amber-700";
  if (s === "cancel") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function accountTypeColor(t: string): string {
  if (t?.startsWith("asset")) return "bg-blue-100 text-blue-700";
  if (t?.startsWith("liability")) return "bg-orange-100 text-orange-700";
  if (t?.startsWith("income")) return "bg-emerald-100 text-emerald-700";
  if (t?.startsWith("expense")) return "bg-red-100 text-red-700";
  if (t?.startsWith("equity")) return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OdooSetupPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isManager = roleAtLeast(user, "manager");

  const [tab, setTab] = useState<Tab>("overview");

  // Overview
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Farm accounts
  const [farmAccounts, setFarmAccounts] = useState<FarmAccountStatus[]>([]);
  const [farmAccountsLoading, setFarmAccountsLoading] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);

  // Chart of accounts
  const [allAccounts, setAllAccounts] = useState<OdooAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  // Partners
  const [partners, setPartners] = useState<OdooPartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerType, setPartnerType] = useState<"all" | "customer" | "vendor">("all");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [newPartner, setNewPartner] = useState({ name: "", email: "", phone: "", isVendor: false, isCustomer: false });
  const [creatingPartner, setCreatingPartner] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<OdooDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Products
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [actionSummary, setActionSummary] = useState<{ failed: number; pendingApproval: number; notQueued: number }>({
    failed: 0,
    pendingApproval: 0,
    notQueued: 0,
  });
  const [actionSummaryLoading, setActionSummaryLoading] = useState(false);

  // ── Loaders ──

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/status`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setStatus(d);
    } catch { setStatus(null); }
    setStatusLoading(false);
  }, [token]);

  const loadFarmAccounts = useCallback(async () => {
    setFarmAccountsLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/farm-accounts`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setFarmAccounts(d.accounts ?? []);
    } catch { /* */ }
    setFarmAccountsLoading(false);
  }, [token]);

  const loadAllAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/accounts?limit=500`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setAllAccounts(d.accounts ?? []);
    } catch { /* */ }
    setAccountsLoading(false);
  }, [token]);

  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      const params = new URLSearchParams({ type: partnerType, limit: "100" });
      if (partnerSearch) params.set("search", partnerSearch);
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/partners?${params}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setPartners(d.partners ?? []);
    } catch { /* */ }
    setPartnersLoading(false);
  }, [token, partnerType, partnerSearch]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/documents?limit=50`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setDocuments(d.documents ?? []);
    } catch { /* */ }
    setDocsLoading(false);
  }, [token]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (productSearch) params.set("search", productSearch);
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/products?${params}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setProducts(d.products ?? []);
    } catch { /* */ }
    setProductsLoading(false);
  }, [token, productSearch]);

  const loadActionSummary = useCallback(async () => {
    setActionSummaryLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      const items: ActionQueueLite[] = Array.isArray(d.items) ? d.items : [];
      const failed = items.filter(i => i.outboxStatus === "failed").length;
      const pendingApproval = items.filter(i => i.sourceStatus === "pending_approval" && i.outboxStatus !== "failed").length;
      const notQueued = items.filter(i => i.outboxStatus === "not_queued" && i.sourceStatus !== "pending_approval").length;
      setActionSummary({ failed, pendingApproval, notQueued });
    } catch {
      setActionSummary({ failed: 0, pendingApproval: 0, notQueued: 0 });
    }
    setActionSummaryLoading(false);
  }, [token]);

  useEffect(() => {
    if (!isManager) return;
    if (tab === "overview") { loadStatus(); loadFarmAccounts(); loadActionSummary(); }
    else if (tab === "accounts") loadAllAccounts();
    else if (tab === "partners") loadPartners();
    else if (tab === "documents") loadDocuments();
    else if (tab === "products") loadProducts();
  }, [tab, isManager, loadStatus, loadFarmAccounts, loadAllAccounts, loadPartners, loadDocuments, loadProducts, loadActionSummary]);

  // ── Actions ──

  async function runSetup() {
    setSetupRunning(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/farm-accounts/setup`, {
        method: "POST", headers: jsonAuthHeaders(token),
      });
      const d: { ok: boolean; results: SetupResult[]; created: number; failed: number; error?: string } = await r.json();
      if (!r.ok) { showToast("error", d.error ?? "Setup failed."); setSetupRunning(false); return; }
      const msg = d.created > 0
        ? `${d.created} account(s) created in Odoo.${d.failed > 0 ? ` ${d.failed} failed — see list.` : ""}`
        : `All ${d.results.length} farm accounts already exist in Odoo.`;
      showToast("success", msg);
      await loadFarmAccounts();
    } catch { showToast("error", "Network error. Is Odoo reachable?"); }
    setSetupRunning(false);
  }

  async function createPartner() {
    if (!newPartner.name.trim()) { showToast("error", "Name is required."); return; }
    setCreatingPartner(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/odoo-setup/partners`, {
        method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(newPartner),
      });
      const d: { ok: boolean; id: number; created: boolean; error?: string } = await r.json();
      if (!r.ok) { showToast("error", d.error ?? "Could not create partner."); setCreatingPartner(false); return; }
      showToast("success", d.created ? `Partner "${newPartner.name}" created in Odoo.` : `Found existing partner in Odoo (ID: ${d.id}).`);
      setNewPartner({ name: "", email: "", phone: "", isVendor: false, isCustomer: false });
      loadPartners();
    } catch { showToast("error", "Network error."); }
    setCreatingPartner(false);
  }

  if (!isManager) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">
        Manager or above access required.
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Home" },
    { id: "accounts", label: "Accounts" },
    { id: "partners", label: "Contacts" },
    { id: "documents", label: "Sync history" },
    { id: "products", label: "Products" },
  ];

  const farmAccountGroups = ["Assets", "Revenue", "Expenses", "Liabilities"];
  const missingCount = farmAccounts.filter(a => !a.found).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Odoo Integration"
        subtitle="Set up accounts, manage partners, and view what's in Odoo"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-subtle)] p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "px-4 py-2 text-sm font-medium whitespace-nowrap rounded-[var(--radius-md)] transition-all",
              tab === t.id
                ? "bg-[var(--surface-color)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview ───────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <section className="space-y-6">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Needs attention first</h2>
              <button onClick={loadActionSummary} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Refresh</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/8 px-3 py-2">
                <div className="text-xs text-red-400">Failed</div>
                <div className="text-lg font-semibold text-red-400">{actionSummaryLoading ? "…" : actionSummary.failed}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-blue-500/30 bg-blue-500/8 px-3 py-2">
                <div className="text-xs text-blue-400">Awaiting approval</div>
                <div className="text-lg font-semibold text-blue-400">{actionSummaryLoading ? "…" : actionSummary.pendingApproval}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/8 px-3 py-2">
                <div className="text-xs text-amber-400">Not queued</div>
                <div className="text-lg font-semibold text-amber-400">{actionSummaryLoading ? "…" : actionSummary.notQueued}</div>
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Go to Accounting Approvals to fix and resend pending items.
            </p>
          </div>

          {/* Connection status */}
          <div className={`rounded-[var(--radius-lg)] p-5 border shadow-[var(--shadow-sm)] ${status?.connected ? "border-emerald-500/30 bg-emerald-500/8" : "border-red-500/30 bg-red-500/8"}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-3 h-3 rounded-full ${status?.connected ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="font-semibold text-sm text-[var(--text-primary)]">
                {statusLoading ? "Checking Odoo connection…" : status?.connected ? "Odoo connected" : "Odoo not reachable"}
              </span>
              <button onClick={loadStatus} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Refresh</button>
            </div>
            {status?.connected && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Customers", value: status.customers },
                  { label: "Vendors", value: status.vendors },
                  { label: "Customer Invoices", value: status.invoices },
                  { label: "Vendor Bills", value: status.bills },
                  { label: "Journal Entries", value: status.journalEntries },
                  { label: "Products", value: status.products },
                  { label: "Accounts", value: status.accounts },
                ].map(card => (
                  <div key={card.label} className="bg-[var(--surface-card)] rounded-[var(--radius-md)] px-3 py-2 text-center border border-[var(--border-color)]">
                    <div className="text-lg font-bold text-[var(--text-primary)]">{fmt(card.value)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{card.label}</div>
                  </div>
                ))}
              </div>
            )}
            {status && !status.connected && (
              <div className="text-sm text-red-400 mt-2">{status.error}</div>
            )}
          </div>

          {/* Farm accounts status */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Farm Accounts in Odoo</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  These accounts are required for all Clevafarm → Odoo transactions. Create them once with one click.
                </p>
              </div>
              <button
                onClick={runSetup}
                disabled={setupRunning || !status?.connected}
                className="bg-[var(--primary-color)] text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-[var(--primary-color-dark)] disabled:opacity-50 transition-colors font-medium"
              >
                {setupRunning ? "Setting up…" : missingCount > 0 ? `Create ${missingCount} missing account${missingCount !== 1 ? "s" : ""}` : "All accounts present ✓"}
              </button>
            </div>

            {farmAccountsLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}

            {!farmAccountsLoading && farmAccountGroups.map(group => {
              const groupAccounts = farmAccounts.filter(a => a.groupLabel === group);
              if (!groupAccounts.length) return null;
              return (
                <div key={group} className="mb-4">
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{group}</h3>
                  <div className="space-y-1">
                    {groupAccounts.map(acc => (
                      <div key={acc.key} className={`flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] border text-sm ${acc.found ? "border-emerald-500/20 bg-[var(--surface-card)]" : "border-amber-500/30 bg-amber-500/5"}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${acc.found ? "bg-emerald-500" : "bg-amber-400"}`} />
                        <span className="font-mono text-xs text-[var(--text-muted)] w-16 shrink-0">{acc.code}</span>
                        <span className="font-medium text-[var(--text-primary)] flex-1">{acc.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${accountTypeColor(acc.accountType)}`}>
                          {acc.accountType.replace("_", " ")}
                        </span>
                        {acc.found
                          ? <span className="text-xs text-emerald-500 shrink-0">✓ Found</span>
                          : <span className="text-xs text-amber-400 shrink-0">Missing</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {!farmAccountsLoading && missingCount === 0 && farmAccounts.length > 0 && (
              <p className="text-xs text-emerald-500 mt-2">
                All {farmAccounts.length} farm accounts are present in Odoo. Transactions will use these accounts automatically.
              </p>
            )}
            {!farmAccountsLoading && missingCount > 0 && (
              <p className="text-xs text-amber-400 mt-2">
                {missingCount} account(s) are missing. Click "Create missing accounts" to set them up — transactions will fail until they exist.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ─── Chart of Accounts ─────────────────────────────────────────── */}
      {tab === "accounts" && (
        <section className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            All active accounts in your Odoo chart of accounts. The farm-specific accounts are highlighted.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by code or name…"
              value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30"
            />
          </div>
          {accountsLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading accounts…</p>}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-muted)] bg-[var(--table-header-bg)]">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {allAccounts
                    .filter(a => !accountSearch || a.code.includes(accountSearch) || a.name.toLowerCase().includes(accountSearch.toLowerCase()))
                    .map(a => {
                      const isFarm = farmAccounts.some(fa => fa.found && fa.id === a.id);
                      return (
                        <tr key={a.id} className={`border-b border-[var(--border-color)] hover:bg-[var(--table-row-hover)] transition-colors ${isFarm ? "bg-emerald-500/5" : ""}`}>
                          <td className="py-1.5 px-4 font-mono text-xs text-[var(--text-muted)]">
                            {a.code}
                            {isFarm && <span className="ml-1 text-emerald-500 text-xs">★</span>}
                          </td>
                          <td className="py-1.5 px-4 font-medium text-[var(--text-primary)]">{a.name}</td>
                          <td className="py-1.5 px-4">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${accountTypeColor(a.account_type)}`}>
                              {a.account_type.replace(/_/g, " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {!accountsLoading && allAccounts.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-sm text-[var(--text-muted)]">No accounts found. Is Odoo connected?</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">★ = Farm account used by Clevafarm transactions</p>
        </section>
      )}

      {/* ─── Customers & Vendors ───────────────────────────────────────── */}
      {tab === "partners" && (
        <section className="space-y-5">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)] space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add customer or vendor to Odoo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Name <span className="text-red-400">*</span></label>
                <input value={newPartner.name} onChange={e => setNewPartner(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Kigali Feeds Ltd"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Email</label>
                <input type="email" value={newPartner.email} onChange={e => setNewPartner(p => ({ ...p, email: e.target.value }))} placeholder="Optional"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Phone</label>
                <input value={newPartner.phone} onChange={e => setNewPartner(p => ({ ...p, phone: e.target.value }))} placeholder="Optional"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
              </div>
              <div className="flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--text-secondary)]">
                  <input type="checkbox" checked={newPartner.isVendor} onChange={e => setNewPartner(p => ({ ...p, isVendor: e.target.checked }))} className="accent-[var(--primary-color)]" />
                  Vendor / Supplier
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer text-[var(--text-secondary)]">
                  <input type="checkbox" checked={newPartner.isCustomer} onChange={e => setNewPartner(p => ({ ...p, isCustomer: e.target.checked }))} className="accent-[var(--primary-color)]" />
                  Customer
                </label>
              </div>
            </div>
            <button onClick={createPartner} disabled={creatingPartner || !newPartner.name.trim()}
              className="bg-[var(--primary-color)] text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-[var(--primary-color-dark)] disabled:opacity-50 transition-colors font-medium">
              {creatingPartner ? "Saving…" : "Add to Odoo"}
            </button>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {(["all", "customer", "vendor"] as const).map(t => (
              <button key={t} onClick={() => setPartnerType(t)}
                className={["text-sm px-3 py-1.5 rounded-[var(--radius-md)] border transition-colors capitalize",
                  partnerType === t ? "bg-[var(--primary-color)] text-white border-[var(--primary-color)]" : "border-[var(--border-color)] text-[var(--text-muted)] bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                ].join(" ")}>
                {t === "all" ? "All" : t === "customer" ? "Customers" : "Vendors"}
              </button>
            ))}
            <input type="text" placeholder="Search…" value={partnerSearch} onChange={e => setPartnerSearch(e.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30" />
            <button onClick={loadPartners} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Refresh</button>
          </div>

          {partnersLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
          <div className="space-y-1">
            {partners.map(p => (
              <div key={p.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--text-primary)] truncate">{p.name}</div>
                  {p.email && <div className="text-xs text-[var(--text-muted)] truncate">{String(p.email)}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {p.customer_rank > 0 && <span className="text-xs px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded font-medium border border-emerald-500/20">Customer</span>}
                  {p.supplier_rank > 0 && <span className="text-xs px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded font-medium border border-blue-500/20">Vendor</span>}
                </div>
              </div>
            ))}
            {!partnersLoading && partners.length === 0 && (
              <p className="text-sm text-[var(--text-muted)] py-4 text-center">No partners found.</p>
            )}
          </div>
        </section>
      )}

      {/* ─── Recent Documents ──────────────────────────────────────────── */}
      {tab === "documents" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              All accounting documents sent from Clevafarm appear here. Your accountant reviews and posts them.
            </p>
            <button onClick={loadDocuments} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Refresh</button>
          </div>

          {docsLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-muted)] bg-[var(--table-header-bg)]">
                    <th className="py-2.5 px-4">Reference</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Partner</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id} className="border-b border-[var(--border-color)] hover:bg-[var(--table-row-hover)] transition-colors">
                      <td className="py-1.5 px-4 font-mono text-xs font-medium text-[var(--text-secondary)]">{doc.name || `#${doc.id}`}</td>
                      <td className="py-1.5 px-4">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${moveTypeColor(doc.move_type)}`}>
                          {moveTypeLabel(doc.move_type)}
                        </span>
                      </td>
                      <td className="py-1.5 px-4">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${stateColor(doc.state)}`}>
                          {doc.state}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-[var(--text-muted)] text-xs">{doc.invoice_date || doc.date || "—"}</td>
                      <td className="py-1.5 px-4 text-[var(--text-muted)] text-xs truncate max-w-[140px]">{Array.isArray(doc.partner_id) ? doc.partner_id[1] : "—"}</td>
                      <td className="py-1.5 px-4 text-right font-medium text-[var(--text-secondary)]">{doc.amount_total > 0 ? Number(doc.amount_total).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!docsLoading && documents.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-sm text-[var(--text-muted)]">No documents found in Odoo yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ─── Products ──────────────────────────────────────────────────── */}
      {tab === "products" && (
        <section className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Products defined in Odoo. Clevafarm auto-creates service products for each item type when issuing invoices.
          </p>
          <div className="flex gap-2">
            <input type="text" placeholder="Search products…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="flex-1 rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30" />
            <button onClick={loadProducts} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">Refresh</button>
          </div>
          {productsLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-xs text-[var(--text-muted)] bg-[var(--table-header-bg)]">
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Sales price</th>
                    <th className="py-2.5 px-4 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-b border-[var(--border-color)] hover:bg-[var(--table-row-hover)] transition-colors">
                      <td className="py-1.5 px-4 font-medium text-[var(--text-primary)]">{p.name}</td>
                      <td className="py-1.5 px-4">
                        <span className="text-xs px-1.5 py-0.5 bg-[var(--surface-subtle)] text-[var(--text-muted)] rounded border border-[var(--border-color)] capitalize">{p.type}</span>
                      </td>
                      <td className="py-1.5 px-4 text-right text-[var(--text-secondary)]">{p.list_price > 0 ? Number(p.list_price).toLocaleString() : "—"}</td>
                      <td className="py-1.5 px-4 text-right text-[var(--text-secondary)]">{p.standard_price > 0 ? Number(p.standard_price).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                  {!productsLoading && products.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-sm text-[var(--text-muted)]">No products found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
