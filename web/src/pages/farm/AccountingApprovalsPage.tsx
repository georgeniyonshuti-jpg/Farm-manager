/**
 * Accounting Approvals & Recovery Page
 *
 * Manager+ dashboard for:
 *  - Needs Action queue: view all unsent/failed Odoo items, fix inline, resend
 *  - Reviewing pending feed procurement / medicine / slaughter events for Odoo
 *  - Recording and approving meat sales
 *  - Monitoring Odoo sync outbox (sent, failed, retry)
 *
 * Plain language only — no accounting jargon for non-accountant managers.
 */

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { roleAtLeast } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { OdooSyncBadge } from "../../components/accounting/OdooSyncBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedRow = {
  id: string;
  recordedAt: string;
  quantityKg: number;
  unitCostRwfPerKg: number | null;
  feedType: string | null;
  supplierName: string | null;
  reference: string;
  accountingStatus: string;
  actorName: string | null;
};

type MedicineLotRow = {
  id: string;
  lotNumber: string;
  receivedAt: string;
  quantityReceived: number;
  unitCostRwf: number | null;
  totalCostRwf: number | null;
  supplier: string | null;
  invoiceRef: string | null;
  accountingStatus: string;
  medicineName: string;
};

type SlaughterRow = {
  id: string;
  flockId: string;
  flockCode: string | null;
  at: string;
  birdsSlaughtered: number;
  avgLiveWeightKg: number;
  avgCarcassWeightKg: number | null;
  pricePerKgRwf: number | null;
  fairValueRwf: number | null;
  accountingStatus: string;
};

type SaleOrder = {
  id: string;
  flockId: string;
  flockCode: string | null;
  orderDate: string;
  numberOfBirds: number;
  totalWeightKg: number;
  pricePerKg: number;
  buyerName: string | null;
  submissionStatus: string;
  accountingStatus: string;
  odooMoveName: string;
  odooMoveState: string;
};

type OutboxRow = {
  id: string;
  sourceTable: string;
  sourceId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastAttemptedAt: string | null;
  lastError: string | null;
  odooMoveId: number | null;
  odooMoveName: string | null;
  createdAt: string;
};

type ValuationSnapshot = {
  id: string;
  flockId: string;
  flockCode: string | null;
  snapshotDate: string;
  liveCount: number;
  avgWeightKg: number;
  totalLiveWeightKg: number;
  marketPricePerKgRwf: number;
  costsToSellPerKgRwf: number;
  fairValuePerKgRwf: number;
  totalFairValueRwf: number;
  fairValueChangeRwf: number | null;
  fcrAtSnapshot: number | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

type MortalityRow = {
  id: string;
  flockId: string;
  flockCode: string | null;
  at: string;
  count: number;
  cause: string | null;
  notes: string | null;
  impairmentValueRwf: number | null;
  accountingStatus: string;
};

type PayrollClosure = {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalCreditsRwf: number;
  totalDeductionsRwf: number;
  netPayrollRwf: number;
  workerCount: number;
  accountingStatus: string;
  odooMoveName: string | null;
  approvedAt: string;
};

type Tab = "action" | "feed" | "medicine" | "slaughter" | "sales" | "mortality" | "payroll" | "valuation" | "outbox";

type FixableField = {
  key: string;
  label: string;
  type: "text" | "number" | "email" | "date";
  value: string | number | null;
  required: boolean;
  hint?: string;
};

type UserError = { category: string; message: string } | null;

type ActionQueueItem = {
  eventType: string;
  sourceTable: string;
  sourceId: string;
  outboxId: string | null;
  eventAt: string;
  sourceStatus: string;
  outboxStatus: string;
  attempts: number;
  lastAttemptedAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  userError: UserError;
  recordData: Record<string, unknown>;
  summary: { label: string; detail: string };
  fixableFields: FixableField[];
};

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
    meat_sale: "Meat sale invoice",
    fcr_fair_value_adjustment: "FCR fair value adjustment",
    payroll_wages: "Payroll wages",
    payroll_expense: "Payroll expense",
    mortality_impairment: "Mortality impairment",
    bio_asset_opening: "Flock opening (chick purchase)",
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

function actionLabel(item: ActionQueueItem): string {
  if (item.outboxStatus === "failed") return "Fix & send to Odoo";
  if (item.sourceStatus === "pending_approval") return "Approve & send to Odoo";
  return "Send to Odoo";
}


// ─── Main Component ───────────────────────────────────────────────────────────

export function AccountingApprovalsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isManager = roleAtLeast(user, "manager");
  const [tab, setTab] = useState<Tab>("action");

  // Feed
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // Medicine
  const [medRows, setMedRows] = useState<MedicineLotRow[]>([]);
  const [medLoading, setMedLoading] = useState(false);

  // Slaughter
  const [slaughterRows, setSlaughterRows] = useState<SlaughterRow[]>([]);
  const [slaughterLoading, setSlaughterLoading] = useState(false);
  const [slaughterApprovalForm, setSlaughterApprovalForm] = useState<Record<string, { fairValue: string; carryingValue: string }>>({});

  // Sales
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [saleLoading, setSaleLoading] = useState(false);
  const [newSale, setNewSale] = useState({ flockId: "", orderDate: "", numberOfBirds: "", totalWeightKg: "", pricePerKg: "", buyerName: "", buyerEmail: "" });
  const [saleSubmitting, setSaleSubmitting] = useState(false);

  // Mortality
  const [mortalityRows, setMortalityRows] = useState<MortalityRow[]>([]);
  const [mortalityLoading, setMortalityLoading] = useState(false);
  const [mortalityImpairmentForm, setMortalityImpairmentForm] = useState<Record<string, string>>({});

  // Payroll closures
  const [payrollClosures, setPayrollClosures] = useState<PayrollClosure[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [newClosure, setNewClosure] = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [closureSubmitting, setClosureSubmitting] = useState(false);

  // Valuation
  const [valuationSnapshots, setValuationSnapshots] = useState<ValuationSnapshot[]>([]);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [newValuation, setNewValuation] = useState({ flockId: "", snapshotDate: new Date().toISOString().slice(0, 10), marketPricePerKgRwf: "", costsToSellPerKgRwf: "" });
  const [valuationSubmitting, setValuationSubmitting] = useState(false);

  // Action queue
  const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [editForms, setEditForms] = useState<Record<string, Record<string, string>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Outbox
  const [outboxRows, setOutboxRows] = useState<OutboxRow[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);

  // ── Loaders ──
  const loadActionQueue = useCallback(async () => {
    setActionLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      const items: ActionQueueItem[] = d.items ?? [];
      setActionQueue(items);
      // Seed edit forms from fixableFields for new items not yet edited
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

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/feed-procurements/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setFeedRows(d.rows ?? []);
    } catch { /* handled by empty list */ }
    setFeedLoading(false);
  }, [token]);

  const loadMed = useCallback(async () => {
    setMedLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/medicine-lots/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setMedRows(d.rows ?? []);
    } catch { /* */ }
    setMedLoading(false);
  }, [token]);

  const loadSlaughter = useCallback(async () => {
    setSlaughterLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/slaughter-events/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setSlaughterRows(d.rows ?? []);
    } catch { /* */ }
    setSlaughterLoading(false);
  }, [token]);

  const loadSales = useCallback(async () => {
    setSaleLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setSaleOrders(d.orders ?? []);
    } catch { /* */ }
    setSaleLoading(false);
  }, [token]);

  const loadMortality = useCallback(async () => {
    setMortalityLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/mortality-events/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setMortalityRows(d.rows ?? []);
    } catch { /* */ }
    setMortalityLoading(false);
  }, [token]);

  const loadPayrollClosures = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/payroll-closures`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setPayrollClosures(d.closures ?? []);
    } catch { /* */ }
    setPayrollLoading(false);
  }, [token]);

  const loadValuation = useCallback(async () => {
    setValuationLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      setValuationSnapshots(d.snapshots ?? []);
    } catch { /* */ }
    setValuationLoading(false);
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

  useEffect(() => {
    if (!isManager) return;
    if (tab === "action") loadActionQueue();
    else if (tab === "feed") loadFeed();
    else if (tab === "medicine") loadMed();
    else if (tab === "slaughter") loadSlaughter();
    else if (tab === "sales") loadSales();
    else if (tab === "mortality") loadMortality();
    else if (tab === "payroll") loadPayrollClosures();
    else if (tab === "valuation") loadValuation();
    else if (tab === "outbox") loadOutbox();
  }, [tab, isManager, loadActionQueue, loadFeed, loadMed, loadSlaughter, loadSales, loadMortality, loadPayrollClosures, loadValuation, loadOutbox]);

  // ── Actions ──
  async function approveFeed(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/feed-procurements/${id}/approve`, {
      method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Feed purchase sent to Odoo as draft bill.");
    loadFeed();
  }

  async function approveMed(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/medicine-lots/${id}/approve`, {
      method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Medicine purchase sent to Odoo as draft bill.");
    loadMed();
  }

  async function approveSlaughter(id: string) {
    const form = slaughterApprovalForm[id] ?? { fairValue: "", carryingValue: "" };
    const fairValueRwf = Number(form.fairValue);
    if (!Number.isFinite(fairValueRwf) || fairValueRwf <= 0) {
      showToast("error", "Enter a valid fair value (RWF) before approving.");
      return;
    }
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/slaughter-events/${id}/approve`, {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ fairValueRwf, carryingValueRwf: Number(form.carryingValue) || fairValueRwf }),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Slaughter conversion sent to Odoo as draft journal entry.");
    loadSlaughter();
  }

  async function reviewSale(id: string, action: "approve" | "reject") {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders/${id}/review`, {
      method: "PATCH", headers: jsonAuthHeaders(token), body: JSON.stringify({ action }),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Review failed."); return; }
    showToast("success", action === "approve" ? "Sale approved and sent to Odoo." : "Sale rejected.");
    loadSales();
  }

  async function submitNewSale(e: React.FormEvent) {
    e.preventDefault();
    if (!newSale.flockId || !newSale.orderDate) { showToast("error", "Flock and date are required."); return; }
    setSaleSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/sales-orders`, {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({
        flockId: newSale.flockId,
        orderDate: newSale.orderDate,
        numberOfBirds: Number(newSale.numberOfBirds),
        totalWeightKg: Number(newSale.totalWeightKg),
        pricePerKg: Number(newSale.pricePerKg),
        buyerName: newSale.buyerName || null,
        buyerEmail: newSale.buyerEmail || null,
      }),
    });
    const d = await r.json();
    setSaleSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Could not create sale."); return; }
    showToast("success", "Sale recorded.");
    setNewSale({ flockId: "", orderDate: "", numberOfBirds: "", totalWeightKg: "", pricePerKg: "", buyerName: "", buyerEmail: "" });
    loadSales();
  }

  async function approveMortality(id: string) {
    const impairmentValueRwf = Number(mortalityImpairmentForm[id] ?? "0");
    if (!Number.isFinite(impairmentValueRwf) || impairmentValueRwf < 0) {
      showToast("error", "Enter a valid impairment value (RWF) before approving.");
      return;
    }
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/mortality-events/${id}/approve`, {
      method: "PATCH",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ impairmentValueRwf }),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Mortality impairment sent to Odoo as draft journal entry.");
    loadMortality();
  }

  async function submitPayrollClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!newClosure.periodStart || !newClosure.periodEnd) { showToast("error", "Period start and end are required."); return; }
    setClosureSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/payroll-closures`, {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify(newClosure),
    });
    const d = await r.json();
    setClosureSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Payroll closure failed."); return; }
    showToast("success", `Payroll period closed. Net: ${fmt(d.netPayrollRwf, 0)} RWF for ${d.workerCount} workers. Sent to Odoo.`);
    setNewClosure({ periodStart: "", periodEnd: "", notes: "" });
    loadPayrollClosures();
  }

  async function submitValuation(e: React.FormEvent) {
    e.preventDefault();
    const marketPrice = Number(newValuation.marketPricePerKgRwf);
    if (!newValuation.flockId || !newValuation.snapshotDate || !Number.isFinite(marketPrice) || marketPrice <= 0) {
      showToast("error", "Flock ID, date and market price are required.");
      return;
    }
    setValuationSubmitting(true);
    const r = await fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots`, {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({
        flockId: newValuation.flockId,
        snapshotDate: newValuation.snapshotDate,
        marketPricePerKgRwf: marketPrice,
        costsToSellPerKgRwf: Number(newValuation.costsToSellPerKgRwf) || 0,
      }),
    });
    const d = await r.json();
    setValuationSubmitting(false);
    if (!r.ok) { showToast("error", d.error ?? "Failed to create snapshot."); return; }
    showToast("success", "Valuation snapshot created. Review and approve to send to Odoo.");
    setNewValuation(p => ({ ...p, marketPricePerKgRwf: "", costsToSellPerKgRwf: "" }));
    loadValuation();
  }

  async function approveValuation(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/ias41/valuation-snapshots/${id}/approve`, {
      method: "PATCH", headers: jsonAuthHeaders(token),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Approval failed."); return; }
    showToast("success", "Valuation approved and journal entry queued to Odoo.");
    loadValuation();
  }

  async function saveAndSendQueueItem(item: ActionQueueItem) {
    const patchPath = EVENT_PATCH_PATH[item.eventType];
    if (!patchPath) { showToast("error", `No correction endpoint for event type: ${item.eventType}`); return; }
    setSavingId(item.sourceId);
    try {
      const form = editForms[item.sourceId] ?? {};
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue/${patchPath}/${item.sourceId}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        showToast("error", d.error ?? "Save failed. Check the fields and try again.");
        setSavingId(null);
        return;
      }
      showToast("success", "Saved and queued for Odoo. Check back shortly for sync status.");
      loadActionQueue();
    } catch {
      showToast("error", "Network error. Please try again.");
    }
    setSavingId(null);
  }

  async function resendNow(item: ActionQueueItem) {
    if (!item.outboxId) {
      showToast("error", "No outbox entry found — use Save & send instead.");
      return;
    }
    setResendingId(item.outboxId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/action-queue/${item.outboxId}/resend-now`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) {
        showToast("error", d.error ?? "Resend failed.");
        setResendingId(null);
        return;
      }
      if (d.odooMoveName) {
        showToast("success", `Sent to Odoo: ${d.odooMoveName}`);
      } else if (d.status === "failed") {
        showToast("error", d.userError?.message ?? "Odoo rejected the entry. See error below.");
      } else {
        showToast("success", "Resent. Check back shortly for Odoo confirmation.");
      }
      loadActionQueue();
    } catch {
      showToast("error", "Network error. Please try again.");
    }
    setResendingId(null);
  }

  async function retryOutbox(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/accounting-approvals/odoo-outbox/${id}/retry`, {
      method: "POST", headers: jsonAuthHeaders(token),
    });
    const d = await r.json();
    if (!r.ok) { showToast("error", d.error ?? "Retry failed."); return; }
    showToast("success", "Retry queued.");
    loadOutbox();
  }

  if (!isManager) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">
        Manager or above access required to view accounting approvals.
      </div>
    );
  }

  const needsActionCount = actionQueue.filter(i => i.outboxStatus === "failed" || i.outboxStatus === "not_queued").length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "action", label: "Needs Action", badge: needsActionCount || undefined },
    { id: "feed", label: "Feed purchases" },
    { id: "medicine", label: "Medicine purchases" },
    { id: "slaughter", label: "Slaughter conversion" },
    { id: "sales", label: "Meat sales" },
    { id: "mortality", label: "Mortality losses" },
    { id: "payroll", label: "Payroll expense" },
    { id: "valuation", label: "Flock valuation (IAS 41)" },
    { id: "outbox", label: "Odoo sync log" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <PageHeader title="Accounting Approvals" subtitle="Review and send financial records to Odoo" />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5
              ${tab === t.id
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Needs Action ─────────────────────────────────────────────────── */}
      {tab === "action" && (
        <section className="space-y-4">
          <p className="text-sm text-gray-500">
            All financial records that have not yet reached Odoo — failed syncs, missing data, or awaiting your approval.
            Fix any issues inline and press <strong>Send to Odoo</strong>.
          </p>

          {actionLoading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}

          {!actionLoading && actionQueue.length === 0 && (
            <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-6 text-center text-sm text-emerald-700">
              All caught up — no records need attention right now.
            </div>
          )}

          {/* Failed group */}
          {actionQueue.filter(i => i.outboxStatus === "failed").length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />
                Failed — Odoo rejected or connection error
              </h3>
              <div className="space-y-3">
                {actionQueue.filter(i => i.outboxStatus === "failed").map(item => (
                  <ActionQueueCard
                    key={item.sourceId}
                    item={item}
                    editForm={editForms[item.sourceId] ?? {}}
                    onFieldChange={(key, val) =>
                      setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))
                    }
                    isSaving={savingId === item.sourceId}
                    isResending={resendingId === item.outboxId}
                    onSave={() => saveAndSendQueueItem(item)}
                    onResend={() => resendNow(item)}
                    borderClass="border-red-200 bg-red-50"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Needs approval group */}
          {actionQueue.filter(i => i.sourceStatus === "pending_approval" && i.outboxStatus !== "failed").length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full inline-block" />
                Awaiting your approval before sending to Odoo
              </h3>
              <div className="space-y-3">
                {actionQueue.filter(i => i.sourceStatus === "pending_approval" && i.outboxStatus !== "failed").map(item => (
                  <ActionQueueCard
                    key={item.sourceId}
                    item={item}
                    editForm={editForms[item.sourceId] ?? {}}
                    onFieldChange={(key, val) =>
                      setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))
                    }
                    isSaving={savingId === item.sourceId}
                    isResending={resendingId === item.outboxId}
                    onSave={() => saveAndSendQueueItem(item)}
                    onResend={() => resendNow(item)}
                    borderClass="border-blue-200 bg-blue-50"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Not queued / missing data group */}
          {actionQueue.filter(i => i.outboxStatus === "not_queued" && i.sourceStatus !== "pending_approval").length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full inline-block" />
                Not yet sent — complete details to send
              </h3>
              <div className="space-y-3">
                {actionQueue.filter(i => i.outboxStatus === "not_queued" && i.sourceStatus !== "pending_approval").map(item => (
                  <ActionQueueCard
                    key={item.sourceId}
                    item={item}
                    editForm={editForms[item.sourceId] ?? {}}
                    onFieldChange={(key, val) =>
                      setEditForms(p => ({ ...p, [item.sourceId]: { ...(p[item.sourceId] ?? {}), [key]: val } }))
                    }
                    isSaving={savingId === item.sourceId}
                    isResending={resendingId === item.outboxId}
                    onSave={() => saveAndSendQueueItem(item)}
                    onResend={() => resendNow(item)}
                    borderClass="border-amber-200 bg-amber-50"
                  />
                ))}
              </div>
            </div>
          )}

          {!actionLoading && actionQueue.length > 0 && (
            <button
              onClick={loadActionQueue}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Refresh list
            </button>
          )}
        </section>
      )}

      {/* Feed Procurements */}
      {tab === "feed" && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            Approve feed purchases to create a draft vendor bill in Odoo. Your accountant can then review and post it.
          </p>
          {feedLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
          {!feedLoading && feedRows.length === 0 && <p className="text-sm text-gray-400">No pending feed purchases.</p>}
          <div className="space-y-2">
            {feedRows.map(row => (
              <div key={row.id} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div className="font-medium capitalize">{row.feedType ?? "Unspecified"} feed — {fmt(row.quantityKg, 1)} kg</div>
                  <div className="text-gray-500">{fmtDate(row.recordedAt)} · {row.supplierName || "Supplier unknown"}</div>
                  {row.unitCostRwfPerKg != null && (
                    <div className="text-gray-600">Cost: {fmt(row.unitCostRwfPerKg, 0)} RWF/kg · Total: {fmt(row.quantityKg * row.unitCostRwfPerKg, 0)} RWF</div>
                  )}
                  {row.reference && <div className="text-gray-400 text-xs">Ref: {row.reference}</div>}
                  {row.actorName && <div className="text-gray-400 text-xs">Entered by: {row.actorName}</div>}
                </div>
                <button
                  onClick={() => approveFeed(row.id)}
                  className="shrink-0 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Approve & send to Odoo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Medicine Lot Purchases */}
      {tab === "medicine" && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            Approve medicine or vet supply purchases to create a draft vendor bill in Odoo.
          </p>
          {medLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
          {!medLoading && medRows.length === 0 && <p className="text-sm text-gray-400">No pending medicine purchases.</p>}
          <div className="space-y-2">
            {medRows.map(row => (
              <div key={row.id} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{row.medicineName} — Lot {row.lotNumber}</div>
                  <div className="text-gray-500">{fmtDate(row.receivedAt)} · {row.supplier || "Supplier unknown"} · {fmt(row.quantityReceived)} units</div>
                  {row.unitCostRwf != null && <div className="text-gray-600">Unit cost: {fmt(row.unitCostRwf, 0)} RWF · Total: {fmt(row.totalCostRwf, 0)} RWF</div>}
                  {row.invoiceRef && <div className="text-gray-400 text-xs">Invoice ref: {row.invoiceRef}</div>}
                </div>
                <button
                  onClick={() => approveMed(row.id)}
                  className="shrink-0 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Approve & send to Odoo
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Slaughter Conversion */}
      {tab === "slaughter" && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            When birds are slaughtered, you must set the fair value so the live bird asset converts to meat inventory in your accounts (IAS 41 standard).
          </p>
          {slaughterLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
          {!slaughterLoading && slaughterRows.length === 0 && <p className="text-sm text-gray-400">No slaughter events pending accounting review.</p>}
          <div className="space-y-3">
            {slaughterRows.map(row => {
              const form = slaughterApprovalForm[row.id] ?? { fairValue: "", carryingValue: "" };
              const totalKg = row.avgCarcassWeightKg != null
                ? row.birdsSlaughtered * row.avgCarcassWeightKg
                : row.birdsSlaughtered * row.avgLiveWeightKg;
              return (
                <div key={row.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <div className="font-medium">Flock {row.flockCode ?? row.flockId}</div>
                      <div className="text-gray-500">{fmtDate(row.at)} · {fmt(row.birdsSlaughtered)} birds · ~{fmt(totalKg, 0)} kg carcass</div>
                    </div>
                    <OdooSyncBadge status={row.accountingStatus} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fair value of meat stock (RWF)</label>
                      <input
                        type="number"
                        placeholder="e.g. 540000"
                        value={form.fairValue}
                        onChange={e => setSlaughterApprovalForm(p => ({ ...p, [row.id]: { ...form, fairValue: e.target.value } }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Previous carrying value of live birds (RWF)</label>
                      <input
                        type="number"
                        placeholder="Leave blank to use fair value"
                        value={form.carryingValue}
                        onChange={e => setSlaughterApprovalForm(p => ({ ...p, [row.id]: { ...form, carryingValue: e.target.value } }))}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => approveSlaughter(row.id)}
                    className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Confirm & send conversion entry to Odoo
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Meat Sales */}
      {tab === "sales" && (
        <section className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Record a new meat or bird sale</h3>
            <form onSubmit={submitNewSale} className="border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-500 mb-1">Flock ID</label>
                <input
                  placeholder="Flock ID"
                  value={newSale.flockId}
                  onChange={e => setNewSale(p => ({ ...p, flockId: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sale date</label>
                <input
                  type="date"
                  value={newSale.orderDate}
                  onChange={e => setNewSale(p => ({ ...p, orderDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Number of birds</label>
                <input type="number" placeholder="e.g. 500" value={newSale.numberOfBirds} onChange={e => setNewSale(p => ({ ...p, numberOfBirds: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Total weight sold (kg)</label>
                <input type="number" placeholder="e.g. 1500" value={newSale.totalWeightKg} onChange={e => setNewSale(p => ({ ...p, totalWeightKg: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Price per kg (RWF)</label>
                <input type="number" placeholder="e.g. 3500" value={newSale.pricePerKg} onChange={e => setNewSale(p => ({ ...p, pricePerKg: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buyer name</label>
                <input placeholder="Optional" value={newSale.buyerName} onChange={e => setNewSale(p => ({ ...p, buyerName: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buyer email (for Odoo invoice)</label>
                <input type="email" placeholder="Optional" value={newSale.buyerEmail} onChange={e => setNewSale(p => ({ ...p, buyerEmail: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div className="col-span-2 flex justify-end">
                <button type="submit" disabled={saleSubmitting} className="bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {saleSubmitting ? "Saving…" : "Record sale"}
                </button>
              </div>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent sales</h3>
            {saleLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
            <div className="space-y-2">
              {saleOrders.map(o => (
                <div key={o.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="text-sm space-y-0.5">
                    <div className="font-medium">Flock {o.flockCode ?? o.flockId} — {fmtDate(o.orderDate)}</div>
                    <div className="text-gray-500">{fmt(o.numberOfBirds)} birds · {fmt(o.totalWeightKg, 0)} kg · {fmt(o.pricePerKg, 0)} RWF/kg</div>
                    {o.buyerName && <div className="text-gray-400 text-xs">Buyer: {o.buyerName}</div>}
                    <div className="flex gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.submissionStatus === "approved" ? "bg-emerald-100 text-emerald-800" : o.submissionStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {o.submissionStatus === "approved" ? "Approved" : o.submissionStatus === "rejected" ? "Rejected" : "Pending review"}
                      </span>
                      <OdooSyncBadge status={o.accountingStatus} odooMoveName={o.odooMoveName || null} />
                    </div>
                  </div>
                  {o.submissionStatus === "pending_review" && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => reviewSale(o.id, "approve")} className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700">Approve</button>
                      <button onClick={() => reviewSale(o.id, "reject")} className="bg-red-50 text-red-700 border border-red-200 text-xs px-3 py-1.5 rounded hover:bg-red-100">Reject</button>
                    </div>
                  )}
                </div>
              ))}
              {!saleLoading && saleOrders.length === 0 && <p className="text-sm text-gray-400">No sales recorded yet.</p>}
            </div>
          </div>
        </section>
      )}

      {/* Mortality Impairment */}
      {tab === "mortality" && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            When 5 or more birds die, IAS 41 requires recognising the value loss as an impairment expense.
            Enter the estimated fair value of the dead birds, then approve to create a draft journal entry in Odoo.
          </p>
          {mortalityLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
          {!mortalityLoading && mortalityRows.length === 0 && <p className="text-sm text-gray-400">No mortality events pending accounting review.</p>}
          <div className="space-y-3">
            {mortalityRows.map(row => (
              <div key={row.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="text-sm space-y-0.5">
                    <div className="font-medium">Flock {row.flockCode ?? row.flockId} — {fmtDate(row.at)}</div>
                    <div className="text-red-600 font-medium">{fmt(row.count)} birds dead{row.cause ? ` — ${row.cause}` : ""}</div>
                    {row.notes && <div className="text-gray-400 text-xs">{row.notes}</div>}
                  </div>
                  <OdooSyncBadge status={row.accountingStatus} />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Estimated fair value of dead birds (RWF) — fair value per kg × avg weight × count</label>
                    <input
                      type="number"
                      placeholder="e.g. 85000"
                      value={mortalityImpairmentForm[row.id] ?? ""}
                      onChange={e => setMortalityImpairmentForm(p => ({ ...p, [row.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => approveMortality(row.id)}
                    className="shrink-0 bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700"
                  >
                    Record loss in Odoo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Payroll Period Closure */}
      {tab === "payroll" && (
        <section className="space-y-6">
          <p className="text-sm text-gray-500">
            Close a payroll period to sum all approved laborer credits/deductions and create a single wage expense journal entry in Odoo.
            Go to the <strong>Payroll</strong> page first to approve individual lines.
          </p>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Close a payroll period</h3>
            <form onSubmit={submitPayrollClosure} className="border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Period start</label>
                <input type="date" value={newClosure.periodStart} onChange={e => setNewClosure(p => ({ ...p, periodStart: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Period end</label>
                <input type="date" value={newClosure.periodEnd} onChange={e => setNewClosure(p => ({ ...p, periodEnd: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" required />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <input value={newClosure.notes} onChange={e => setNewClosure(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" placeholder="e.g. April 2026 wages" />
              </div>
              <div className="col-span-2 flex justify-end">
                <button type="submit" disabled={closureSubmitting} className="bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {closureSubmitting ? "Processing…" : "Close period & send to Odoo"}
                </button>
              </div>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Payroll closures history</h3>
            {payrollLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
            <div className="space-y-2">
              {payrollClosures.map(c => (
                <div key={c.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="text-sm space-y-0.5">
                    <div className="font-medium">{fmtDate(c.periodStart)} → {fmtDate(c.periodEnd)}</div>
                    <div className="text-gray-500">{fmt(c.workerCount)} workers · credits +{fmt(c.totalCreditsRwf, 0)} · deductions −{fmt(c.totalDeductionsRwf, 0)} · <span className="font-medium">net {fmt(c.netPayrollRwf, 0)} RWF</span></div>
                  </div>
                  <OdooSyncBadge status={c.accountingStatus} odooMoveName={c.odooMoveName} />
                </div>
              ))}
              {!payrollLoading && payrollClosures.length === 0 && <p className="text-sm text-gray-400">No payroll periods closed yet.</p>}
            </div>
          </div>
        </section>
      )}

      {/* IAS 41 Valuation */}
      {tab === "valuation" && (
        <section className="space-y-6">
          <p className="text-sm text-gray-500">
            IAS 41 requires biological assets (live birds) to be measured at <strong>fair value less costs to sell</strong> at each reporting date.
            Enter current market price to calculate flock value. Approve the snapshot to record the gain/loss in Odoo.
          </p>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Create new valuation</h3>
            <form onSubmit={submitValuation} className="border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Flock ID</label>
                <input placeholder="Flock ID" value={newValuation.flockId} onChange={e => setNewValuation(p => ({ ...p, flockId: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Valuation date</label>
                <input type="date" value={newValuation.snapshotDate} onChange={e => setNewValuation(p => ({ ...p, snapshotDate: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Current market price (RWF/kg live weight)</label>
                <input type="number" placeholder="e.g. 3500" value={newValuation.marketPricePerKgRwf} onChange={e => setNewValuation(p => ({ ...p, marketPricePerKgRwf: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estimated selling costs (RWF/kg) — transport, slaughter fees</label>
                <input type="number" placeholder="e.g. 200" value={newValuation.costsToSellPerKgRwf} onChange={e => setNewValuation(p => ({ ...p, costsToSellPerKgRwf: e.target.value }))} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </div>
              <div className="col-span-2 flex justify-end">
                <button type="submit" disabled={valuationSubmitting} className="bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {valuationSubmitting ? "Calculating…" : "Calculate & save draft"}
                </button>
              </div>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Valuation history</h3>
            {valuationLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
            <div className="space-y-2">
              {valuationSnapshots.map(snap => (
                <div key={snap.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm space-y-0.5">
                      <div className="font-medium">Flock {snap.flockCode ?? snap.flockId} — {fmtDate(snap.snapshotDate)}</div>
                      <div className="text-gray-500">
                        {fmt(snap.liveCount)} birds · {fmt(snap.totalLiveWeightKg, 0)} kg live weight
                        · {fmt(snap.marketPricePerKgRwf, 0)} RWF/kg market
                      </div>
                      <div className="font-semibold text-emerald-700">
                        Fair value: {fmt(snap.totalFairValueRwf, 0)} RWF
                        {snap.fairValueChangeRwf != null && (
                          <span className={`ml-2 text-xs ${snap.fairValueChangeRwf >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            ({snap.fairValueChangeRwf >= 0 ? "+" : ""}{fmt(snap.fairValueChangeRwf, 0)} RWF change)
                          </span>
                        )}
                      </div>
                      {snap.fcrAtSnapshot != null && <div className="text-gray-400 text-xs">FCR at snapshot: {snap.fcrAtSnapshot}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${snap.status === "approved" || snap.status === "posted" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {snap.status === "draft" ? "Draft — pending approval" : snap.status === "approved" ? "Approved" : "Posted to Odoo"}
                      </span>
                      {snap.status === "draft" && (
                        <button onClick={() => approveValuation(snap.id)} className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700">
                          Approve & send to Odoo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!valuationLoading && valuationSnapshots.length === 0 && <p className="text-sm text-gray-400">No valuations created yet.</p>}
            </div>
          </div>
        </section>
      )}

      {/* Outbox */}
      {tab === "outbox" && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            Every financial event sent to Odoo appears here. Failed items can be retried manually.
          </p>
          {outboxLoading ? <p className="text-sm text-gray-400">Loading…</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Odoo document</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Last tried</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {outboxRows.map(row => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{eventTypeLabel(row.eventType)}</td>
                    <td className="py-2 pr-3">
                      <OdooSyncBadge status={row.status === "sent" ? "sent_to_odoo" : row.status === "failed" ? "failed" : "approved"} />
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.odooMoveName || "—"}</td>
                    <td className="py-2 pr-3 text-center">{row.attempts}</td>
                    <td className="py-2 pr-3 text-gray-400">{row.lastAttemptedAt ? fmtDate(row.lastAttemptedAt) : "—"}</td>
                    <td className="py-2">
                      {row.status === "failed" && (
                        <button onClick={() => retryOutbox(row.id)} className="text-xs text-blue-600 hover:underline">Retry</button>
                      )}
                      {row.lastError && (
                        <details className="mt-1">
                          <summary className="text-xs text-red-500 cursor-pointer">Error</summary>
                          <p className="text-xs text-red-400 max-w-xs">{row.lastError}</p>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
                {!outboxLoading && outboxRows.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-gray-400">No sync events yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── ActionQueueCard component ─────────────────────────────────────────────────

type ActionQueueCardProps = {
  item: ActionQueueItem;
  editForm: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  isSaving: boolean;
  isResending: boolean;
  onSave: () => void;
  onResend: () => void;
  borderClass: string;
};

function ActionQueueCard({ item, editForm, onFieldChange, isSaving, isResending, onSave, onResend, borderClass }: ActionQueueCardProps) {
  const canResendWithoutChanges = item.outboxId != null && item.outboxStatus === "failed";

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${borderClass}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {eventTypeLabel(item.eventType)}
            </span>
            <OdooSyncBadge
              status={item.outboxStatus === "failed" ? "failed" : item.sourceStatus === "pending_approval" ? "pending_approval" : "approved"}
            />
          </div>
          <div className="font-medium text-sm text-gray-800">{item.summary.label}</div>
          <div className="text-xs text-gray-500">{item.summary.detail}</div>
          {item.attempts > 0 && (
            <div className="text-xs text-gray-400">
              {item.attempts} attempt{item.attempts !== 1 ? "s" : ""}
              {item.lastAttemptedAt ? ` · last tried ${new Date(item.lastAttemptedAt).toLocaleString()}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Error message (if failed) */}
      {item.userError && (
        <div className="bg-red-100 border border-red-200 rounded-lg px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-red-700">Reason for failure</div>
          <div className="text-sm text-red-800">{item.userError.message}</div>
          {item.userError.category === "connection_error" && (
            <div className="text-xs text-red-600">Tip: Try &quot;Resend without changes&quot; — the data may be fine.</div>
          )}
        </div>
      )}

      {/* Editable fields */}
      {item.fixableFields.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-2">
            {item.outboxStatus === "failed" ? "Correct any fields, then resend:" : "Complete these fields to send:"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {item.fixableFields.map(field => (
              <div key={field.key}>
                <label className="block text-xs text-gray-500 mb-0.5">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type}
                  placeholder={field.type === "number" ? "0" : ""}
                  value={editForm[field.key] ?? (field.value != null ? String(field.value) : "")}
                  onChange={e => onFieldChange(field.key, e.target.value)}
                  className="w-full border border-gray-300 bg-white rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {field.hint && <p className="text-xs text-gray-400 mt-0.5">{field.hint}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          onClick={onSave}
          disabled={isSaving || isResending}
          className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
        >
          {isSaving ? "Saving…" : actionLabel(item)}
        </button>
        {canResendWithoutChanges && (
          <button
            onClick={onResend}
            disabled={isSaving || isResending}
            className="bg-white text-blue-600 border border-blue-300 text-sm px-4 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {isResending ? "Sending…" : "Resend without changes"}
          </button>
        )}
      </div>
    </div>
  );
}
