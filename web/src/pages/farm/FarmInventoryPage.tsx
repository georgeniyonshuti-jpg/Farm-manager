import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { useSuppliers } from "../../hooks/useSuppliers";
import { FeedBalanceSidebar } from "../../components/inventory/FeedBalanceSidebar";
import { FeedInventoryLedger } from "../../components/inventory/FeedInventoryLedger";
import { FeedInventoryStatsStrip } from "../../components/inventory/FeedInventoryStatsStrip";
import { ReceiveStockModal } from "../../components/inventory/ReceiveStockModal";
import { AdjustStockModal } from "../../components/inventory/AdjustStockModal";

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

type TxTypeFilter = "all" | "procurement_receipt" | "feed_consumption" | "adjustment";

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

function feedTypeLabel(value: string | null): string {
  return FEED_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "—";
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

  const [feedTypeFilter, setFeedTypeFilter] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>("all");

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const [adjDelta, setAdjDelta] = useState("");
  const [adjFeedType, setAdjFeedType] = useState("starter");
  const [adjReasonCode, setAdjReasonCode] = useState("stock_count_correction");

  const canProcure =
    user?.role === "procurement_officer" ||
    user?.role === "vet_manager" ||
    user?.role === "manager" ||
    user?.role === "superuser";
  const canAdjust = user?.role === "manager" || user?.role === "superuser";
  const canSendToOdoo =
    user?.role === "superuser" || (user?.role === "manager" && Array.isArray(user?.pageAccess) && user.pageAccess.includes("odoo_send"));

  const loadStock = useCallback(async () => {
    setLoadingStock(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/inventory/stock-summary`, {
        headers: readAuthHeaders(token),
      });
      const data = await response.json();
      if (!response.ok) throw new Error((data as { error?: string }).error ?? "Failed to load stock summary");
      setSummary((data as { summary: StockRow[] }).summary ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingStock(false);
    }
  }, [token]);

  const loadLedger = useCallback(
    async (page = 1) => {
      setLoadingLedger(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (feedTypeFilter) params.set("feed_type", feedTypeFilter);

        const response = await fetch(`${API_BASE_URL}/api/inventory/ledger?${params.toString()}`, {
          headers: readAuthHeaders(token),
        });
        const data = await response.json();
        if (!response.ok) throw new Error((data as { error?: string }).error ?? "Failed to load ledger");
        setLedger((data as { rows: LedgerRow[] }).rows ?? []);
        setLedgerTotal((data as { total: number }).total ?? 0);
        setLedgerPage(page);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ledger load failed");
      } finally {
        setLoadingLedger(false);
      }
    },
    [token, feedTypeFilter]
  );

  const loadApprovers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/odoo-approvers`, { headers: readAuthHeaders(token) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const list = Array.isArray((data as { approvers?: OdooApprover[] }).approvers) ? (data as { approvers: OdooApprover[] }).approvers : [];
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
    void loadSuppliers();
    if (!canSendToOdoo) void loadApprovers();
  }, [loadStock, loadSuppliers, loadApprovers, canSendToOdoo]);

  useEffect(() => {
    void loadLedger(1);
  }, [loadLedger]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStock(), loadLedger(ledgerPage)]);
  }, [loadStock, loadLedger, ledgerPage]);

  const handleCreateSupplier = useCallback(async () => {
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
  }, [createSupplier, procSupplierNew, showToast]);

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
      const response = await fetch(`${API_BASE_URL}/api/inventory/procurement`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedType: procFeedType,
          quantityKg: qty,
          reasonCode: procReasonCode,
          reason: procReasonCode,
          reference: procRef,
          unitCostRwfPerKg: procUnitCost ? Number(procUnitCost) : undefined,
          supplierId: procSupplierMode === "existing" ? procSupplierExistingId || undefined : undefined,
          supplierName: procSupplierMode === "new" ? procSupplierNew.trim() || undefined : undefined,
          requestedApproverUserId: !canSendToOdoo ? requestedApproverUserId : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? "Request failed");

      const acctStatus = (data as { row?: { accountingStatus?: string | null } }).row?.accountingStatus ?? null;
      const acctMsg = acctStatus === "approved" ? " Sent to Odoo." : " Waiting for selected approver to push to Odoo.";
      showToast("success", `Received ${qty} kg of ${feedTypeLabel(procFeedType)}.${acctMsg}`);

      setProcQty("");
      setProcRef("");
      setProcUnitCost("");
      setProcSupplierMode("existing");
      setProcSupplierExistingId("");
      setProcSupplierNew("");
      setShowReceiveModal(false);
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
      const response = await fetch(`${API_BASE_URL}/api/inventory/adjustments`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedType: adjFeedType,
          deltaKg: delta,
          reasonCode: adjReasonCode,
          reason: adjReasonCode,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
      showToast("success", `Adjustment saved (${delta > 0 ? "+" : ""}${delta} kg)`);
      setAdjDelta("");
      setShowAdjustModal(false);
      await Promise.all([loadStock(), loadLedger(1)]);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.ceil(ledgerTotal / PAGE_SIZE);
  const loading = loadingStock && loadingLedger;
  const exportHref = useMemo(
    () => `${API_BASE_URL}/api/reports/feed-inventory.csv${feedTypeFilter ? `?feed_type=${encodeURIComponent(feedTypeFilter)}` : ""}`,
    [feedTypeFilter]
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Feed inventory"
        subtitle="Ledger-first view of feed stock movement and balances."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              onClick={() => void refreshAll()}
            >
              Refresh
            </button>

            <details className="group relative">
              <summary className="list-none cursor-pointer rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]">
                Actions
              </summary>
              <div className="absolute right-0 z-20 mt-2 min-w-[12rem] rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] p-1 shadow-elevated">
                {canAdjust ? (
                  <button
                    type="button"
                    className="w-full rounded px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                    onClick={() => setShowAdjustModal(true)}
                  >
                    Adjust stock
                  </button>
                ) : null}
                <a
                  href={exportHref}
                  className="block rounded px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                  download
                >
                  Export CSV
                </a>
                <Link
                  to="/farm/reports?type=farm_operations"
                  className="block rounded px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  Operations report
                </Link>
              </div>
            </details>

            {canProcure ? (
              <button
                type="button"
                className="rounded-lg bg-[var(--primary-color)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--primary-color-dark)]"
                onClick={() => setShowReceiveModal(true)}
              >
                + Receive stock
              </button>
            ) : null}
          </div>
        }
      />

      {loading ? <SkeletonList rows={4} /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => { void loadStock(); void loadLedger(1); }} /> : null}

      {!error ? (
        <>
          <FeedInventoryStatsStrip summary={summary} />

          <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <FeedBalanceSidebar
              summary={summary}
              feedTypeFilter={feedTypeFilter}
              onFeedTypeFilterChange={setFeedTypeFilter}
              feedTypeOptions={FEED_TYPE_OPTIONS}
            />
            <FeedInventoryLedger
              rows={ledger}
              loading={loadingLedger}
              totalRows={ledgerTotal}
              page={ledgerPage}
              totalPages={totalPages}
              feedTypeFilter={feedTypeFilter}
              txTypeFilter={txTypeFilter}
              feedTypeOptions={FEED_TYPE_OPTIONS}
              exportHref={exportHref}
              onFeedTypeFilterChange={setFeedTypeFilter}
              onTxTypeFilterChange={setTxTypeFilter}
              onPrevPage={() => void loadLedger(ledgerPage - 1)}
              onNextPage={() => void loadLedger(ledgerPage + 1)}
            />
          </div>
        </>
      ) : null}

      {canProcure ? (
        <ReceiveStockModal
          open={showReceiveModal}
          busy={busy}
          canSendToOdoo={canSendToOdoo}
          feedTypeOptions={FEED_TYPE_OPTIONS}
          procurementReasons={procurementReasons}
          suppliers={suppliers}
          approvers={approvers}
          procQty={procQty}
          procFeedType={procFeedType}
          procReasonCode={procReasonCode}
          procRef={procRef}
          procUnitCost={procUnitCost}
          procSupplierMode={procSupplierMode}
          procSupplierExistingId={procSupplierExistingId}
          procSupplierNew={procSupplierNew}
          requestedApproverUserId={requestedApproverUserId}
          onClose={() => setShowReceiveModal(false)}
          onSubmit={() => void postProcurement()}
          onCreateSupplier={handleCreateSupplier}
          setProcQty={setProcQty}
          setProcFeedType={setProcFeedType}
          setProcReasonCode={setProcReasonCode}
          setProcRef={setProcRef}
          setProcUnitCost={setProcUnitCost}
          setProcSupplierMode={setProcSupplierMode}
          setProcSupplierExistingId={setProcSupplierExistingId}
          setProcSupplierNew={setProcSupplierNew}
          setRequestedApproverUserId={setRequestedApproverUserId}
        />
      ) : null}

      {canAdjust ? (
        <AdjustStockModal
          open={showAdjustModal}
          busy={busy}
          feedTypeOptions={FEED_TYPE_OPTIONS}
          adjustReasons={adjustReasons}
          adjFeedType={adjFeedType}
          adjDelta={adjDelta}
          adjReasonCode={adjReasonCode}
          onClose={() => setShowAdjustModal(false)}
          onSubmit={() => void postAdjustment()}
          setAdjFeedType={setAdjFeedType}
          setAdjDelta={setAdjDelta}
          setAdjReasonCode={setAdjReasonCode}
        />
      ) : null}
    </div>
  );
}
