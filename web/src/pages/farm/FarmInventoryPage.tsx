import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { OdooSyncBadge } from "../../components/accounting/OdooSyncBadge";
import { useSuppliers } from "../../hooks/useSuppliers";

type StockRow = {
  feedType: string | null;
  purchasedKg: number;
  usedKg: number;
  adjustmentsKg: number;
  balanceKg: number;
};

type LedgerRow = {
  id: string;
  type: "procurement_receipt" | "feed_consumption" | "adjustment";
  at: string;
  flockId: string | null;
  flockLabel: string | null;
  feedType: string | null;
  feedEntryId: string | null;
  quantityKg: number;
  deltaKg: number;
  reason: string;
  reference: string;
  supplierName?: string | null;
  accountingStatus: string | null;
};

type OdooApprover = {
  id: string;
  displayName: string;
  role: string;
  email: string;
};

const FEED_TYPE_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "grower", label: "Grower" },
  { value: "finisher", label: "Finisher" },
  { value: "supplement", label: "Supplement" },
];

const PROCUREMENT_REASON_OPTIONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "internal_transfer_in", label: "Internal transfer in" },
  { value: "returned_stock", label: "Returned stock" },
  { value: "other", label: "Other" },
];

const ADJUST_REASON_OPTIONS = [
  { value: "stock_count_correction", label: "Stock count correction" },
  { value: "damage_loss", label: "Damage/loss" },
  { value: "expired_feed", label: "Expired feed" },
  { value: "other", label: "Other" },
];

function txLabel(type: LedgerRow["type"]): string {
  if (type === "procurement_receipt") return "Received";
  if (type === "feed_consumption") return "Used";
  return "Adjustment";
}

function txBadgeClass(type: LedgerRow["type"]): string {
  if (type === "procurement_receipt") return "border border-emerald-500/25 bg-emerald-500/12 text-emerald-300";
  if (type === "feed_consumption") return "border border-amber-500/25 bg-amber-500/12 text-amber-300";
  return "border border-sky-500/25 bg-sky-500/12 text-sky-300";
}

function feedTypeLabel(ft: string | null): string {
  return FEED_TYPE_OPTIONS.find((o) => o.value === ft)?.label ?? ft ?? "—";
}

export function FarmInventoryPage() {
  const { token, user } = useAuth();
  const procurementReasons = useReferenceOptions("inventory_procurement_reason", token, PROCUREMENT_REASON_OPTIONS);
  const adjustReasons = useReferenceOptions("inventory_adjust_reason", token, ADJUST_REASON_OPTIONS);
  const { showToast } = useToast();
  const { suppliers, loadSuppliers, createSupplier } = useSuppliers(token);

  const [loadingStock, setLoadingStock] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StockRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const PAGE_SIZE = 50;

  // Filters
  const [feedTypeFilter, setFeedTypeFilter] = useState("");

  // Entry panel state
  const [showEntryPanel, setShowEntryPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<"procurement" | "adjustment">("procurement");
  const [busy, setBusy] = useState(false);

  // Procurement form
  const [procQty, setProcQty] = useState("");
  const [procFeedType, setProcFeedType] = useState("starter");
  const [procReasonCode, setProcReasonCode] = useState("supplier_delivery");
  const [procRef, setProcRef] = useState("");
  const [procUnitCost, setProcUnitCost] = useState("");
  const [procSupplierMode, setProcSupplierMode] = useState<"existing" | "new">("existing");
  const [procSupplierExistingId, setProcSupplierExistingId] = useState("");
  const [procSupplierNew, setProcSupplierNew] = useState("");
  const [approvers, setApprovers] = useState<OdooApprover[]>([]);
  const [requestedApproverUserId, setRequestedApproverUserId] = useState("");

  // Adjustment form
  const [adjDelta, setAdjDelta] = useState("");
  const [adjFeedType, setAdjFeedType] = useState("starter");
  const [adjReasonCode, setAdjReasonCode] = useState("stock_count_correction");

  const canProcure =
    user?.role === "procurement_officer" ||
    user?.role === "vet_manager" ||
    user?.role === "manager" ||
    user?.role === "superuser";
  const canAdjust = user?.role === "manager" || user?.role === "superuser";
  const canRecordAny = canProcure || canAdjust;
  const canSendToOdoo =
    user?.role === "superuser" || (user?.role === "manager" && Array.isArray(user?.pageAccess) && user.pageAccess.includes("odoo_send"));

  const loadStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/inventory/stock-summary`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to load stock summary");
      setSummary((d as { summary: StockRow[] }).summary ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingStock(false);
    }
  }, [token]);

  const loadLedger = useCallback(async (page = 1) => {
    setLoadingLedger(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (feedTypeFilter) params.set("feed_type", feedTypeFilter);
      const r = await fetch(`${API_BASE_URL}/api/inventory/ledger?${params.toString()}`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to load ledger");
      setLedger((d as { rows: LedgerRow[] }).rows ?? []);
      setLedgerTotal((d as { total: number }).total ?? 0);
      setLedgerPage(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ledger load failed");
    } finally {
      setLoadingLedger(false);
    }
  }, [token, feedTypeFilter]);

  const loadApprovers = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/odoo-approvers`, { headers: readAuthHeaders(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const list = Array.isArray((d as { approvers?: OdooApprover[] }).approvers) ? (d as { approvers: OdooApprover[] }).approvers : [];
      setApprovers(list);
      if (!requestedApproverUserId && list.length > 0) {
        setRequestedApproverUserId(list[0].id);
      }
    } catch {
      setApprovers([]);
    }
  }, [token, requestedApproverUserId]);

  useEffect(() => {
    void loadStock();
    void loadLedger(1);
    void loadSuppliers();
    if (!canSendToOdoo) void loadApprovers();
  }, [loadStock, loadLedger, loadSuppliers, loadApprovers, canSendToOdoo]);

  async function postProcurement() {
    const qty = Number(procQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("error", "Enter a valid quantity in kg.");
      return;
    }
    if (!canSendToOdoo && !requestedApproverUserId) {
      showToast("error", "Select who should approve and send this to Odoo.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/inventory/procurement`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedType: procFeedType,
          quantityKg: qty,
          reasonCode: procReasonCode,
          reason: procReasonCode,
          reference: procRef,
          unitCostRwfPerKg: procUnitCost ? Number(procUnitCost) : undefined,
          supplierId: procSupplierMode === "existing" ? (procSupplierExistingId || undefined) : undefined,
          supplierName: procSupplierMode === "new" ? (procSupplierNew.trim() || undefined) : undefined,
          requestedApproverUserId: !canSendToOdoo ? requestedApproverUserId : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Request failed");
      const acctStatus = (d as { row?: { accountingStatus?: string | null } }).row?.accountingStatus ?? null;
      const acctMsg = acctStatus === "approved"
        ? " Sent to Odoo."
        : " Waiting for selected approver to push to Odoo.";
      showToast("success", `Received ${qty} kg of ${feedTypeLabel(procFeedType)}.${acctMsg}`);
      setProcQty("");
      setProcRef("");
      setProcUnitCost("");
      setProcSupplierMode("existing");
      setProcSupplierExistingId("");
      setProcSupplierNew("");
      setShowEntryPanel(false);
      await Promise.all([loadStock(), loadLedger(1), loadSuppliers()]);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function postAdjustment() {
    const delta = Number(adjDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      showToast("error", "Enter a non-zero delta in kg (use - for losses).");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/inventory/adjustments`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedType: adjFeedType,
          deltaKg: delta,
          reasonCode: adjReasonCode,
          reason: adjReasonCode,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Request failed");
      showToast("success", `Adjustment saved (${delta > 0 ? "+" : ""}${delta} kg)`);
      setAdjDelta("");
      setShowEntryPanel(false);
      await Promise.all([loadStock(), loadLedger(1)]);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const totalBalance = useMemo(
    () => summary.reduce((s, r) => s + r.balanceKg, 0),
    [summary]
  );

  const totalPages = Math.ceil(ledgerTotal / PAGE_SIZE);

  const loading = loadingStock && loadingLedger;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Feed stock"
        subtitle="Farm-wide feed inventory — purchases in, approved logs out, balance remaining."
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => { void loadStock(); void loadLedger(1); }} />}

      {!loading && !error && (
        <>
          {/* ── Stock summary by feed type ── */}
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Stock summary
                <span className="ml-2 font-normal text-[var(--text-muted)]">— all feed types</span>
              </h2>
              <span className="text-sm font-semibold text-emerald-400">
                Total: {totalBalance.toFixed(1)} kg
              </span>
            </div>
            <div className="table-block">
              <div className="institutional-table-wrapper">
                <table className="institutional-table">
                  <thead>
                    <tr>
                      <th>Feed type</th>
                      <th className="tbl-num">Purchased (kg)</th>
                      <th className="tbl-num">Used (kg)</th>
                      <th className="tbl-num">Adjustments (kg)</th>
                      <th className="tbl-num">Balance (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-[var(--text-muted)]">
                          No stock movements recorded yet.
                        </td>
                      </tr>
                    ) : (
                      summary.map((row) => (
                        <tr
                          key={row.feedType ?? "unspecified"}
                          className={row.balanceKg < 0 ? "bg-red-500/10" : ""}
                        >
                          <td className="font-medium">{feedTypeLabel(row.feedType)}</td>
                          <td className="tbl-num text-emerald-400">+{row.purchasedKg.toFixed(1)}</td>
                          <td className="tbl-num text-amber-400">−{row.usedKg.toFixed(1)}</td>
                          <td className={`tbl-num ${row.adjustmentsKg < 0 ? "text-red-400" : "text-sky-400"}`}>
                            {row.adjustmentsKg >= 0 ? "+" : ""}{row.adjustmentsKg.toFixed(1)}
                          </td>
                          <td className={`tbl-num font-semibold ${row.balanceKg < 0 ? "text-red-400" : "text-[var(--text-primary)]"}`}>
                            {row.balanceKg.toFixed(1)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="px-4 py-2 text-xs text-[var(--text-muted)]">
              "Used" counts only approved feed logs and manual consumption entries. Pending feed logs are not deducted until approved.
            </p>
          </section>

          {/* ── Quick actions ── */}
          {canRecordAny && (
            <div className="flex flex-wrap items-center gap-2">
              {!showEntryPanel ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowEntryPanel(true);
                    if (canProcure) setActiveTab("procurement");
                    else setActiveTab("adjustment");
                  }}
                  className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)]"
                >
                  New transaction
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEntryPanel(false)}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  Close form
                </button>
              )}
            </div>
          )}

          {/* ── Entry panel ── */}
          {showEntryPanel && canRecordAny && (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-3">
                {canProcure && (
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTab === "procurement" ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]" : "border-[var(--border-color)] text-[var(--text-secondary)]"}`}
                    onClick={() => setActiveTab("procurement")}
                  >
                    Receive stock
                  </button>
                )}
                {canAdjust && (
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTab === "adjustment" ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]" : "border-[var(--border-color)] text-[var(--text-secondary)]"}`}
                    onClick={() => setActiveTab("adjustment")}
                  >
                    Adjust stock
                  </button>
                )}
              </div>

              {canProcure && activeTab === "procurement" && (
                <div className="mt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Receive stock</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Feed type</label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={procFeedType}
                        onChange={(e) => setProcFeedType(e.target.value)}
                      >
                        {FEED_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Quantity (kg)</label>
                      <input
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        placeholder="e.g. 500"
                        inputMode="decimal"
                        value={procQty}
                        onChange={(e) => setProcQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={procReasonCode}
                        onChange={(e) => setProcReasonCode(e.target.value)}
                      >
                        {procurementReasons.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reference (GRN / invoice)</label>
                      <input
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        placeholder="Optional"
                        value={procRef}
                        onChange={(e) => setProcRef(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Unit cost (RWF/kg, optional)</label>
                      <input
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        placeholder="e.g. 450"
                        inputMode="decimal"
                        value={procUnitCost}
                        onChange={(e) => setProcUnitCost(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Supplier</label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={procSupplierMode === "new" ? "__new__" : procSupplierExistingId}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setProcSupplierMode("new");
                            setProcSupplierExistingId("");
                          } else {
                            setProcSupplierMode("existing");
                            setProcSupplierExistingId(e.target.value);
                          }
                        }}
                      >
                        <option value="">Select saved supplier</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                        <option value="__new__">+ Add new supplier</option>
                      </select>
                      {procSupplierMode === "new" && (
                        <div className="mt-2 flex gap-2">
                          <input
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            placeholder="Enter new supplier name"
                            value={procSupplierNew}
                            onChange={(e) => setProcSupplierNew(e.target.value)}
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
                            onClick={async () => {
                              try {
                                const created = await createSupplier(procSupplierNew);
                                if (created?.id) {
                                  setProcSupplierMode("existing");
                                  setProcSupplierExistingId(created.id);
                                  setProcSupplierNew(created.name ?? "");
                                  showToast("success", "Supplier saved");
                                }
                              } catch (e) {
                                showToast("error", e instanceof Error ? e.message : "Could not create supplier");
                              }
                            }}
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {procUnitCost && (
                    <p className="text-xs text-emerald-400">
                      If you have Odoo send access this can go now; otherwise it waits for your selected approver to push to Odoo.
                    </p>
                  )}
                  {!canSendToOdoo && (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                      <label className="mb-1 block text-xs font-medium text-amber-300">
                        Send approval request to
                      </label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={requestedApproverUserId}
                        onChange={(e) => setRequestedApproverUserId(e.target.value)}
                      >
                        <option value="">Select approver</option>
                        {approvers.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.displayName} ({a.role})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-amber-300/90">
                        You can submit now, but it will only reach Odoo after this approver reviews it in Accounting Approvals.
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busy || !procQty || (!canSendToOdoo && !requestedApproverUserId)}
                    onClick={() => void postProcurement()}
                    className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save receipt"}
                  </button>
                </div>
              )}

              {canAdjust && activeTab === "adjustment" && (
                <div className="mt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Manual adjustment</h3>
                  <p className="text-xs text-[var(--text-muted)]">Use negative values for losses (damage, expiry, count corrections).</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Feed type</label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={adjFeedType}
                        onChange={(e) => setAdjFeedType(e.target.value)}
                      >
                        {FEED_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Delta kg (+/-)</label>
                      <input
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        placeholder="e.g. -20 or +50"
                        inputMode="decimal"
                        value={adjDelta}
                        onChange={(e) => setAdjDelta(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
                      <select
                        className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        value={adjReasonCode}
                        onChange={(e) => setAdjReasonCode(e.target.value)}
                      >
                        {adjustReasons.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !adjDelta}
                    onClick={() => void postAdjustment()}
                    className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save adjustment"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Ledger ── */}
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Transaction ledger</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  value={feedTypeFilter}
                  onChange={(e) => setFeedTypeFilter(e.target.value)}
                >
                  <option value="">All feed types</option>
                  {FEED_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <a
                  href={`${API_BASE_URL}/api/reports/feed-inventory.csv${feedTypeFilter ? `?feed_type=${encodeURIComponent(feedTypeFilter)}` : ""}`}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                  download
                >
                  Export CSV
                </a>
              </div>
            </div>

            {loadingLedger ? (
              <div className="p-4"><SkeletonList rows={3} /></div>
            ) : (
              <>
                <div className="table-block">
                  <div className="institutional-table-wrapper">
                    <table className="institutional-table">
                      <thead>
                        <tr>
                          <th>Date / time</th>
                          <th>Type</th>
                          <th>Feed type</th>
                          <th className="tbl-num">Qty (kg)</th>
                          <th className="tbl-num">Delta (kg)</th>
                          <th>Reason</th>
                          <th>Flock / reference</th>
                          <th>Odoo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-sm text-[var(--text-muted)]">
                              No transactions found.
                            </td>
                          </tr>
                        ) : (
                          ledger.map((row) => (
                            <tr key={row.id}>
                              <td className="tbl-mono whitespace-nowrap">
                                {new Date(row.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                              </td>
                              <td>
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${txBadgeClass(row.type)}`}>
                                  {txLabel(row.type)}
                                </span>
                                {row.feedEntryId && (
                                  <span className="ml-1 inline-block rounded-full border border-[var(--border-color)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
                                    auto
                                  </span>
                                )}
                              </td>
                              <td>{feedTypeLabel(row.feedType)}</td>
                              <td className="tbl-num">{row.quantityKg.toFixed(1)}</td>
                              <td className={`tbl-num font-semibold ${row.deltaKg >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                {row.deltaKg >= 0 ? "+" : ""}{row.deltaKg.toFixed(1)}
                              </td>
                              <td className="text-[var(--text-secondary)]">{row.reason || "—"}</td>
                              <td className="tbl-mono text-[var(--text-muted)]">
                                {row.flockLabel ?? row.reference ?? "—"}
                              </td>
                              <td>
                                {row.type === "procurement_receipt" && (
                                  <OdooSyncBadge status={row.accountingStatus} compact approvalsHref="/farm/accounting-approvals" />
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3">
                    <span className="text-xs text-[var(--text-muted)]">
                      Page {ledgerPage} of {totalPages} ({ledgerTotal} total)
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={ledgerPage <= 1}
                        onClick={() => void loadLedger(ledgerPage - 1)}
                        className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        disabled={ledgerPage >= totalPages}
                        onClick={() => void loadLedger(ledgerPage + 1)}
                        className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
