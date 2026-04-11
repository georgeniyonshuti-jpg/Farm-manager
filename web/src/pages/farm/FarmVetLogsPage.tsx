import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { roleAtLeast } from "../../auth/permissions";

type VetLog = {
  id: string;
  flockId: string;
  authorUserId: string;
  authorName?: string;
  logDate: string;
  observations?: string;
  actionsTaken?: string;
  recommendations?: string;
  submissionStatus: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Approved</span>;
  if (status === "pending_review") return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Pending review</span>;
  return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-800">Rejected</span>;
}

export function FarmVetLogsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const {
    flocks,
    flockId,
    setFlockId,
    listLoading,
    error: ctxError,
    loadFlocks,
  } = useFlockFieldContext(token);

  const isReviewer = user ? roleAtLeast(user, "vet_manager") : false;

  const [logs, setLogs] = useState<VetLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [observations, setObservations] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [showNewLog, setShowNewLog] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const params = new URLSearchParams();
      if (flockId) params.set("flockId", flockId);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQ) params.set("q", searchQ);
      params.set("page", String(page));
      params.set("pageSize", "30");
      const r = await fetch(`${API_BASE_URL}/api/vet-logs?${params}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setLogs((d as { logs: VetLog[] }).logs ?? []);
      setTotal((d as { total: number }).total ?? 0);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLogsLoading(false);
    }
  }, [token, flockId, statusFilter, searchQ, page]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId || !logDate) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/vet-logs`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ flockId, logDate, observations, actionsTaken, recommendations }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      showToast("success", "Vet log saved.");
      setObservations("");
      setActionsTaken("");
      setRecommendations("");
      setLogDate(new Date().toISOString().slice(0, 10));
      setShowNewLog(false);
      void loadLogs();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(logId: string, action: "approve" | "reject") {
    try {
      const r = await fetch(`${API_BASE_URL}/api/vet-logs/${encodeURIComponent(logId)}/review`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ action }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Review failed");
      }
      showToast("success", `Vet log ${action}d.`);
      void loadLogs();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Review failed");
    }
  }

  const pageError = ctxError ?? logsError;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Vet logs" subtitle="Clinical observations per flock/day. Vet+ can submit, vet manager+ can review." />

      {listLoading && <SkeletonList rows={3} />}
      {!listLoading && pageError && (
        <ErrorState message={pageError} onRetry={() => { void loadFlocks(); void loadLogs(); }} />
      )}

      {!listLoading && !ctxError && flocks.length === 0 ? (
        <EmptyState title="No flocks" description="Create a flock first." />
      ) : null}

      {!listLoading && !ctxError && flocks.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm font-medium text-neutral-700">
              Flock
              <select className="mt-1 block w-52 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={flockId} onChange={(e) => { setFlockId(e.target.value); setPage(1); }}>
                {flocks.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Status
              <select className="mt-1 block w-40 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="pending_review">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Search
              <input className="mt-1 block w-44 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" placeholder="Keywords…" value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setPage(1); }} />
            </label>
          </div>

          {logsLoading && <SkeletonList rows={4} />}

          {!logsLoading && logs.length === 0 ? (
            <EmptyState title="No vet logs" description="Create a new log when you have observations to record." />
          ) : null}

          {!logsLoading && logs.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Author</th>
                      <th className="px-3 py-2">Observations</th>
                      <th className="px-3 py-2">Actions</th>
                      <th className="px-3 py-2">Status</th>
                      {isReviewer ? <th className="px-3 py-2">Review</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{l.logDate}</td>
                        <td className="px-3 py-2">{l.authorName ?? l.authorUserId?.slice(0, 8)}</td>
                        <td className="max-w-xs truncate px-3 py-2">{l.observations || "—"}</td>
                        <td className="max-w-xs truncate px-3 py-2">{l.actionsTaken || "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={l.submissionStatus} /></td>
                        {isReviewer ? (
                          <td className="px-3 py-2">
                            {l.submissionStatus === "pending_review" ? (
                              <span className="flex gap-1">
                                <button type="button" onClick={() => void handleReview(l.id, "approve")} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Approve</button>
                                <button type="button" onClick={() => void handleReview(l.id, "reject")} className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Reject</button>
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-sm text-neutral-600">
                <span>{total} total</span>
                <span className="flex gap-2">
                  <button type="button" disabled={page <= 1} className="rounded border px-2 py-1 text-xs disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                  <span className="px-1">Page {page}</span>
                  <button type="button" disabled={page * 30 >= total} className="rounded border px-2 py-1 text-xs disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Next</button>
                </span>
              </div>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowNewLog((v) => !v)}
              className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              {showNewLog ? "Close" : "Create new vet log"}
            </button>
          </div>

          {showNewLog ? (
            <form onSubmit={(ev) => void handleSubmit(ev)} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-800">New vet log</p>
              <label className="block text-sm font-medium text-neutral-700">
                Log date
                <input type="date" className="mt-1 block w-44 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Observations
                <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Actions taken
                <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={2} value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Recommendations
                <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={2} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
              </label>
              <button type="submit" disabled={busy || !flockId} className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : "Save vet log"}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
