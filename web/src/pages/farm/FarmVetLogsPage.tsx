import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { FarmVetLogsFieldView } from "./FarmVetLogsFieldView";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { useLaborerT } from "../../i18n/laborerI18n";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/ui/Button";
import { API_BASE_URL } from "../../api/config";
import {
  fetchFlockFcrSnapshot,
  fetchVetLogDetail,
  type FcrBroilerSnapshot,
  type VetLogListRow,
} from "../../api/farm.api";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { canReviewVetLog, canSubmitVetLog, vetLogNeedsManagerReview } from "../../auth/permissions";
import { VetLogValuePreview } from "../../components/farm/VetLogValuePreview";
import {
  VetLogMortalityReviewSection,
  type MortalityReviewPayload,
} from "../../components/farm/VetLogMortalityReviewSection";
import { VetLogReport } from "../../components/farm/reports/VetLogReport";
import { SubmissionReportModal } from "../../components/farm/reports/SubmissionReportModal";
import { DataTable, type DataColumn } from "../../components/ui/DataTable";
import { StatusPill } from "../../components/ui/StatusPill";
import {
  FacetFilter,
  Modal,
  SegmentedControl,
  TablePagination,
  TableToolbar,
  ToolbarSearch,
} from "../../components/ui";
import { formatManagerDate } from "../../lib/formatManagerDateTime";
import { ManagerPage } from "../../components/layout/ManagerPage";

type VetLog = VetLogListRow & {
  reviewedByUserId?: string;
};

type MedicineOption = {
  id: string;
  name: string;
  unit: string;
};

const FALLBACK_MEDICINE_ROUTES = [
  { value: "drinking_water", label: "Drinking water" },
  { value: "feed_additive", label: "Feed additive" },
  { value: "injection", label: "Injection" },
  { value: "topical", label: "Topical" },
];

const FALLBACK_MEDICINE_DOSE_UNITS = [
  { value: "ml", label: "ml" },
  { value: "g", label: "g" },
  { value: "mg", label: "mg" },
  { value: "tablet", label: "tablet" },
  { value: "doses", label: "doses" },
  { value: "sachets", label: "sachets" },
  { value: "other", label: "other" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <StatusPill tone="success">Approved</StatusPill>;
  if (status === "pending_review") return <StatusPill tone="warning">Pending review</StatusPill>;
  return <StatusPill tone="danger">Rejected</StatusPill>;
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
  const { user } = useAuth();
  if (user?.role === "vet") {
    return <FarmVetLogsFieldView />;
  }
  return <FarmVetLogsManagerPage />;
}

function FarmVetLogsManagerPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const medicineRouteOptions = useReferenceOptions("medicine_admin_route", token, FALLBACK_MEDICINE_ROUTES);
  const medicineDoseUnitOptions = useReferenceOptions("treatment_dose_unit", token, FALLBACK_MEDICINE_DOSE_UNITS);
  const {
    flocks,
    flockId,
    setFlockId,
    listLoading,
    error: ctxError,
    loadFlocks,
  } = useFlockFieldContext(token, { defaultFlockId: "" });

  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Add a flock before logging mortality. Log only birds that died naturally or were culled.");

  const isReviewer = user ? canReviewVetLog(user) : false;
  const canSubmit = user ? canSubmitVetLog(user) : false;
  const needsManagerReview = user ? vetLogNeedsManagerReview(user) : false;

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
  const [mortalityReview, setMortalityReview] = useState<MortalityReviewPayload | null>(null);
  const [mortalityReviewValid, setMortalityReviewValid] = useState(false);

  const handleMortalityReviewChange = useCallback((payload: MortalityReviewPayload | null, valid: boolean) => {
    setMortalityReview(payload);
    setMortalityReviewValid(valid);
  }, []);

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
    if (!mortalityReviewValid || !mortalityReview) {
      showToast("error", "Complete the mortality review section before saving.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        flockId,
        logDate: form.logDate,
        observations: form.observations,
        actionsTaken: form.actionsTaken,
        recommendations: form.recommendations,
        mortalityReview,
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

  const vetLogColumns = useMemo((): DataColumn<VetLog>[] => {
    const cols: DataColumn<VetLog>[] = [
      { key: "date", header: "Log date", render: (l) => <span title={l.logDate}>{formatManagerDate(l.logDate)}</span> },
      { key: "author", header: "Author", render: (l) => l.authorName ?? l.authorUserId?.slice(0, 8) },
      {
        key: "weight",
        header: "Weight",
        className: "tbl-mono text-xs",
        render: (l) =>
          l.hasWeightSample || l.avgWeightKg != null
            ? `${Number(l.avgWeightKg).toFixed(2)} kg${l.sampleSize ? ` (n=${l.sampleSize})` : ""}`
            : "—",
      },
      { key: "medicine", header: "Medicine", className: "text-xs", render: (l) => l.medicineName ?? "—" },
      {
        key: "fcr",
        header: "FCR @ log",
        numeric: true,
        className: "tbl-mono text-xs",
        render: (l) => (l.fcrAtLogTime != null ? Number(l.fcrAtLogTime).toFixed(2) : "—"),
      },
      { key: "obs", header: "Observations", render: (l) => <span className="block max-w-[14rem] truncate">{l.observations || "—"}</span> },
      { key: "status", header: "Status", badge: true, render: (l) => <StatusBadge status={l.submissionStatus} /> },
      {
        key: "report",
        header: "Report",
        badge: true,
        render: (l) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              void openReport(l.id);
            }}
          >
            View
          </Button>
        ),
      },
    ];
    if (isReviewer) {
      cols.push({
        key: "review",
        header: "Review",
        badge: true,
        render: (l) =>
          l.submissionStatus === "pending_review" ? (
            <span className="flex flex-wrap justify-center gap-1">
              <Button variant="success" size="xs" onClick={(e) => { e.stopPropagation(); void handleReview(l.id, "approve"); }}>Approve</Button>
              <Button variant="danger" size="xs" onClick={(e) => { e.stopPropagation(); void handleReview(l.id, "reject"); }}>Reject</Button>
            </span>
          ) : (
            <span className="text-neutral-400">—</span>
          ),
      });
    }
    return cols;
  }, [isReviewer]);

  return (
    <ManagerPage>
      <PageHeader
        title="Vet logs"
        action={
          canSubmit ? (
            <Button size="sm" onClick={() => setShowNewLog(true)}>
              Create vet log
            </Button>
          ) : null
        }
      />

      {listLoading && <SkeletonList rows={3} />}
      {!listLoading && pageError && (
        <ErrorState message={pageError} onRetry={() => { void loadFlocks(); void loadLogs(); }} />
      )}

      {!listLoading && !ctxError && flocks.length === 0 ? (
        <FieldBlockedScreen title={noFlockTitle} description={noFlockBody} />
      ) : null}

      {!listLoading && !ctxError && flocks.length > 0 ? (
        <>
        <div className="table-block">
            {logsLoading ? (
              <div className="p-card">
                <SkeletonList rows={4} />
              </div>
            ) : (
              <DataTable<VetLog>
                flush
                columns={vetLogColumns}
                rows={logs}
                rowKey={(l) => l.id}
                onRowClick={(l) => void openReport(l.id)}
                isFiltered={statusFilter !== "all" || Boolean(flockId) || searchQ.trim().length > 0}
                emptyTitle="No vet logs"
                emptyDescription=""
                filteredEmptyTitle="No matching vet logs"
                filteredEmptyDescription=""
                toolbar={
                  <TableToolbar
                    filters={
                      <>
                        <SegmentedControl
                          size="sm"
                          value={statusFilter}
                          onChange={(v) => {
                            setStatusFilter(v);
                            setPage(1);
                          }}
                          options={[
                            { value: "all", label: "All" },
                            { value: "pending_review", label: "Pending" },
                            { value: "approved", label: "Approved" },
                            { value: "rejected", label: "Rejected" },
                          ]}
                        />
                        <FacetFilter
                          label="Flock"
                          value={flockId || "all"}
                          allValue="all"
                          onChange={(v) => {
                            setFlockId(v === "all" ? "" : v);
                            setPage(1);
                          }}
                          options={flocks.map((f) => ({ value: f.id, label: f.label }))}
                        />
                      </>
                    }
                    search={
                      <ToolbarSearch
                        placeholder="Search keywords…"
                        value={searchQ}
                        onChange={(e) => {
                          setSearchQ(e.target.value);
                          setPage(1);
                        }}
                        label="Search vet logs"
                      />
                    }
                    meta={`${total} rows`}
                  />
                }
                renderMobileCard={(l) => (
                  <button
                    type="button"
                    onClick={() => void openReport(l.id)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[var(--text-primary)]">{formatManagerDate(l.logDate)}</p>
                      <StatusBadge status={l.submissionStatus} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">
                      {l.authorName ?? l.authorUserId?.slice(0, 8)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-primary)] line-clamp-2">{l.observations || "—"}</p>
                  </button>
                )}
              />
            )}
          </div>

          {!logsLoading && logs.length > 0 ? (
            <TablePagination page={page} pageSize={30} total={total} onPageChange={setPage} />
          ) : null}

          <Modal
            open={showNewLog && canSubmit}
            title="Create vet log"
            onClose={() => setShowNewLog(false)}
            wide
          >
            <form onSubmit={(ev) => void handleSubmit(ev)} className="space-y-4">
              {!flockId ? (
                <p className="text-sm text-[var(--status-warning)]">Select a flock in the table filters before saving.</p>
              ) : null}

              {flockId ? (
                <VetLogValuePreview
                  snap={fcrSnap}
                  previewAvgWeightKg={previewAvgWeight}
                  sampleSize={previewSampleSize}
                />
              ) : null}

              {flockId ? (
                <VetLogMortalityReviewSection
                  token={token ?? ""}
                  flockId={flockId}
                  logDate={form.logDate}
                  onChange={handleMortalityReviewChange}
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

              <fieldset className="space-y-2 rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--status-success) 70%, transparent)", backgroundColor: "color-mix(in srgb, var(--status-success-soft) 30%, transparent)" }}>
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[var(--status-success)]">
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
                        {medicineDoseUnitOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-neutral-700">
                      Route
                      <select className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" value={form.medicineRoute} onChange={(e) => setForm((f) => ({ ...f, medicineRoute: e.target.value }))}>
                        {medicineRouteOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
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

              <Button variant="primary" type="submit" disabled={busy || !flockId || !mortalityReviewValid} loading={busy}>
                {needsManagerReview ? "Submit for review" : "Save vet log"}
              </Button>
            </form>
          </Modal>

          <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
            {reportLoading ? (
              <div className="p-card"><SkeletonList rows={4} /></div>
            ) : reportLog ? (
              <VetLogReport log={reportLog} onClose={() => setReportOpen(false)} />
            ) : null}
          </SubmissionReportModal>
        </>
      ) : null}
    </ManagerPage>
  );
}
