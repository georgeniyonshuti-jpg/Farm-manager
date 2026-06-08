import { SubmissionStatusBadge } from "./SubmissionStatusBadge";

export type VetLogReportData = {
  id: string;
  flockId: string;
  flockCode?: string | null;
  authorUserId: string;
  authorName?: string | null;
  logDate: string;
  observations?: string | null;
  actionsTaken?: string | null;
  recommendations?: string | null;
  submissionStatus: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  fcrAtLogTime?: number | null;
  fcrStatus?: string | null;
  fcrTargetMin?: number | null;
  fcrTargetMax?: number | null;
};

type Props = {
  log: VetLogReportData;
  onClose?: () => void;
};

function ReportBlock({ title, body }: { title: string; body?: string | null }) {
  if (!body?.trim()) return null;
  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{body}</p>
    </section>
  );
}

export function VetLogReport({ log, onClose }: Props) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--surface-card)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-[var(--text-primary)]">Vet log report</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {log.flockCode ?? log.flockId.slice(0, 8)} · {log.authorName ?? log.authorUserId.slice(0, 8)}
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">Log date {log.logDate}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SubmissionStatusBadge status={log.submissionStatus} />
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-6">
        {log.fcrAtLogTime != null ? (
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">FCR at log time</h3>
            <p className="mt-2 font-mono-data text-3xl font-bold text-[var(--text-primary)]">
              {Number(log.fcrAtLogTime).toFixed(2)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Status: <strong className="capitalize">{(log.fcrStatus ?? "unknown").replace(/_/g, " ")}</strong>
              {log.fcrTargetMin != null && log.fcrTargetMax != null ? (
                <span>
                  {" "}
                  · Target {Number(log.fcrTargetMin).toFixed(2)}–{Number(log.fcrTargetMax).toFixed(2)}
                </span>
              ) : null}
            </p>
          </section>
        ) : null}

        <ReportBlock title="Observations" body={log.observations} />
        <ReportBlock title="Actions taken" body={log.actionsTaken} />
        <ReportBlock title="Recommendations" body={log.recommendations} />
        <ReportBlock title="Review notes" body={log.reviewNotes} />
      </div>
    </article>
  );
}
