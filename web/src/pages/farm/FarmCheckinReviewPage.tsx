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
import { Button } from "../../components/ui/Button";
import { TableToolbar } from "../../components/ui";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";

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
        dateLabel: formatManagerDateTime(c.at),
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
      <Button variant="success" size="xs" disabled={busyId === id} onClick={() => void review(id, "approve")}>
        Approve
      </Button>
      <Button variant="danger" size="xs" disabled={busyId === id} onClick={() => void review(id, "reject")}>
        Reject
      </Button>
    </span>
  );

  return (
    <ManagerPage>
      <PageHeader
        title="Review check-ins"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/farm/reports?type=field_submissions&tab=checkins"
              className="text-sm font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline"
            >
              View all in Reports
            </Link>
            <Link
              to="/farm/payroll"
              className="text-sm font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline"
            >
              Payroll
            </Link>
          </div>
        }
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error ? (
        <SubmissionListTable
          rows={rows}
          loading={false}
          emptyLabel="No check-ins pending review."
          toolbar={
            checkins.length > 0 ? (
              <TableToolbar
                meta={`${checkins.length} pending`}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      downloadCsv(checkins, `checkins-pending-${new Date().toISOString().slice(0, 10)}.csv`)
                    }
                  >
                    Export CSV
                  </Button>
                }
              />
            ) : undefined
          }
          renderRowActions={(row) => reviewButtons(row.id)}
        />
      ) : null}

      <SubmissionReportModal open={reportOpen} onClose={closeReport}>
        {reportLoading ? (
          <div className="p-card"><SkeletonList rows={4} /></div>
        ) : reportCheckin ? (
          <CheckinPhotoReport
            checkin={reportCheckin}
            onClose={closeReport}
            footer={
              selectedId ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={closeReport}>
                    Close
                  </Button>
                  <Button variant="danger" size="xs" disabled={busyId === selectedId} onClick={() => void review(selectedId, "reject")}>
                    Reject
                  </Button>
                  <Button variant="success" size="xs" disabled={busyId === selectedId} onClick={() => void review(selectedId, "approve")}>
                    Approve
                  </Button>
                </div>
              ) : null
            }
          />
        ) : null}
      </SubmissionReportModal>
    </ManagerPage>
  );
}
