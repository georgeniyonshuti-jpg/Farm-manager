import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import {
  fetchCheckinDetail,
  fetchPendingCheckins,
  reviewCheckin,
  type CheckinDetailRow,
  type CheckinListRow,
} from "../../api/farm.api";
import { SubmissionListTable } from "../../components/farm/reports/SubmissionListTable";
import { CheckinPhotoReport } from "../../components/farm/reports/CheckinPhotoReport";
import { SubmissionReportModal } from "../../components/farm/reports/SubmissionReportModal";

function formatMeta(c: CheckinListRow): string {
  const parts: string[] = [];
  if (c.coopTemperatureC != null) parts.push(`${c.coopTemperatureC} °C`);
  if (Number(c.mortalityAtCheckin ?? 0) > 0) parts.push(`mortality ${c.mortalityAtCheckin}`);
  if (c.hasPhotos) parts.push("has photos");
  if (c.notesExcerpt) parts.push(c.notesExcerpt.slice(0, 40));
  return parts.join(" · ") || "—";
}

function rowToCsv(checkinsToExport: CheckinListRow[]): string {
  const header = [
    "id",
    "flockId",
    "flockCode",
    "submitterId",
    "submitterName",
    "submittedAt",
    "submissionStatus",
    "coopTemperatureC",
    "feedAvailable",
    "waterAvailable",
    "feedKg",
    "waterL",
    "mortalityAtCheckin",
    "mortalityReportedInMortalityLog",
    "hasPhotos",
    "notesExcerpt",
  ];
  const lines = [header.join(",")];
  for (const c of checkinsToExport) {
    const row = [
      c.id,
      c.flockId,
      c.flockCode ?? "",
      c.laborerId,
      c.laborerName ?? "",
      c.at,
      c.submissionStatus ?? "",
      c.coopTemperatureC == null ? "" : String(c.coopTemperatureC),
      String(Boolean(c.feedAvailable)),
      String(Boolean(c.waterAvailable)),
      String(Number(c.feedKg ?? 0)),
      String(Number(c.waterL ?? 0)),
      String(Number(c.mortalityAtCheckin ?? 0)),
      String(Boolean(c.mortalityReportedInMortalityLog)),
      String(Boolean(c.hasPhotos)),
      c.notesExcerpt ?? "",
    ].map((v) => JSON.stringify(String(v)));
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export function FarmCheckinReviewPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [checkins, setCheckins] = useState<CheckinListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportCheckin, setReportCheckin] = useState<CheckinDetailRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const d = await fetchPendingCheckins(token);
      setCheckins(d.checkins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openReport(id: string) {
    if (!token) return;
    setSelectedId(id);
    setReportOpen(true);
    setReportLoading(true);
    setReportCheckin(null);
    try {
      const d = await fetchCheckinDetail(token, id);
      setReportCheckin(d.checkin);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load report");
      setReportOpen(false);
      setSelectedId(null);
    } finally {
      setReportLoading(false);
    }
  }

  function closeReport() {
    setReportOpen(false);
    setReportCheckin(null);
    setSelectedId(null);
  }

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await reviewCheckin(token, id, action);
      showToast("success", action === "approve" ? "Check-in approved." : "Check-in rejected.");
      if (selectedId === id) closeReport();
      void load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  function downloadCsv(checkinsToExport: CheckinListRow[], filename: string) {
    const csv = rowToCsv(checkinsToExport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const rows = useMemo(
    () =>
      checkins.map((c) => ({
        id: c.id,
        dateLabel: new Date(c.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" }),
        flockLabel: c.flockCode ?? c.flockId.slice(0, 8),
        authorLabel: c.laborerName ?? c.laborerId.slice(0, 8),
        status: c.submissionStatus ?? "pending_review",
        meta: formatMeta(c),
        onOpen: () => void openReport(c.id),
      })),
    [checkins]
  );

  const reviewButtons = (id: string) => (
    <span className="flex flex-wrap gap-1 justify-center">
      <button
        type="button"
        disabled={busyId === id}
        onClick={() => void review(id, "approve")}
        className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={busyId === id}
        onClick={() => void review(id, "reject")}
        className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Reject
      </button>
    </span>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Review round check-ins"
        subtitle="Approve laborer and junior vet submissions. Click a row to view photos and full details."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/farm/reports?type=field_submissions&tab=checkins"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            >
              View all in Reports
            </Link>
            <Link
              to="/farm/payroll"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            >
              Payroll
            </Link>
          </div>
        }
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && checkins.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => downloadCsv(checkins, `checkins-pending-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
          >
            Export pending CSV
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <SubmissionListTable
          rows={rows}
          loading={false}
          emptyLabel="No check-ins pending review."
          renderRowActions={(row) => reviewButtons(row.id)}
        />
      ) : null}

      <SubmissionReportModal open={reportOpen} onClose={closeReport}>
        {reportLoading ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)] animate-pulse">Loading report…</p>
        ) : reportCheckin ? (
          <CheckinPhotoReport
            checkin={reportCheckin}
            onClose={closeReport}
            footer={
              selectedId ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeReport}
                    className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={busyId === selectedId}
                    onClick={() => void review(selectedId, "reject")}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === selectedId}
                    onClick={() => void review(selectedId, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              ) : null
            }
          />
        ) : null}
      </SubmissionReportModal>
    </div>
  );
}
