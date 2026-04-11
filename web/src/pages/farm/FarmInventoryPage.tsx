import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";

type Flock = { id: string; label: string };
type LedgerRow = {
  id: string;
  type: "procurement_receipt" | "feed_consumption" | "adjustment";
  at: string;
  flockId: string;
  flockLabel: string;
  quantityKg: number;
  deltaKg: number;
  reason: string;
  reference: string;
};

const PROCUREMENT_REASON_OPTIONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "internal_transfer_in", label: "Internal transfer in" },
  { value: "returned_stock", label: "Returned stock" },
  { value: "other", label: "Other" },
];

const CONSUMPTION_REASON_OPTIONS = [
  { value: "round_feed", label: "Round feed" },
  { value: "catchup_feed", label: "Catch-up feed" },
  { value: "spillage_adjusted", label: "Spillage adjusted" },
  { value: "other", label: "Other" },
];

const ADJUST_REASON_OPTIONS = [
  { value: "stock_count_correction", label: "Stock count correction" },
  { value: "damage_loss", label: "Damage/loss" },
  { value: "expired_feed", label: "Expired feed" },
  { value: "other", label: "Other" },
];

function reasonLabel(
  type: LedgerRow["type"],
  reason: string,
  procurement: { value: string; label: string }[],
  consumption: { value: string; label: string }[],
  adjust: { value: string; label: string }[],
): string {
  const table =
    type === "procurement_receipt"
      ? procurement
      : type === "feed_consumption"
        ? consumption
        : adjust;
  return table.find((x) => x.value === reason)?.label ?? reason;
}

export function FarmInventoryPage() {
  const { token, user } = useAuth();
  const procurementReasons = useReferenceOptions("inventory_procurement_reason", token, PROCUREMENT_REASON_OPTIONS);
  const consumptionReasons = useReferenceOptions("inventory_consumption_reason", token, CONSUMPTION_REASON_OPTIONS);
  const adjustReasons = useReferenceOptions("inventory_adjust_reason", token, ADJUST_REASON_OPTIONS);
  const { showToast } = useToast();
  const tTitle = useLaborerT("Feed inventory");
  const tBody = useLaborerT("Role-based stock controls for procurement, feeding, and adjustments.");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [balanceKg, setBalanceKg] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const [procQty, setProcQty] = useState("");
  const [procReasonCode, setProcReasonCode] = useState("supplier_delivery");
  const [procRef, setProcRef] = useState("");
  const [feedQty, setFeedQty] = useState<number>(0);
  const [feedReasonCode, setFeedReasonCode] = useState("round_feed");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReasonCode, setAdjReasonCode] = useState("stock_count_correction");
  const [activeTab, setActiveTab] = useState<"procurement" | "consumption" | "adjustment">("procurement");
  const [showEntryPanel, setShowEntryPanel] = useState(false);

  const canProcure =
    user?.role === "procurement_officer" || user?.role === "vet_manager" || user?.role === "manager" || user?.role === "superuser";
  const canFeed =
    user?.role === "laborer" || user?.role === "dispatcher" || user?.role === "vet_manager" || user?.role === "manager" || user?.role === "superuser";
  const canAdjust = user?.role === "manager" || user?.role === "superuser";

  const canRecordAny = canProcure || canFeed || canAdjust;

  function openEntryPanel() {
    setShowEntryPanel(true);
    if (canProcure) setActiveTab("procurement");
    else if (canFeed) setActiveTab("consumption");
    else if (canAdjust) setActiveTab("adjustment");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Failed to load flocks");
      const allFlocks = (fd.flocks as Flock[]) ?? [];
      setFlocks(allFlocks);
      const selected = flockId || allFlocks[0]?.id || "";
      setFlockId(selected);
      if (!selected) {
        setRows([]);
        setBalanceKg(0);
        return;
      }
      const [lr, br] = await Promise.all([
        fetch(`${API_BASE_URL}/api/inventory/ledger?flock_id=${encodeURIComponent(selected)}`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/inventory/balance?flock_id=${encodeURIComponent(selected)}`, {
          headers: readAuthHeaders(token),
        }),
      ]);
      const ld = await lr.json();
      const bd = await br.json();
      if (!lr.ok) throw new Error(ld.error ?? "Failed to load inventory ledger");
      if (!br.ok) throw new Error(bd.error ?? "Failed to load balances");
      setRows((ld.rows as LedgerRow[]) ?? []);
      const b = ((bd.balances as Array<{ balanceKg: number }>) ?? [])[0]?.balanceKg ?? 0;
      setBalanceKg(Number(b) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, flockId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(url: string, body: Record<string, unknown>, okMsg: string) {
    if (!flockId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}${url}`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ flockId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Request failed");
      showToast("success", okMsg);
      setShowEntryPanel(false);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const summaryCards = useMemo(
    () => [
      { label: "Current balance (kg)", value: balanceKg.toFixed(2) },
      { label: "Records", value: String(rows.length) },
      { label: "Role", value: user?.role ?? "-" },
    ],
    [balanceKg, rows.length, user?.role]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={tTitle} subtitle={tBody} />

      {loading ? <SkeletonList rows={3} /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error ? (
        <>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              {summaryCards.map((c) => (
                <div key={c.label} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <p className="text-neutral-500">{c.label}</p>
                  <p className="font-semibold text-neutral-900">{c.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-neutral-700">Flock</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={flockId}
                onChange={(e) => setFlockId(e.target.value)}
              >
                {flocks.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-900">Inventory ledger</h2>
              <a
                href={`${API_BASE_URL}/api/reports/feed-inventory.csv${flockId ? `?flockId=${encodeURIComponent(flockId)}` : ""}`}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                download
              >
                Export CSV
              </a>
            </div>
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <p className="font-medium text-neutral-900">
                    {r.type} - {r.deltaKg >= 0 ? "+" : ""}{r.deltaKg} kg
                  </p>
                  <p className="text-neutral-600">
                    {reasonLabel(r.type, r.reason, procurementReasons, consumptionReasons, adjustReasons) || "—"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(r.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </p>
                </div>
              ))}
              {!rows.length ? <p className="text-sm text-neutral-500">No inventory records yet.</p> : null}
            </div>
          </section>

          {canRecordAny ? (
            <div className="flex flex-wrap items-center gap-2">
              {!showEntryPanel ? (
                <button
                  type="button"
                  onClick={() => openEntryPanel()}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
                >
                  New transaction
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEntryPanel(false)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Close entry form
                </button>
              )}
            </div>
          ) : null}

          {showEntryPanel && canRecordAny ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-neutral-100 pb-3">
                {canProcure ? (
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTab === "procurement" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-neutral-300 text-neutral-700"}`}
                    onClick={() => setActiveTab("procurement")}
                  >
                    Receive stock
                  </button>
                ) : null}
                {canFeed ? (
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTab === "consumption" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-neutral-300 text-neutral-700"}`}
                    onClick={() => setActiveTab("consumption")}
                  >
                    Log consumption
                  </button>
                ) : null}
                {canAdjust ? (
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${activeTab === "adjustment" ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-neutral-300 text-neutral-700"}`}
                    onClick={() => setActiveTab("adjustment")}
                  >
                    Adjust stock
                  </button>
                ) : null}
              </div>
              <div className="mt-4 space-y-4">
          {canProcure && activeTab === "procurement" ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Procurement receipt</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Quantity kg" inputMode="decimal" value={procQty} onChange={(e) => setProcQty(e.target.value)} />
                <select className="rounded-lg border border-neutral-300 px-3 py-2" value={procReasonCode} onChange={(e) => setProcReasonCode(e.target.value)}>
                  {procurementReasons.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Reference (invoice/GRN)" value={procRef} onChange={(e) => setProcRef(e.target.value)} />
              </div>
              <button
                disabled={busy || !procQty}
                onClick={() =>
                  void post(
                    "/api/inventory/procurement",
                    { quantityKg: Number(procQty), reasonCode: procReasonCode, reason: procReasonCode, reference: procRef },
                    "Stock received"
                  )
                }
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save procurement
              </button>
            </section>
          ) : null}

          {canFeed && activeTab === "consumption" ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Feed consumption</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-neutral-300 px-3 py-2">
                  <p className="text-xs font-medium text-neutral-600">Consumption quantity (kg)</p>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => setFeedQty((v) => Math.max(0, Number((v - 5).toFixed(2))))}>-5</button>
                    <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => setFeedQty((v) => Math.max(0, Number((v - 1).toFixed(2))))}>-1</button>
                    <input readOnly className="w-full rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-center text-sm font-semibold" value={feedQty.toFixed(2)} />
                    <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => setFeedQty((v) => Number((v + 1).toFixed(2)))}>+1</button>
                    <button type="button" className="rounded border border-neutral-300 px-2 py-1 text-xs" onClick={() => setFeedQty((v) => Number((v + 5).toFixed(2)))}>+5</button>
                  </div>
                </div>
                <select className="rounded-lg border border-neutral-300 px-3 py-2" value={feedReasonCode} onChange={(e) => setFeedReasonCode(e.target.value)}>
                  {consumptionReasons.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={busy || feedQty <= 0}
                onClick={() => void post("/api/inventory/feed-consumption", { quantityKg: feedQty, reasonCode: feedReasonCode, reason: feedReasonCode }, "Feed usage logged")}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save feed usage
              </button>
            </section>
          ) : null}

          {canAdjust && activeTab === "adjustment" ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Manager adjustment</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Delta kg (+/-)" inputMode="decimal" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
                <select className="rounded-lg border border-neutral-300 px-3 py-2" value={adjReasonCode} onChange={(e) => setAdjReasonCode(e.target.value)}>
                  {adjustReasons.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={busy || !adjDelta}
                onClick={() => void post("/api/inventory/adjustments", { deltaKg: Number(adjDelta), reasonCode: adjReasonCode, reason: adjReasonCode }, "Adjustment saved")}
                className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save adjustment
              </button>
            </section>
          ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
