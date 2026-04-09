import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";

type FlockListRow = { id: string; label: string };

type OpsSummary = {
  window: { startAt: string; endAt: string; flockId: string | null };
  roundCheckins: number;
  feedEntries: number;
  managerLogs: number;
  inventoryTransactions: number;
  overdueFlocks: number;
};

function toStartIso(ymd: string): string {
  const d = `${ymd}T00:00:00.000Z`;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function toEndIso(ymd: string): string {
  const d = `${ymd}T23:59:59.999Z`;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function ymdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export function FarmOpsReportsPage() {
  const { token, user } = useAuth();
  const dashboardHref =
    user?.role === "manager" ? "/dashboard/management" : user?.role === "vet_manager" ? "/dashboard/vet" : "/dashboard/management";
  const dashboardLabel = user?.role === "vet_manager" ? "Vet home" : "Command center";
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<FlockListRow[]>([]);
  const [flockFilter, setFlockFilter] = useState("");
  const [flocksLoading, setFlocksLoading] = useState(true);
  const [flocksError, setFlocksError] = useState<string | null>(null);
  const [startYmd, setStartYmd] = useState(() => ymdDaysAgo(7));
  const [endYmd, setEndYmd] = useState(() => ymdToday());
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadFlocks = useCallback(async () => {
    if (!token) {
      setFlocks([]);
      setFlocksLoading(false);
      return;
    }
    setFlocksError(null);
    setFlocksLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Flocks failed");
      setFlocks(((d as { flocks?: FlockListRow[] }).flocks) ?? []);
    } catch (e) {
      setFlocks([]);
      setFlocksError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setFlocksLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFlocks();
  }, [loadFlocks]);

  const queryBase = useMemo(() => {
    const p = new URLSearchParams();
    p.set("start_at", toStartIso(startYmd));
    p.set("end_at", toEndIso(endYmd));
    if (flockFilter) p.set("flock_id", flockFilter);
    return p.toString();
  }, [startYmd, endYmd, flockFilter]);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/farm/ops-summary?${queryBase}`, {
        headers: readAuthHeaders(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Load failed (${res.status})`);
      setSummary(data as OpsSummary);
    } catch (e) {
      setSummary(null);
      setSummaryError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setSummaryLoading(false);
    }
  }, [token, queryBase]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function downloadCsv(path: string, filename: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}${path}?${queryBase}`, { headers: readAuthHeaders(token) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Download failed");
    }
  }

  const loading = flocksLoading;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Field ops reports"
        subtitle="Summary counts and CSV exports for vet manager, managers, and superuser."
        action={
          <Link to={dashboardHref} className="text-sm font-medium text-emerald-800 hover:underline">
            {dashboardLabel}
          </Link>
        }
      />

      {loading && <SkeletonList rows={2} />}
      {!loading && flocksError && (
        <ErrorState message={flocksError} onRetry={() => void loadFlocks()} />
      )}

      {!loading && !flocksError ? (
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-neutral-700">
            Flock (optional filter)
            <select
              className="mt-1 w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
              value={flockFilter}
              onChange={(e) => setFlockFilter(e.target.value)}
            >
              <option value="">All flocks</option>
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              From
              <input
                type="date"
                className="mt-1 w-full min-h-[48px] rounded-xl border border-neutral-300 px-3"
                value={startYmd}
                onChange={(e) => setStartYmd(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              To
              <input
                type="date"
                className="mt-1 w-full min-h-[48px] rounded-xl border border-neutral-300 px-3"
                value={endYmd}
                onChange={(e) => setEndYmd(e.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {!loading && !flocksError ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
          {summaryLoading ? <p className="mt-2 text-sm text-neutral-600">Loading…</p> : null}
          {summaryError ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {summaryError}{" "}
              <button type="button" className="font-semibold underline" onClick={() => void loadSummary()}>
                Retry
              </button>
            </p>
          ) : null}
          {summary && !summaryLoading ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <dt className="text-xs font-medium text-neutral-500">Round check-ins</dt>
                <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{summary.roundCheckins}</dd>
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <dt className="text-xs font-medium text-neutral-500">Feed entries</dt>
                <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{summary.feedEntries}</dd>
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <dt className="text-xs font-medium text-neutral-500">Manager check-ins</dt>
                <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{summary.managerLogs}</dd>
              </div>
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <dt className="text-xs font-medium text-neutral-500">Inventory movements</dt>
                <dd className="text-2xl font-semibold tabular-nums text-neutral-900">{summary.inventoryTransactions}</dd>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2 sm:col-span-2">
                <dt className="text-xs font-medium text-amber-900">Flocks overdue for round check-in (now)</dt>
                <dd className="text-2xl font-semibold tabular-nums text-amber-950">{summary.overdueFlocks}</dd>
              </div>
            </dl>
          ) : null}
          {summary?.window ? (
            <p className="mt-3 text-xs text-neutral-500">
              Window: {new Date(summary.window.startAt).toLocaleString()} —{" "}
              {new Date(summary.window.endAt).toLocaleString()}
              {summary.window.flockId ? ` • flock ${summary.window.flockId}` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {!loading && !flocksError ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">CSV downloads</h2>
          <p className="mt-1 text-xs text-neutral-600">Uses the same date range and flock filter as the summary.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              onClick={() => void downloadCsv("/api/reports/round-checkins.csv", "round-checkins.csv")}
            >
              Round check-ins
            </button>
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              onClick={() => void downloadCsv("/api/reports/feed-entries.csv", "feed-entries.csv")}
            >
              Feed entries
            </button>
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              onClick={() => void downloadCsv("/api/reports/daily-logs.csv", "manager-daily-logs.csv")}
            >
              Manager check-ins
            </button>
            <button
              type="button"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              onClick={() => void downloadCsv("/api/reports/inventory-movements.csv", "inventory-movements.csv")}
            >
              Inventory movements
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
