import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";

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

export function FarmInventoryPage() {
  const { token, user } = useAuth();
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
  const [procReason, setProcReason] = useState("Stock receipt");
  const [procRef, setProcRef] = useState("");
  const [feedQty, setFeedQty] = useState("");
  const [feedReason, setFeedReason] = useState("Feed consumed");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("Manager adjustment");

  const canProcure = user?.role === "procurement_officer" || user?.role === "manager" || user?.role === "superuser";
  const canFeed = user?.role === "laborer" || user?.role === "dispatcher" || user?.role === "manager" || user?.role === "superuser";
  const canAdjust = user?.role === "manager" || user?.role === "superuser";

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
    <div className="space-y-5">
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

          {canProcure ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Procurement receipt</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Quantity kg" inputMode="decimal" value={procQty} onChange={(e) => setProcQty(e.target.value)} />
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Reason" value={procReason} onChange={(e) => setProcReason(e.target.value)} />
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Reference (invoice/GRN)" value={procRef} onChange={(e) => setProcRef(e.target.value)} />
              </div>
              <button
                disabled={busy || !procQty}
                onClick={() => void post("/api/inventory/procurement", { quantityKg: Number(procQty), reason: procReason, reference: procRef }, "Stock received")}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save procurement
              </button>
            </section>
          ) : null}

          {canFeed ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Feed consumption</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Quantity kg" inputMode="decimal" value={feedQty} onChange={(e) => setFeedQty(e.target.value)} />
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Reason" value={feedReason} onChange={(e) => setFeedReason(e.target.value)} />
              </div>
              <button
                disabled={busy || !feedQty}
                onClick={() => void post("/api/inventory/feed-consumption", { quantityKg: Number(feedQty), reason: feedReason }, "Feed usage logged")}
                className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save feed usage
              </button>
            </section>
          ) : null}

          {canAdjust ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Manager adjustment</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Delta kg (+/-)" inputMode="decimal" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
                <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Reason" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              </div>
              <button
                disabled={busy || !adjDelta}
                onClick={() => void post("/api/inventory/adjustments", { deltaKg: Number(adjDelta), reason: adjReason }, "Adjustment saved")}
                className="mt-3 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save adjustment
              </button>
            </section>
          ) : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-900">Inventory ledger</h2>
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                  <p className="font-medium text-neutral-900">
                    {r.type} - {r.deltaKg >= 0 ? "+" : ""}{r.deltaKg} kg
                  </p>
                  <p className="text-neutral-600">{r.reason || "—"}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(r.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </p>
                </div>
              ))}
              {!rows.length ? <p className="text-sm text-neutral-500">No inventory records yet.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
