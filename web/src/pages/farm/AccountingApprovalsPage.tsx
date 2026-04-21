/**
 * Accounting Approvals — classic 4-tab layout
 *
 *  1. Needs Action  — failed + pending_approval + not_queued (default)
 *  2. Approvals Inbox — all pending approval events consolidated
 *  3. Sync Log      — outbox history
 *  4. Advanced      — payroll closures, IAS41 valuations, sales
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { roleAtLeast } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { OdooSyncBadge } from "../../components/accounting/OdooSyncBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedRow = {
  id: string; recordedAt: string; quantityKg: number;
  unitCostRwfPerKg: number | null; feedType: string | null;
  supplierName: string | null; reference: string;
  accountingStatus: string; actorName: string | null;
};
type MedicineLotRow = {
  id: string; lotNumber: string; receivedAt: string; quantityReceived: number;
  unitCostRwf: number | null; totalCostRwf: number | null; supplier: string | null;
  invoiceRef: string | null; accountingStatus: string; medicineName: string;
};
type SlaughterRow = {
  id: string; flockId: string; flockCode: string | null; at: string;
  birdsSlaughtered: number; avgLiveWeightKg: number; avgCarcassWeightKg: number | null;
  pricePerKgRwf: number | null; fairValueRwf: number | null; accountingStatus: string;
};
type MortalityRow = {
  id: string; flockId: string; flockCode: string | null; at: string;
  count: number; cause: string | null; notes: string | null;
  impairmentValueRwf: number | null; accountingStatus: string;
};
type SaleOrder = {
  id: string; flockId: string; flockCode: string | null; orderDate: string;
  numberOfBirds: number; totalWeightKg: number; pricePerKg: number;
  buyerName: string | null; submissionStatus: string; accountingStatus: string;
  odooMoveName: string; odooMoveState: string;
};
type OutboxRow = {
  id: string; sourceTable: string; sourceId: string; eventType: string;
  status: string; attempts: number; lastAttemptedAt: string | null;
  lastError: string | null; odooMoveId: number | null; odooMoveName: string | null;
  createdAt: string;
};
type ValuationSnapshot = {
  id: string; flockId: string; flockCode: string | null; snapshotDate: string;
  liveCount: number; avgWeightKg: number; totalLiveWeightKg: number;
  marketPricePerKgRwf: number; costsToSellPerKgRwf: number; fairValuePerKgRwf: number;
  totalFairValueRwf: number; fairValueChangeRwf: number | null; fcrAtSnapshot: number | null;
  status: string; approvedBy: string | null; approvedAt: string | null;
};
type PayrollClosure = {
  id: string; periodStart: string; periodEnd: string; totalCreditsRwf: number;
  totalDeductionsRwf: number; netPayrollRwf: number; workerCount: number;
  accountingStatus: string; odooMoveName: string | null; approvedAt: string;
};
type FlockOption = { id: string; label: string };
type FixableField = {
  key: string; label: string; type: "text" | "number" | "email" | "date";
  value: string | number | null; required: boolean; hint?: string;
};
type UserError = { category: string; message: string } | null;
type ActionQueueItem = {
  eventType: string; sourceTable: string; sourceId: string; outboxId: string | null;
  eventAt: string; sourceStatus: string; outboxStatus: string;
  attempts: number; lastAttemptedAt: string | null; nextRetryAt: string | null;
  lastError: string | null; userError: UserError;
  recordData: Record<string, unknown>;
  summary: { label: string; detail: string };
  fixableFields: FixableField[];
};

type Tab = "action" | "inbox" | "sync" | "advanced";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

function eventTypeLabel(t: string): string {
  const map: Record<string, string> = {
    feed_purchase: "Feed purchase",
    medicine_purchase: "Medicine purchase",
    slaughter_conversion: "Slaughter → Meat stock",
    meat_sale: "Meat sale",
    fcr_fair_value_adjustment: "FCR fair value",
    payroll_wages: "Payroll wages",
    mortality_impairment: "Mortality impairment",
    bio_asset_opening: "Flock opening",
  };
  return map[t] ?? t;
}

const EVENT_PATCH_PATH: Record<string, string> = {
  feed_purchase: "feed",
  medicine_purchase: "medicine-lot",
  slaughter_conversion: "slaughter",
  meat_sale: "sale",
  mortality_impairment: "mortality",
  bio_asset_opening: "flock-opening",
  payroll_wages: "payroll-closure",
};

function eventTypeBadgeColor(t: string): string {
  const m: Record<string, string> = {
    feed_purchase: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    medicine_purchase: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    slaughter_conversion: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    meat_sale: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    mortality_impairment: "bg-red-500/15 text-red-400 border-red-500/20",
    bio_asset_opening: "bg-teal-500/15 text-teal-400 border-teal-500/20",
    payroll_wages: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
    fcr_fair_value_adjustment: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  };
  return m[t] ?? "bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border-color)]";
}

function actionLabel(item: ActionQueueItem): string {
  if (item.outboxStatus === "failed") return "Fix & send";
  if (item.sourceStatus === "pending_approval") return "Approve & send";
  return "Send to Odoo";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AccountingApprovalsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isManager = roleAtLeast(user, "manager");
  const [tab, setTab] = useState<Tab>("action");

  // Action queue
  const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSearch, setActionSearch] = useState("");
  const [editForms, setEditForms] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Inbox data (consolidated approvals)
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [medRows, setMedRows] = useState<MedicineLotRow[]>([]);
  const [slaughterRows, setSlaughterRows] = useState<SlaughterRow[]>([]);
  const [mortalityRows, setMortalityRows] = useState<MortalityRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [slaughterForms, setSlaughterForms] = useState<Record<string, { fairValue: string; carryingValue: string }>>({});
  const [mortalityForms, setMortalityForms] = useState<Record<string, string>>({});

  // Sync log (outbox)
  const [outboxRows, setOutboxRows] = useState<OutboxRow[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [outboxFilter, setOutboxFilter] = useState<"all" | "sent" | "failed" | "pending">("all");

  // Advanced
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [newSale, setNewSale] = useState({ flockId: "", orderDate: "", numberOfBirds: "", totalWeightKg: "", pricePerKg: "", buyerName: "", buyerEmail: "" });
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [payrollClosures, setPayrollClosures] = useState<PayrollClosure[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [newClosure, setNewClosure] = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [valuationSnapshots, setValuationSnapshots] = useState<ValuationSnapshot[]>([]);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [newValuation, setNewValuation] = useState({ flockId: "", snapshotDate: new Date().toISOString().slice(0, 10), marketPricePerKgRwf: "", costsToSellPerKgRwf: "" });
  const [valuationSubmitting, setValuationSubmitting] = useState(false);
  const [financeFlocks, setFinanceFlocks] = useState<FlockOption[]>([]);

  // ── Loaders ──
  const loadActionQueue = useCallback(async () => {
    setActionLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      const items: ActionQueueItem[] = d.items ?? [];
      setActionQueue(items);
      setEditForms(prev => {
        const next = { ...prev };
        items.forEach(item => {
          if (!next[item.sourceId]) {
            const fields: Record<string, string> = {};
            item.fixableFields.forEach(f => { fields[f.key] = f.value != null ? String(f.value) : ""; });
            next[item.sourceId] = fields;
          }
        });
        return next;
      });
    } catch { /* leave stale */ }
    setActionLoading(false);
  }, [token]);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const [f, m, s, mo] = await Promise.all([
        fetch(`${API_BASE_URL}/api/accounting-approvals/feed-procurements/pending`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/accounting-approvals/medicine-lots/pending`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/accounting-approvals/slaughter-events/pending`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/accounting-approvals/mortality-events/pending`, { headers: readAuthHeaders(token) }).then(r => r.json()),
      ]);
      setFeedRows(f.rows ?? []);
      setMedRows(m.rows ?? []);
      setSlaughterRows(s.rows ?? []);
      setMortalityRows(mo.rows ?? []);
    } catch { /* */ }
    setInboxLoading(false);
  }, [token]);

  const loadOutbox = useCallback(async () => {
    setOutboxLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/odoo-outbox`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setOutboxRows(d.rows ?? []);
    } catch { /* */ }
    setOutboxLoading(false);
  }, [token]);

  const loadAdvanced = useCallback(async () => {
    setSaleLoading(true);
    setPayrollLoading(true);
    setValuationLoading(true);
    try {
      const [sv, pc, vs, fl] = await Promise.all([
        fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/accounting-approvals/payroll-closures`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots`, { headers: readAuthHeaders(token) }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/flocks?includeDepleted=true`, { headers: readAuthHeaders(token) }).then(r => r.json()),
      ]);
      setSaleOrders(sv.orders ?? []);
      setPayrollClosures(pc.closures ?? []);
      setValuationSnapshots(vs.snapshots ?? []);
      const rows = Array.isArray(fl.flocks) ? fl.flocks : [];
      setFinanceFlocks(rows.map((f: { id: string; label?: string; code?: string | null }) => ({
        id: String(f.id),
        label: String(f.label ?? f.code ?? f.id),
      })));
    } catch { /* */ }
    setSaleLoading(false);
    setPayrollLoading(false);
    setValuationLoading(false);
  }, [token]);

  useEffect(() => {
    if (!isManager) return;
    if (tab === "action") void loadActionQueue();
    else if (tab === "inbox") void loadInbox();
    else if (tab === "sync") void loadOutbox();
    else if (tab === "advanced") void loadAdvanced();
  }, [tab, isManager, loadActionQueue, loadInbox, loadOutbox, loadAdvanced]);

  // ── Actions ──
  async function approveFeed(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/feed-procurements/${id}/approve`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({}) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Feed purchase sent to Odoo.");
    void loadInbox();
  }
  async function approveMed(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/medicine-lots/${id}/approve`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({}) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Medicine purchase sent to Odoo.");
    void loadInbox();
  }
  async function approveSlaughter(id: string) {
    const form = slaughterForms[id] ?? { fairValue: "", carryingValue: "" };
    const fairValueRwf = Number(form.fairValue);
    if (!Number.isFinite(fairValueRwf) || fairValueRwf <= 0) { showToast("error", "Enter a valid fair value (RWF) before approving."); return; }
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/slaughter-events/${id}/approve`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({ fairValueRwf, carryingValueRwf: Number(form.carryingValue) || fairValueRwf }) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Slaughter conversion sent to Odoo.");
    void loadInbox();
  }
  async function approveMortality(id: string) {
    const impairmentValueRwf = Number(mortalityForms[id] ?? "0");
    if (!Number.isFinite(impairmentValueRwf) || impairmentValueRwf < 0) { showToast("error", "Enter a valid impairment value (RWF)."); return; }
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/mortality-events/${id}/approve`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({ impairmentValueRwf }) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Mortality impairment sent to Odoo.");
    void loadInbox();
  }
  async function retryOutbox(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/odoo-outbox/${id}/retry`, { method: "POST", headers: jsonAuthHeaders(token) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Retry failed."); return; }
    showToast("success", "Retry queued.");
    void loadOutbox();
  }
  async function saveAndSendQueueItem(item: ActionQueueItem) {
    const patchPath = EVENT_PATCH_PATH[item.eventType];
    if (!patchPath) { showToast("error", `No endpoint for: ${item.eventType}`); return; }
    setSavingId(item.sourceId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue/${patchPath}/${item.sourceId}`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify(editForms[item.sourceId] ?? {}) });
      const d = await r.json();
      if (!r.ok) { showToast("error", d.error ?? "Save failed."); setSavingId(null); return; }
      showToast("success", "Saved and queued for Odoo.");
      void loadActionQueue();
    } catch { showToast("error", "Network error."); }
    setSavingId(null);
  }
  async function resendNow(item: ActionQueueItem) {
    if (!item.outboxId) { showToast("error", "No outbox entry found."); return; }
    setResendingId(item.outboxId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue/${item.outboxId}/resend-now`, { method: "POST", headers: jsonAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) { showToast("error", d.error ?? "Resend failed."); setResendingId(null); return; }
      if (d.odooMoveName) showToast("success", `Sent to Odoo: ${d.odooMoveName}`);
      else if (d.status === "failed") showToast("error", d.userError?.message ?? "Odoo rejected the entry.");
      else showToast("success", "Resent.");
      void loadActionQueue();
    } catch { showToast("error", "Network error."); }
    setResendingId(null);
  }
  async function reviewSale(id: string, action: "approve" | "reject") {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders/${id}/review`, { method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({ action }) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Review failed."); return; }
    showToast("success", action === "approve" ? "Sale approved." : "Sale rejected.");
    void loadAdvanced();
  }
  async function submitNewSale(e: React.FormEvent) {
    e.preventDefault();
    if (!newSale.flockId || !newSale.orderDate) { showToast("error", "Flock and date required."); return; }
    setSaleSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders`, { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify({ flockId: newSale.flockId, orderDate: newSale.orderDate, numberOfBirds: Number(newSale.numberOfBirds), totalWeightKg: Number(newSale.totalWeightKg), pricePerKg: Number(newSale.pricePerKg), buyerName: newSale.buyerName || null, buyerEmail: newSale.buyerEmail || null }) });
    const d = await r.json();
    setSaleSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Could not create sale."); return; }
    showToast("success", "Sale recorded.");
    setNewSale({ flockId: "", orderDate: "", numberOfBirds: "", totalWeightKg: "", pricePerKg: "", buyerName: "", buyerEmail: "" });
    void loadAdvanced();
  }
  async function submitPayrollClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!newClosure.periodStart || !newClosure.periodEnd) { showToast("error", "Period start and end required."); return; }
    setClosureSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/payroll-closures`, { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify(newClosure) });
    const d = await r.json();
    setClosureSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Payroll closure failed."); return; }
    showToast("success", `Period closed. Net: ${fmt(d.netPayrollRwf, 0)} RWF.`);
    setNewClosure({ periodStart: "", periodEnd: "", notes: "" });
    void loadAdvanced();
  }
  async function submitValuation(e: React.FormEvent) {
    e.preventDefault();
    const marketPrice = Number(newValuation.marketPricePerKgRwf);
    if (!newValuation.flockId || !newValuation.snapshotDate || !Number.isFinite(marketPrice) || marketPrice <= 0) { showToast("error", "Flock, date, and market price required."); return; }
    setValuationSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots`, { method: "POST", headers: jsonAuthHeaders(token), body: JSON.stringify({ flockId: newValuation.flockId, snapshotDate: newValuation.snapshotDate, marketPricePerKgRwf: marketPrice, costsToSellPerKgRwf: Number(newValuation.costsToSellPerKgRwf) || 0 }) });
    const d = await r.json();
    setValuationSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Failed to create snapshot."); return; }
    showToast("success", "Valuation snapshot created.");
    setNewValuation(p => ({ ...p, marketPricePerKgRwf: "", costsToSellPerKgRwf: "" }));
    void loadAdvanced();
  }
  async function approveValuation(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots/${id}/approve`, { method: "PATCH", headers: jsonAuthHeaders(token) });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Valuation approved.");
    void loadAdvanced();
  }

  if (!isManager) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-[var(--text-muted)]">
        Manager or above access required.
      </div>
    );
  }

  // ── Computed counts ──
  const filteredActionQueue = useMemo(() => {
    const q = actionSearch.trim().toLowerCase();
    if (!q) return actionQueue;
    return actionQueue.filter(item => {
      const hay = [eventTypeLabel(item.eventType), item.sourceId, item.summary.label, item.summary.detail, item.userError?.message ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [actionQueue, actionSearch]);

  const totalFailed = actionQueue.filter(i => i.outboxStatus === "failed").length;
  const totalPending = actionQueue.filter(i => i.sourceStatus === "pending_approval" && i.outboxStatus !== "failed").length;
  const totalNotQueued = actionQueue.filter(i => i.outboxStatus === "not_queued" && i.sourceStatus !== "pending_approval").length;
  const needsActionCount = totalFailed + totalPending + totalNotQueued;

  const inboxTotal = feedRows.length + medRows.length + slaughterRows.length + mortalityRows.length;

  const filteredOutbox = useMemo(() => {
    if (outboxFilter === "all") return outboxRows;
    return outboxRows.filter(r => r.status === outboxFilter);
  }, [outboxRows, outboxFilter]);

  const failedItems = filteredActionQueue.filter(i => i.outboxStatus === "failed");
  const pendingApprovalItems = filteredActionQueue.filter(i => i.sourceStatus === "pending_approval" && i.outboxStatus !== "failed");
  const notQueuedItems = filteredActionQueue.filter(i => i.outboxStatus === "not_queued" && i.sourceStatus !== "pending_approval");

  // ── Tab config ──
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "action", label: "Needs Action", badge: needsActionCount || undefined },
    { id: "inbox", label: "Approvals Inbox", badge: inboxTotal || undefined },
    { id: "sync", label: "Sync Log" },
    { id: "advanced", label: "Advanced" },
  ];

  // ── Input/button classes ──
  const inputCls = "w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)]";
  const btnPrimary = "rounded-[var(--radius-md)] bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50 transition-colors";
  const btnGhost = "rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-0 pb-12">
      <PageHeader title="Accounting Approvals" subtitle="Review and send financial records to Odoo" />

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-subtle)] p-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
              tab === t.id
                ? "bg-[var(--surface-color)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none", tab === t.id && t.id === "action" ? "bg-red-500 text-white" : "bg-[var(--primary-color)] text-white"].join(" ")}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ NEEDS ACTION ══════════════ */}
      {tab === "action" && (
        <section className="space-y-4">
          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Failed", count: totalFailed, cls: "border-red-500/30", numCls: "text-red-400" },
              { label: "Awaiting approval", count: totalPending, cls: "border-blue-500/30", numCls: "text-blue-400" },
              { label: "Not yet queued", count: totalNotQueued, cls: "border-amber-500/30", numCls: "text-amber-400" },
            ].map(s => (
              <div key={s.label} className={["rounded-[var(--radius-lg)] border bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-sm)]", s.cls].join(" ")}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{s.label}</p>
                <p className={["text-2xl font-bold tabular-nums mt-1", s.numCls].join(" ")}>{actionLoading ? "…" : s.count}</p>
              </div>
            ))}
          </div>

          {/* Search bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={actionSearch}
              onChange={e => setActionSearch(e.target.value)}
              placeholder="Search by event, flock, supplier, ID, or error…"
              className={[inputCls, "flex-1 min-w-[14rem]"].join(" ")}
            />
            {actionSearch && <button onClick={() => setActionSearch("")} className={btnGhost}>Clear</button>}
            <button onClick={loadActionQueue} className={btnGhost}>Refresh</button>
          </div>

          {actionSearch && (
            <p className="text-xs text-[var(--text-muted)]">
              Showing {filteredActionQueue.length} of {actionQueue.length} items
            </p>
          )}

          {actionLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}

          {!actionLoading && filteredActionQueue.length === 0 && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {actionQueue.length === 0 ? "All caught up — no records need attention." : "No records match your search."}
              </p>
            </div>
          )}

          {failedItems.length > 0 && (
            <QueueGroup label="Failed — Odoo rejected or connection error" count={failedItems.length} color="red">
              {failedItems.map(item => (
                <ActionQueueCard key={item.sourceId} item={item}
                  editForm={editForms[item.sourceId] ?? {}}
                  onFieldChange={(key, val) => setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))}
                  isSaving={savingId === item.sourceId}
                  isResending={resendingId === item.outboxId}
                  onSave={() => saveAndSendQueueItem(item)}
                  onResend={() => resendNow(item)}
                  tone="red"
                />
              ))}
            </QueueGroup>
          )}

          {pendingApprovalItems.length > 0 && (
            <QueueGroup label="Awaiting your approval before sending to Odoo" count={pendingApprovalItems.length} color="blue">
              {pendingApprovalItems.map(item => (
                <ActionQueueCard key={item.sourceId} item={item}
                  editForm={editForms[item.sourceId] ?? {}}
                  onFieldChange={(key, val) => setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))}
                  isSaving={savingId === item.sourceId}
                  isResending={resendingId === item.outboxId}
                  onSave={() => saveAndSendQueueItem(item)}
                  onResend={() => resendNow(item)}
                  tone="blue"
                />
              ))}
            </QueueGroup>
          )}

          {notQueuedItems.length > 0 && (
            <QueueGroup label="Not yet sent — complete details to send" count={notQueuedItems.length} color="amber">
              {notQueuedItems.map(item => (
                <ActionQueueCard key={item.sourceId} item={item}
                  editForm={editForms[item.sourceId] ?? {}}
                  onFieldChange={(key, val) => setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))}
                  isSaving={savingId === item.sourceId}
                  isResending={resendingId === item.outboxId}
                  onSave={() => saveAndSendQueueItem(item)}
                  onResend={() => resendNow(item)}
                  tone="amber"
                />
              ))}
            </QueueGroup>
          )}
        </section>
      )}

      {/* ══════════════ APPROVALS INBOX ══════════════ */}
      {tab === "inbox" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-muted)]">
              All items waiting for your approval before being sent to Odoo.
            </p>
            <button onClick={loadInbox} className={btnGhost}>Refresh</button>
          </div>

          {inboxLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}

          {!inboxLoading && inboxTotal === 0 && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">No items pending approval.</p>
            </div>
          )}

          {/* Feed */}
          {feedRows.map(row => (
            <InboxCard
              key={row.id}
              type="feed_purchase"
              title={`${row.feedType ? row.feedType.charAt(0).toUpperCase() + row.feedType.slice(1) : "Feed"} — ${fmt(row.quantityKg, 1)} kg`}
              meta={[fmtDate(row.recordedAt), row.supplierName ?? "Supplier unknown", row.unitCostRwfPerKg != null ? `${fmt(row.unitCostRwfPerKg, 0)} RWF/kg` : null, row.actorName ? `By ${row.actorName}` : null].filter(Boolean) as string[]}
              status={row.accountingStatus}
              onApprove={() => approveFeed(row.id)}
            />
          ))}

          {/* Medicine */}
          {medRows.map(row => (
            <InboxCard
              key={row.id}
              type="medicine_purchase"
              title={`${row.medicineName} — Lot ${row.lotNumber}`}
              meta={[fmtDate(row.receivedAt), row.supplier ?? "Supplier unknown", `${fmt(row.quantityReceived)} units`, row.unitCostRwf != null ? `${fmt(row.unitCostRwf, 0)} RWF/unit` : null].filter(Boolean) as string[]}
              status={row.accountingStatus}
              onApprove={() => approveMed(row.id)}
            />
          ))}

          {/* Slaughter */}
          {slaughterRows.map(row => {
            const form = slaughterForms[row.id] ?? { fairValue: "", carryingValue: "" };
            const totalKg = row.avgCarcassWeightKg != null ? row.birdsSlaughtered * row.avgCarcassWeightKg : row.birdsSlaughtered * row.avgLiveWeightKg;
            return (
              <div key={row.id} className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 space-y-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={["text-[11px] font-semibold border px-2 py-0.5 rounded-full", eventTypeBadgeColor("slaughter_conversion")].join(" ")}>Slaughter</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">Flock {row.flockCode ?? row.flockId}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{fmtDate(row.at)} · {fmt(row.birdsSlaughtered)} birds · ~{fmt(totalKg, 0)} kg</p>
                  </div>
                  <OdooSyncBadge status={row.accountingStatus} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Fair value of meat stock (RWF) <span className="text-red-400">*</span></label>
                    <input type="number" placeholder="e.g. 540000" value={form.fairValue}
                      onChange={e => setSlaughterForms(p => ({ ...p, [row.id]: { ...form, fairValue: e.target.value } }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Previous carrying value (RWF)</label>
                    <input type="number" placeholder="Leave blank to use fair value" value={form.carryingValue}
                      onChange={e => setSlaughterForms(p => ({ ...p, [row.id]: { ...form, carryingValue: e.target.value } }))}
                      className={inputCls} />
                  </div>
                </div>
                <button onClick={() => approveSlaughter(row.id)} className={btnPrimary}>Confirm & send to Odoo</button>
              </div>
            );
          })}

          {/* Mortality */}
          {mortalityRows.map(row => (
            <div key={row.id} className="rounded-[var(--radius-lg)] border border-red-500/20 bg-[var(--surface-card)] p-4 space-y-3 shadow-[var(--shadow-sm)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={["text-[11px] font-semibold border px-2 py-0.5 rounded-full", eventTypeBadgeColor("mortality_impairment")].join(" ")}>Mortality</span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Flock {row.flockCode ?? row.flockId}</span>
                  </div>
                  <p className="text-xs text-red-400 font-medium mt-0.5">{fmt(row.count)} birds dead{row.cause ? ` — ${row.cause}` : ""}</p>
                  <p className="text-xs text-[var(--text-muted)]">{fmtDate(row.at)}</p>
                </div>
                <OdooSyncBadge status={row.accountingStatus} />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Estimated fair value of dead birds (RWF)</label>
                  <input type="number" placeholder="e.g. 85000"
                    value={mortalityForms[row.id] ?? ""}
                    onChange={e => setMortalityForms(p => ({ ...p, [row.id]: e.target.value }))}
                    className={inputCls} />
                </div>
                <button onClick={() => approveMortality(row.id)} className={btnPrimary}>Record loss in Odoo</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ══════════════ SYNC LOG ══════════════ */}
      {tab === "sync" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1">
              {(["all", "sent", "failed", "pending"] as const).map(f => (
                <button key={f} onClick={() => setOutboxFilter(f)}
                  className={["px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium border transition-colors capitalize",
                    outboxFilter === f
                      ? "bg-[var(--primary-color)] text-white border-[var(--primary-color)]"
                      : "border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--surface-card)]"
                  ].join(" ")}>
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={loadOutbox} className={btnGhost}>Refresh</button>
          </div>

          {outboxLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--table-header-bg)]">
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Odoo document</th>
                    <th className="px-4 py-2.5 text-center">Tries</th>
                    <th className="px-4 py-2.5">Last tried</th>
                    <th className="px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutbox.map(row => (
                    <tr key={row.id} className="border-b border-[var(--border-color)] hover:bg-[var(--table-row-hover)] transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={["text-[11px] font-medium border px-2 py-0.5 rounded-full", eventTypeBadgeColor(row.eventType)].join(" ")}>
                          {eventTypeLabel(row.eventType)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <OdooSyncBadge status={row.status === "sent" ? "sent_to_odoo" : row.status === "failed" ? "failed" : "approved"} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{row.odooMoveName || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-[var(--text-muted)]">{row.attempts}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{row.lastAttemptedAt ? fmtDate(row.lastAttemptedAt) : "—"}</td>
                      <td className="px-4 py-2.5 space-y-1">
                        {(row.status === "failed" || row.status === "pending") && (
                          <button onClick={() => retryOutbox(row.id)} className="text-xs text-[var(--primary-color)] hover:underline font-medium">
                            {row.status === "pending" ? "Resend" : "Retry"}
                          </button>
                        )}
                        {row.lastError && (
                          <details>
                            <summary className="text-xs text-red-400 cursor-pointer font-medium">Error</summary>
                            <p className="text-xs text-red-400 max-w-xs mt-1 opacity-80">{row.lastError}</p>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!outboxLoading && filteredOutbox.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No sync events found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════ ADVANCED ══════════════ */}
      {tab === "advanced" && (
        <section className="space-y-8">
          {/* Meat Sales */}
          <div className="space-y-3">
            <SectionLabel icon="🐓" text="Meat sales" />
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-medium text-[var(--text-primary)] mb-3">Record a new sale</p>
              <form onSubmit={submitNewSale} className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Flock</label>
                  <select value={newSale.flockId} onChange={e => setNewSale(p => ({ ...p, flockId: e.target.value }))} className={inputCls} required>
                    <option value="">Select flock</option>
                    {financeFlocks.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Sale date</label><input type="date" value={newSale.orderDate} onChange={e => setNewSale(p => ({ ...p, orderDate: e.target.value }))} className={inputCls} required /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Number of birds</label><input type="number" placeholder="e.g. 500" value={newSale.numberOfBirds} onChange={e => setNewSale(p => ({ ...p, numberOfBirds: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Total weight (kg)</label><input type="number" placeholder="e.g. 1500" value={newSale.totalWeightKg} onChange={e => setNewSale(p => ({ ...p, totalWeightKg: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Price per kg (RWF)</label><input type="number" placeholder="e.g. 3500" value={newSale.pricePerKg} onChange={e => setNewSale(p => ({ ...p, pricePerKg: e.target.value }))} className={inputCls} /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Buyer name</label><input placeholder="Optional" value={newSale.buyerName} onChange={e => setNewSale(p => ({ ...p, buyerName: e.target.value }))} className={inputCls} /></div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={saleSubmitting} className={btnPrimary}>{saleSubmitting ? "Saving…" : "Record sale"}</button>
                </div>
              </form>
            </div>
            {saleLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
            <div className="space-y-2">
              {saleOrders.map(o => (
                <div key={o.id} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] p-3 flex items-start justify-between gap-3">
                  <div className="text-sm space-y-0.5">
                    <div className="font-medium text-[var(--text-primary)]">Flock {o.flockCode ?? o.flockId} — {fmtDate(o.orderDate)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{fmt(o.numberOfBirds)} birds · {fmt(o.totalWeightKg, 0)} kg · {fmt(o.pricePerKg, 0)} RWF/kg</div>
                    <div className="flex gap-2 mt-1">
                      <span className={["text-xs px-2 py-0.5 rounded-full font-medium", o.submissionStatus === "approved" ? "bg-emerald-500/15 text-emerald-400" : o.submissionStatus === "rejected" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"].join(" ")}>
                        {o.submissionStatus === "approved" ? "Approved" : o.submissionStatus === "rejected" ? "Rejected" : "Pending review"}
                      </span>
                      <OdooSyncBadge status={o.accountingStatus} odooMoveName={o.odooMoveName || null} />
                    </div>
                  </div>
                  {o.submissionStatus === "pending_review" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => reviewSale(o.id, "approve")} className="bg-[var(--primary-color)] text-white text-xs px-3 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--primary-color-dark)]">Approve</button>
                      <button onClick={() => reviewSale(o.id, "reject")} className="border border-red-500/30 text-red-400 text-xs px-3 py-1.5 rounded-[var(--radius-sm)] hover:bg-red-500/10">Reject</button>
                    </div>
                  )}
                </div>
              ))}
              {!saleLoading && saleOrders.length === 0 && <p className="text-sm text-[var(--text-muted)]">No sales recorded yet.</p>}
            </div>
          </div>

          {/* Payroll */}
          <div className="space-y-3">
            <SectionLabel icon="💼" text="Payroll period closure" />
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
              <form onSubmit={submitPayrollClosure} className="grid sm:grid-cols-2 gap-3">
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Period start</label><input type="date" value={newClosure.periodStart} onChange={e => setNewClosure(p => ({ ...p, periodStart: e.target.value }))} className={inputCls} required /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Period end</label><input type="date" value={newClosure.periodEnd} onChange={e => setNewClosure(p => ({ ...p, periodEnd: e.target.value }))} className={inputCls} required /></div>
                <div className="sm:col-span-2"><label className="block text-xs text-[var(--text-muted)] mb-1">Notes (optional)</label><input value={newClosure.notes} onChange={e => setNewClosure(p => ({ ...p, notes: e.target.value }))} className={inputCls} placeholder="e.g. April 2026 wages" /></div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={closureSubmitting} className={btnPrimary}>{closureSubmitting ? "Processing…" : "Close period & send to Odoo"}</button>
                </div>
              </form>
            </div>
            {payrollLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
            <div className="space-y-2">
              {payrollClosures.map(c => (
                <div key={c.id} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] p-3 flex items-start justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium text-[var(--text-primary)]">{fmtDate(c.periodStart)} → {fmtDate(c.periodEnd)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{fmt(c.workerCount)} workers · net <span className="text-[var(--text-secondary)] font-medium">{fmt(c.netPayrollRwf, 0)} RWF</span></div>
                  </div>
                  <OdooSyncBadge status={c.accountingStatus} odooMoveName={c.odooMoveName} />
                </div>
              ))}
              {!payrollLoading && payrollClosures.length === 0 && <p className="text-sm text-[var(--text-muted)]">No payroll periods closed yet.</p>}
            </div>
          </div>

          {/* IAS41 Valuation */}
          <div className="space-y-3">
            <SectionLabel icon="📊" text="IAS 41 flock valuation" />
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
              <form onSubmit={submitValuation} className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Flock</label>
                  <select value={newValuation.flockId} onChange={e => setNewValuation(p => ({ ...p, flockId: e.target.value }))} className={inputCls} required>
                    <option value="">Select flock</option>
                    {financeFlocks.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Valuation date</label><input type="date" value={newValuation.snapshotDate} onChange={e => setNewValuation(p => ({ ...p, snapshotDate: e.target.value }))} className={inputCls} required /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Market price (RWF/kg live weight)</label><input type="number" placeholder="e.g. 3500" value={newValuation.marketPricePerKgRwf} onChange={e => setNewValuation(p => ({ ...p, marketPricePerKgRwf: e.target.value }))} className={inputCls} required /></div>
                <div><label className="block text-xs text-[var(--text-muted)] mb-1">Selling costs (RWF/kg)</label><input type="number" placeholder="e.g. 200" value={newValuation.costsToSellPerKgRwf} onChange={e => setNewValuation(p => ({ ...p, costsToSellPerKgRwf: e.target.value }))} className={inputCls} /></div>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={valuationSubmitting} className={btnPrimary}>{valuationSubmitting ? "Calculating…" : "Calculate & save draft"}</button>
                </div>
              </form>
            </div>
            {valuationLoading && <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading…</p>}
            <div className="space-y-2">
              {valuationSnapshots.map(snap => (
                <div key={snap.id} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <div className="font-medium text-[var(--text-primary)]">Flock {snap.flockCode ?? snap.flockId} — {fmtDate(snap.snapshotDate)}</div>
                      <div className="text-xs text-[var(--text-muted)]">{fmt(snap.liveCount)} birds · {fmt(snap.totalLiveWeightKg, 0)} kg live weight</div>
                      <div className="text-sm font-semibold text-emerald-500">
                        Fair value: {fmt(snap.totalFairValueRwf, 0)} RWF
                        {snap.fairValueChangeRwf != null && (
                          <span className={["ml-2 text-xs", snap.fairValueChangeRwf >= 0 ? "text-emerald-400" : "text-red-400"].join(" ")}>
                            ({snap.fairValueChangeRwf >= 0 ? "+" : ""}{fmt(snap.fairValueChangeRwf, 0)} RWF)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={["text-xs px-2 py-0.5 rounded-full font-medium", snap.status === "approved" || snap.status === "posted" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"].join(" ")}>
                        {snap.status === "draft" ? "Draft" : snap.status === "approved" ? "Approved" : "Posted"}
                      </span>
                      {snap.status === "draft" && (
                        <button onClick={() => approveValuation(snap.id)} className="bg-[var(--primary-color)] text-white text-xs px-3 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--primary-color-dark)]">Approve</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!valuationLoading && valuationSnapshots.length === 0 && <p className="text-sm text-[var(--text-muted)]">No valuations created yet.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{text}</h3>
      <div className="flex-1 h-px bg-[var(--border-color)]" />
    </div>
  );
}

function QueueGroup({ label, count, color, children }: { label: string; count: number; color: "red" | "blue" | "amber"; children: React.ReactNode }) {
  const clr = {
    red: { dot: "bg-red-500", label: "text-red-400", badge: "bg-red-500/15 text-red-400" },
    blue: { dot: "bg-blue-500", label: "text-blue-400", badge: "bg-blue-500/15 text-blue-400" },
    amber: { dot: "bg-amber-500", label: "text-amber-400", badge: "bg-amber-500/15 text-amber-400" },
  }[color];
  return (
    <div className="space-y-2">
      <h3 className={["text-sm font-semibold flex items-center gap-2", clr.label].join(" ")}>
        <span className={["w-2 h-2 rounded-full shrink-0", clr.dot].join(" ")} />
        {label}
        <span className={["rounded-full px-2 py-0.5 text-xs font-medium", clr.badge].join(" ")}>{count}</span>
      </h3>
      {children}
    </div>
  );
}

function InboxCard({ type, title, meta, status, onApprove }: { type: string; title: string; meta: string[]; status: string; onApprove: () => void }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-4 flex items-start justify-between gap-4 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={["text-[11px] font-semibold border px-2 py-0.5 rounded-full", eventTypeBadgeColor(type)].join(" ")}>
            {eventTypeLabel(type)}
          </span>
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{title}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {meta.map((m, i) => <span key={i} className="text-xs text-[var(--text-muted)]">{m}</span>)}
        </div>
        <OdooSyncBadge status={status} />
      </div>
      <button onClick={onApprove} className="shrink-0 bg-[var(--primary-color)] text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-[var(--primary-color-dark)] font-semibold transition-colors">
        Approve & send
      </button>
    </div>
  );
}

// ─── ActionQueueCard ───────────────────────────────────────────────────────────

function ActionQueueCard({
  item, editForm, onFieldChange, isSaving, isResending, onSave, onResend, tone,
}: {
  item: ActionQueueItem; editForm: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  isSaving: boolean; isResending: boolean;
  onSave: () => void; onResend: () => void;
  tone: "red" | "blue" | "amber";
}) {
  const canResend = item.outboxId != null && item.outboxStatus === "failed";
  const traceHref = `${API_BASE_URL}/api/accounting-approvals/trace?sourceTable=${encodeURIComponent(item.sourceTable)}&sourceId=${encodeURIComponent(item.sourceId)}`;
  const borderCls = {
    red: "border-red-500/20 bg-[var(--surface-card)]",
    blue: "border-blue-500/20 bg-[var(--surface-card)]",
    amber: "border-amber-500/20 bg-[var(--surface-card)]",
  }[tone];
  const inputCls = "w-full rounded-[var(--radius-md)] border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30 focus:border-[var(--primary-color)]";

  return (
    <div className={["rounded-[var(--radius-lg)] border p-4 space-y-3 shadow-[var(--shadow-sm)]", borderCls].join(" ")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={["text-[11px] font-semibold border px-2 py-0.5 rounded-full", eventTypeBadgeColor(item.eventType)].join(" ")}>
              {eventTypeLabel(item.eventType)}
            </span>
            <OdooSyncBadge status={item.outboxStatus === "failed" ? "failed" : item.sourceStatus === "pending_approval" ? "pending_approval" : "approved"} />
          </div>
          <div className="font-medium text-sm text-[var(--text-primary)]">{item.summary.label}</div>
          <div className="text-xs text-[var(--text-muted)]">{item.summary.detail}</div>
          {item.attempts > 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              {item.attempts} attempt{item.attempts !== 1 ? "s" : ""}
              {item.lastAttemptedAt ? ` · last tried ${new Date(item.lastAttemptedAt).toLocaleString()}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a href={traceHref} target="_blank" rel="noreferrer"
            className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]">
            Trace
          </a>
        </div>
      </div>

      {item.userError && (
        <div className="rounded-[var(--radius-md)] border border-red-500/20 bg-red-500/8 px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-red-400">Reason for failure</div>
          <div className="text-sm text-red-300">{item.userError.message}</div>
          {item.userError.category === "connection_error" && (
            <div className="text-xs text-red-400 opacity-80">Tip: Try "Resend without changes" — the data may be fine.</div>
          )}
        </div>
      )}

      {item.fixableFields.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
            {item.outboxStatus === "failed" ? "Correct fields, then resend:" : "Complete these to send:"}
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {item.fixableFields.map(field => (
              <div key={field.key}>
                <label className="block text-xs text-[var(--text-muted)] mb-0.5">
                  {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type}
                  placeholder={field.type === "number" ? "0" : ""}
                  value={editForm[field.key] ?? (field.value != null ? String(field.value) : "")}
                  onChange={e => onFieldChange(field.key, e.target.value)}
                  className={inputCls}
                />
                {field.hint && <p className="text-xs text-[var(--text-muted)] mt-0.5 opacity-70">{field.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button onClick={onSave} disabled={isSaving || isResending}
          className="bg-[var(--primary-color)] text-white text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-[var(--primary-color-dark)] disabled:opacity-50 font-semibold transition-colors">
          {isSaving ? "Saving…" : actionLabel(item)}
        </button>
        {canResend && (
          <button onClick={onResend} disabled={isSaving || isResending}
            className="border border-[var(--border-color)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] text-sm px-4 py-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-card)] disabled:opacity-50 transition-colors">
            {isResending ? "Sending…" : "Resend without changes"}
          </button>
        )}
      </div>
    </div>
  );
}
