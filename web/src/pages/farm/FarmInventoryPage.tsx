import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { useSuppliers } from "../../hooks/useSuppliers";
import { FeedInventoryLedger } from "../../components/inventory/FeedInventoryLedger";
import { ReceiveStockModal } from "../../components/inventory/ReceiveStockModal";
import { AdjustStockModal } from "../../components/inventory/AdjustStockModal";
import { ManagerPage } from "../../components/layout/ManagerPage";

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

  const [adjDelta, setAdjDelta] = useState("");
  const [adjFeedType, setAdjFeedType] = useState("starter");
  const [adjReasonCode, setAdjReasonCode] = useState("stock_count_correction");

  const canProcure =
    user?.role === "procurement_officer" ||
    user?.role === "vet_manager" ||
    user?.role === "manager" ||
    user?.role === "company_admin" ||
    user?.role === "superuser";
  const canAdjust =
    user?.role === "manager" || user?.role === "company_admin" || user?.role === "superuser";

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

  useEffect(() => {
    void loadStock();
    void loadSuppliers();
  }, [loadStock, loadSuppliers]);

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
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? "Request failed");

      showToast("success", `Received ${qty} kg of ${feedTypeLabel(procFeedType)}.`);

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

  const exportHref = useMemo(
    () => `${API_BASE_URL}/api/reports/feed-inventory.csv${feedTypeFilter ? `?feed_type=${encodeURIComponent(feedTypeFilter)}` : ""}`,
    [feedTypeFilter]
  );

  return (
    <ManagerPage>
      <PageHeader
        title="Feed inventory"
        primaryAction={
          canProcure
            ? { label: "Receive stock", onClick: () => setShowReceiveModal(true) }
            : undefined
        }
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            void loadStock();
            void loadLedger(1);
          }}
        />
      ) : (
        <FeedInventoryLedger
          rows={ledger}
          summary={summary}
          loading={loadingStock || loadingLedger}
          totalRows={ledgerTotal}
          page={ledgerPage}
          feedTypeFilter={feedTypeFilter}
          txTypeFilter={txTypeFilter}
          feedTypeOptions={FEED_TYPE_OPTIONS}
          exportHref={exportHref}
          onFeedTypeFilterChange={setFeedTypeFilter}
          onTxTypeFilterChange={setTxTypeFilter}
          onPageChange={(p) => void loadLedger(p)}
          pageSize={PAGE_SIZE}
          onRefresh={() => void refreshAll()}
          onAdjust={canAdjust ? () => setShowAdjustModal(true) : undefined}
          operationsReportHref="/farm/reports?type=farm_operations"
        />
      )}

      {canProcure ? (
        <ReceiveStockModal
          open={showReceiveModal}
          busy={busy}
          feedTypeOptions={FEED_TYPE_OPTIONS}
          procurementReasons={procurementReasons}
          suppliers={suppliers}
          procQty={procQty}
          procFeedType={procFeedType}
          procReasonCode={procReasonCode}
          procRef={procRef}
          procUnitCost={procUnitCost}
          procSupplierMode={procSupplierMode}
          procSupplierExistingId={procSupplierExistingId}
          procSupplierNew={procSupplierNew}
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
    </ManagerPage>
  );
}
