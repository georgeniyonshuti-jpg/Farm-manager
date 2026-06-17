import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import {
  fetchFlockFcrSnapshot,
  fetchVetLogDetail,
  type FcrBroilerSnapshot,
  type VetLogListRow,
} from "../../api/farm.api";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { canReviewVetLog, canSubmitVetLog, vetLogNeedsManagerReview } from "../../auth/permissions";
import { FlockPerformancePanel } from "../../components/farm/FlockPerformancePanel";
import { VetLogValuePreview } from "../../components/farm/VetLogValuePreview";
import { VetLogReport } from "../../components/farm/reports/VetLogReport";
import { SubmissionReportModal } from "../../components/farm/reports/SubmissionReportModal";

type VetLog = VetLogListRow & {
  reviewedByUserId?: string;
};

type MedicineOption = {
  id: string;
  name: string;
  unit: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">Approved</span>;
  if (status === "pending_review") return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Pending review</span>;
  return <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-800">Rejected</span>;
}

function resetFormState() {
  return {
    observations: "",
    actionsTaken: "",
    recommendations: "",
    logDate: new Date().toISOString().slice(0, 10),
    includeWeight: false,
    sampleSize: "30",
    avgWeightKg: "",
    cvPct: "",
    underweightPct: "",
    includeMedicine: false,
    medicineId: "",
    medicineName: "",
    medicineDose: "",
    medicineDoseUnit: "ml",
    medicineRoute: "drinking_water",
    medicineReason: "",
    medicineNotes: "",
  };
}

export function FarmVetLogsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const {
    flocks,
    flockId,
    setFlockId,
    listLoading,
    error: ctxError,
    loadFlocks,
  } = useFlockFieldContext(token, { defaultFlockId: "" });

  const isReviewer = user ? canReviewVetLog(user) : false;
  const canSubmit = user ? canSubmitVetLog(user) : false;
  const needsManagerReview = user ? vetLogNeedsManagerReview(user) : false;
  const selectedFlock = useMemo(
    () => flocks.find((f) => f.id === flockId) ?? null,
    [flocks, flockId]
  );

  const [logs, setLogs] = useState<VetLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [form, setForm] = useState(resetFormState);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [fcrSnap, setFcrSnap] = useState<FcrBroilerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNewLog, setShowNewLog] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLog, setReportLog] = useState<VetLogListRow | null>(null);

  useEffect(() => {
    const preselect = searchParams.get("flockId");
    if (preselect) setFlockId(preselect);
  }, [searchParams, setFlockId]);

  useEffect(() => {
    if (!token || !flockId || !showNewLog) {
      setFcrSnap(null);
      return;
    }
    void fetchFlockFcrSnapshot(token, flockId)
      .then(setFcrSnap)
      .catch(() => setFcrSnap(null));
  }, [token, flockId, showNewLog]);

  useEffect(() => {
    if (!token || !showNewLog) return;
    void fetch(`${API_BASE_URL}/api/medicine`, { headers: readAuthHeaders(token) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) return;
        setMedicines((d as { medicines?: MedicineOption[] }).medicines ?? []);
      })
      .catch(() => setMedicines([]));
  }, [token, showNewLog]);

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

  const previewAvgWeight = form.includeWeight && form.avgWeightKg ? Number(form.avgWeightKg) : null;
  const previewSampleSize = form.includeWeight && form.sampleSize ? Number(form.sampleSize) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId || !form.logDate) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        flockId,
        logDate: form.logDate,
        observations: form.observations,
        actionsTaken: form.actionsTaken,
        recommendations: form.recommendations,
      };

      if (form.includeWeight) {
        const sampleSize = Number(form.sampleSize);
        const avgWeightKg = Number(form.avgWeightKg);
        if (!Number.isFinite(sampleSize) || sampleSize < 1 || !Number.isFinite(avgWeightKg) || avgWeightKg <= 0) {
          throw new Error("Weight sample requires sample size (≥1) and average weight (kg).");
        }
        body.weightSample = {
          sampleSize,
          avgWeightKg,
          totalFeedUsedKg: fcrSnap?.feedToDateKg,
          cvPct: form.cvPct ? Number(form.cvPct) : undefined,
          underweightPct: form.underweightPct ? Number(form.underweightPct) : undefined,
        };
      }

      if (form.includeMedicine) {
        const dose = Number(form.medicineDose);
        const med = medicines.find((m) => m.id === form.medicineId);
        const medicineName = form.medicineName.trim() || med?.name || "";
        if (!medicineName || !Number.isFinite(dose) || dose <= 0) {
          throw new Error("Medicine requires name and dose.");
        }
        body.medicine = {
          medicineId: form.medicineId || undefined,
          medicineName,
          dose,
          doseUnit: form.medicineDoseUnit,
          route: form.medicineRoute,
          diseaseOrReason: form.medicineReason || undefined,
          notes: form.medicineNotes || undefined,
        };
      }

      const r = await fetch(`${API_BASE_URL}/api/vet-logs`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      showToast(
        "success",
        needsManagerReview
          ? "Vet log submitted for manager review."
          : "Vet log saved and synced."
      );
      setForm(resetFormState());
      setShowNewLog(false);
      void loadLogs();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function openReport(logId: string) {
    if (!token) return;
    setReportOpen(true);
    setReportLoading(true);
    setReportLog(null);
    try {
      const d = await fetchVetLogDetail(token, logId);
      setReportLog(d.log);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not load report");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
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
      showToast("success", action === "approve" ? "Approved — ERPNext sync queued." : `Vet log ${action}d.`);
      void loadLogs();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Review failed");
    }
  }

  const pageError = ctxError ?? logsError;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Vet logs"
        subtitle={
          needsManagerReview
            ? "Record visits with optional weight samples and medicine. Submissions need vet manager (or manager) approval before ERPNext valuation updates."
            : isReviewer
              ? "Submit visits or review junior vet logs. Weight samples drive live-bird value in ERPNext."
              : "Clinical visits per flock — weight samples drive live-bird value; medicine feeds flock spend in ERPNext."
        }
      />

      {listLoading && <SkeletonList rows={3} />}
      {!listLoading && pageError && (
        <ErrorState message={pageError} onRetry={() => { void loadFlocks(); void loadLogs(); }} />
      )}

      {!listLoading && !ctxError && flocks.length === 0 ? (
        <EmptyState title="No flocks" description="Create a flock first." />
      ) : null}

      {!listLoading && !ctxError && flocks.length > 0 ? (
        <>
          {flockId ? (
            <FlockPerformancePanel
              flockId={flockId}
              flockLabel={selectedFlock?.label}
              flockCode={selectedFlock?.code}
              placementDate={selectedFlock?.placementDate}
            />
          ) : (
            <p className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
              Select a flock to view cumulative FCR and performance context.
            </p>
          )}

          <div className="table-block">
            <div className="table-toolbar">
              <input
                className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                placeholder="Search keywords…"
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
              />
              <select
                className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                value={flockId}
                onChange={(e) => { setFlockId(e.target.value); setPage(1); }}
              >
                <option value="">All flocks</option>
                {flocks.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select
                className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending_review">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
              <span className="ml-auto text-xs text-neutral-500">{total} rows</span>
            </div>

            {logsLoading && <div className="p-4"><SkeletonList rows={4} /></div>}

            {!logsLoading && logs.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No vet logs" description="Create a new log when you have observations to record." />
              </div>
            ) : null}

            {!logsLoading && logs.length > 0 ? (
              <div className="institutional-table-wrapper">
                <table className="institutional-table min-w-[72rem]">
                  <thead>
                    <tr>
                      <th>Log date</th>
                      <th>Author</th>
                      <th>Weight</th>
                      <th>Medicine</th>
                      <th>FCR @ log</th>
                      <th>Observations</th>
                      <th>Status</th>
                      <th className="tbl-actions">Report</th>
                      {isReviewer ? <th className="tbl-actions">Review</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="cursor-pointer hover:bg-[var(--table-row-hover)]" onClick={() => void openReport(l.id)}>
                        <td className="tbl-mono">{l.logDate}</td>
                        <td className="whitespace-nowrap">{l.authorName ?? l.authorUserId?.slice(0, 8)}</td>
                        <td className="tbl-mono text-xs">
                          {l.hasWeightSample || l.avgWeightKg != null
                            ? `${Number(l.avgWeightKg).toFixed(2)} kg${l.sampleSize ? ` (n=${l.sampleSize})` : ""}`
                            : "—"}
                        </td>
                        <td className="text-xs">{l.medicineName ?? "—"}</td>
                        <td className="tbl-mono text-xs">{l.fcrAtLogTime != null ? Number(l.fcrAtLogTime).toFixed(2) : "—"}</td>
                        <td style={{ maxWidth: "14rem" }}>{l.observations || "—"}</td>
                        <td className="tbl-badge"><StatusBadge status={l.submissionStatus} /></td>
                        <td className="tbl-actions">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openReport(l.id);
                            }}
                            className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs font-semibold text-[var(--primary-color)]"
                          >
                            View
                          </button>
                        </td>
                        {isReviewer ? (
                          <td className="tbl-actions">
                            {l.submissionStatus === "pending_review" ? (
                              <span className="flex flex-wrap gap-1 justify-center">
                                <button type="button" onClick={(e) => { e.stopPropagation(); void handleReview(l.id, "approve"); }} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Approve</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); void handleReview(l.id, "reject"); }} className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Reject</button>
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {!logsLoading && logs.length > 0 ? (
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{total} total</span>
              <span className="flex gap-1.5">
                <button type="button" disabled={page <= 1} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
                <span className="px-1 py-1">Page {page} of {Math.ceil(total / 30) || 1}</span>
                <button type="button" disabled={page * 30 >= total} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Next →</button>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canSubmit ? (
              <button
                type="button"
                onClick={() => setShowNewLog((v) => !v)}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
              >
                {showNewLog ? "Close" : "Create new vet log"}
              </button>
            ) : null}
          </div>

          {showNewLog && canSubmit ? (
            <form onSubmit={(ev) => void handleSubmit(ev)} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-neutral-800">New vet log</p>
              {!flockId ? (
                <p className="text-sm text-amber-800">Select a flock above before saving.</p>
              ) : null}

              {flockId ? (
                <VetLogValuePreview
                  snap={fcrSnap}
                  previewAvgWeightKg={previewAvgWeight}
                  sampleSize={previewSampleSize}
                />
              ) : null}

              <label className="block text-sm font-medium text-neutral-700">
                Log date
                <input
                  type="date"
                  className="mt-1 block w-44 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  value={form.logDate}
                  onChange={(e) => setForm((f) => ({ ...f, logDate: e.target.value }))}
                />
              </label>

              <fieldset className="space-y-2 rounded-xl border border-neutral-200 p-3">
                <legend className="px-1 text-sm font-semibold text-neutral-800">Clinical notes</legend>
                <label className="block text-sm font-medium text-neutral-700">
                  Observations
                  <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={3} value={form.observations} onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Actions taken
                  <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={2} value={form.actionsTaken} onChange={(e) => setForm((f) => ({ ...f, actionsTaken: e.target.value }))} />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Recommendations
                  <textarea className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" rows={2} value={form.recommendations} onChange={(e) => setForm((f) => ({ ...f, recommendations: e.target.value }))} />
                </label>
              </fieldset>

              <fieldset className="space-y-2 rounded-xl border border-emerald-200/70 bg-emerald-50/30 p-3">
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-emerald-900">
                  <input
                    type="checkbox"
                    checked={form.includeWeight}
                    onChange={(e) => setForm((f) => ({ ...f, includeWeight: e.target.checked }))}
                  />
                  Weight sample (optional)
                </legend>
                {form.includeWeight ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-neutral-700">
                      Birds weighed (n)
                      <input type="number" min={1} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.sampleSize} onChange={(e) => setForm((f) => ({ ...f, sampleSize: e.target.value }))} />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Avg weight (kg)
                      <input type="number" step="0.001" min={0} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.avgWeightKg} onChange={(e) => setForm((f) => ({ ...f, avgWeightKg: e.target.value }))} />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      CV % (optional)
                      <input type="number" step="0.1" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.cvPct} onChange={(e) => setForm((f) => ({ ...f, cvPct: e.target.value }))} />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Underweight % (optional)
                      <input type="number" step="0.1" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.underweightPct} onChange={(e) => setForm((f) => ({ ...f, underweightPct: e.target.value }))} />
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">Enable to record a flock weight sample — updates biomass for IAS 41 carrying value in ERPNext.</p>
                )}
              </fieldset>

              <fieldset className="space-y-2 rounded-xl border border-violet-200/70 bg-violet-50/30 p-3">
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-violet-900">
                  <input
                    type="checkbox"
                    checked={form.includeMedicine}
                    onChange={(e) => setForm((f) => ({ ...f, includeMedicine: e.target.checked }))}
                  />
                  Medicine administered (optional)
                </legend>
                {form.includeMedicine ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
                      From inventory
                      <select
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                        value={form.medicineId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const med = medicines.find((m) => m.id === id);
                          setForm((f) => ({
                            ...f,
                            medicineId: id,
                            medicineName: med?.name ?? f.medicineName,
                            medicineDoseUnit: med?.unit ?? f.medicineDoseUnit,
                          }));
                        }}
                      >
                        <option value="">— Manual name below —</option>
                        {medicines.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
                      Medicine name
                      <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineName} onChange={(e) => setForm((f) => ({ ...f, medicineName: e.target.value }))} />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Dose
                      <input type="number" step="0.01" min={0} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineDose} onChange={(e) => setForm((f) => ({ ...f, medicineDose: e.target.value }))} />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Unit
                      <select className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineDoseUnit} onChange={(e) => setForm((f) => ({ ...f, medicineDoseUnit: e.target.value }))}>
                        <option value="ml">ml</option>
                        <option value="g">g</option>
                        <option value="doses">doses</option>
                        <option value="sachets">sachets</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Route
                      <select className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineRoute} onChange={(e) => setForm((f) => ({ ...f, medicineRoute: e.target.value }))}>
                        <option value="drinking_water">Drinking water</option>
                        <option value="feed_additive">Feed additive</option>
                        <option value="injection">Injection</option>
                        <option value="topical">Topical</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Reason
                      <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineReason} onChange={(e) => setForm((f) => ({ ...f, medicineReason: e.target.value }))} placeholder="e.g. respiratory" />
                    </label>
                    <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
                      Notes
                      <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineNotes} onChange={(e) => setForm((f) => ({ ...f, medicineNotes: e.target.value }))} />
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-600">Creates a treatment record linked to this visit — feeds medicine spend in ERPNext.</p>
                )}
              </fieldset>

              <button type="submit" disabled={busy || !flockId} className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : needsManagerReview ? "Submit for review" : "Save vet log"}
              </button>
            </form>
          ) : null}

          <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
            {reportLoading ? (
              <p className="p-8 text-center text-sm text-[var(--text-muted)] animate-pulse">Loading report…</p>
            ) : reportLog ? (
              <VetLogReport log={reportLog} onClose={() => setReportOpen(false)} />
            ) : null}
          </SubmissionReportModal>
        </>
      ) : null}
    </div>
  );
}
