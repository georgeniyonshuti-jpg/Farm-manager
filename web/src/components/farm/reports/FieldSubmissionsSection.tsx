import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../Toast";
import {
  fetchCheckinDetail,
  fetchCheckinsList,
  fetchVetLogDetail,
  fetchVetLogsList,
  type CheckinDetailRow,
  type CheckinListRow,
  type VetLogListRow,
} from "../../../api/farm.api";
import { SubmissionListTable } from "./SubmissionListTable";
import { CheckinPhotoReport } from "./CheckinPhotoReport";
import { VetLogReport } from "./VetLogReport";
import { SubmissionReportModal } from "./SubmissionReportModal";

type FlockOption = { id: string; label: string };
type SubmissionTab = "checkins" | "vet_logs";

type Props = {
  flocks: FlockOption[];
  initialTab?: SubmissionTab;
  initialFlockId?: string;
  initialStatus?: string;
  initialFrom?: string;
  initialTo?: string;
};

export function FieldSubmissionsSection({
  flocks,
  initialTab = "checkins",
  initialFlockId = "",
  initialStatus = "all",
  initialFrom = "",
  initialTo = "",
}: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<SubmissionTab>(initialTab);
  const [flockId, setFlockId] = useState(initialFlockId);
  const [status, setStatus] = useState(initialStatus);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkins, setCheckins] = useState<CheckinListRow[]>([]);
  const [vetLogs, setVetLogs] = useState<VetLogListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [checkinDetail, setCheckinDetail] = useState<CheckinDetailRow | null>(null);
  const [vetLogDetail, setVetLogDetail] = useState<VetLogListRow | null>(null);

  useEffect(() => {
    setTab(initialTab);
    setFlockId(initialFlockId);
    setStatus(initialStatus);
    setFrom(initialFrom);
    setTo(initialTo);
  }, [initialTab, initialFlockId, initialStatus, initialFrom, initialTo]);

  const loadList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (tab === "checkins") {
        const d = await fetchCheckinsList(token, {
          flockId: flockId || undefined,
          status: status === "all" ? "all" : status,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 30,
        });
        setCheckins(d.checkins ?? []);
        setTotal(d.total ?? 0);
      } else {
        const d = await fetchVetLogsList(token, {
          flockId: flockId || undefined,
          status: status === "all" ? "all" : status,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize: 30,
        });
        setVetLogs(d.logs ?? []);
        setTotal(d.total ?? 0);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, tab, flockId, status, from, to, page, showToast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openCheckin(id: string) {
    if (!token) return;
    setReportOpen(true);
    setReportLoading(true);
    setCheckinDetail(null);
    setVetLogDetail(null);
    try {
      const d = await fetchCheckinDetail(token, id);
      setCheckinDetail(d.checkin);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load report");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  async function openVetLog(id: string) {
    if (!token) return;
    setReportOpen(true);
    setReportLoading(true);
    setCheckinDetail(null);
    setVetLogDetail(null);
    try {
      const d = await fetchVetLogDetail(token, id);
      setVetLogDetail(d.log);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load report");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  const rows = useMemo(() => {
    if (tab === "checkins") {
      return checkins.map((c) => ({
        id: c.id,
        dateLabel: new Date(c.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" }),
        flockLabel: c.flockCode ?? c.flockId.slice(0, 8),
        authorLabel: c.laborerName ?? c.laborerId.slice(0, 8),
        status: c.submissionStatus,
        meta: c.hasPhotos ? "Has photos" : c.notesExcerpt || "—",
        onOpen: () => void openCheckin(c.id),
      }));
    }
    return vetLogs.map((l) => ({
      id: l.id,
      dateLabel: l.logDate,
      flockLabel: l.flockCode ?? l.flockId.slice(0, 8),
      authorLabel: l.authorName ?? l.authorUserId.slice(0, 8),
      status: l.submissionStatus,
      meta: l.observations?.slice(0, 80) || "—",
      onOpen: () => void openVetLog(l.id),
    }));
  }, [tab, checkins, vetLogs]);

  const pageCount = Math.max(1, Math.ceil(total / 30));

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Field submissions</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Archive of round check-ins and vet logs (all statuses). Open a row for the full scrollable report.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-3">
        <button
          type="button"
          onClick={() => { setTab("checkins"); setPage(1); }}
          className={[
            "rounded-lg px-3 py-1.5 text-sm font-semibold",
            tab === "checkins"
              ? "bg-[var(--primary-color)] text-white"
              : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
          ].join(" ")}
        >
          Round check-ins
        </button>
        <button
          type="button"
          onClick={() => { setTab("vet_logs"); setPage(1); }}
          className={[
            "rounded-lg px-3 py-1.5 text-sm font-semibold",
            tab === "vet_logs"
              ? "bg-[var(--primary-color)] text-white"
              : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
          ].join(" ")}
        >
          Vet logs
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Flock</label>
          <select
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
            value={flockId}
            onChange={(e) => { setFlockId(e.target.value); setPage(1); }}
          >
            <option value="">All flocks</option>
            {flocks.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Status</label>
          <select
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="all">All</option>
            <option value="pending_review">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
          />
        </div>
      </div>

      <SubmissionListTable
        rows={rows}
        loading={loading}
        emptyLabel={tab === "checkins" ? "No check-ins match these filters." : "No vet logs match these filters."}
      />

      {!loading && total > 0 ? (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{total} total</span>
          <span className="flex gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              className="rounded border border-[var(--border-color)] px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span className="px-1 py-1">Page {page} of {pageCount}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              className="rounded border border-[var(--border-color)] px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </span>
        </div>
      ) : null}

      <SubmissionReportModal open={reportOpen} onClose={() => setReportOpen(false)}>
        {reportLoading ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)] animate-pulse">Loading report…</p>
        ) : checkinDetail ? (
          <CheckinPhotoReport checkin={checkinDetail} onClose={() => setReportOpen(false)} />
        ) : vetLogDetail ? (
          <VetLogReport log={vetLogDetail} onClose={() => setReportOpen(false)} />
        ) : null}
      </SubmissionReportModal>
    </section>
  );
}
