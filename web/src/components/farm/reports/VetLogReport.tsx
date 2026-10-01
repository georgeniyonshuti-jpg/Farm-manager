import { formatManagerDate } from "../../../lib/formatManagerDateTime";
import { PHOTO_SECTION_LABELS, toPhotoSlots } from "../../../farm/checkinPhotoUtils";
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
  weighInId?: string | null;
  sampleSize?: number | null;
  avgWeightKg?: number | null;
  cvPct?: number | null;
  underweightPct?: number | null;
  totalFeedUsedKg?: number | null;
  hasWeightSample?: boolean;
  treatmentId?: string | null;
  medicineName?: string | null;
  photoUrls?: unknown;
  visitSlot?: string | null;
  visitedAt?: string | null;
  coopTemperatureC?: number | null;
  feedAvailable?: boolean | null;
  waterAvailable?: boolean | null;
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

function visitSlotLabel(slot: string | null | undefined): string | null {
  if (!slot) return null;
  if (slot === "am") return "AM visit";
  if (slot === "pm") return "PM visit";
  if (slot === "spot") return "Spot visit";
  return slot;
}

export function VetLogReport({ log, onClose }: Props) {
  const hasWeight = log.hasWeightSample || log.avgWeightKg != null;
  const photoSlots = toPhotoSlots({ photoUrls: log.photoUrls });
  const hasAnyPhotos = PHOTO_SECTION_LABELS.some(({ key }) => photoSlots[key].length > 0);
  const slotLabel = visitSlotLabel(log.visitSlot);
  const showVisitContext =
    Boolean(slotLabel) ||
    log.coopTemperatureC != null ||
    log.feedAvailable != null ||
    log.waterAvailable != null;

  return (
    <article className="mx-auto max-w-3xl">
      <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--surface-card)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-[var(--text-primary)]">Vet log report</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {log.flockCode ?? log.flockId.slice(0, 8)} · {log.authorName ?? log.authorUserId.slice(0, 8)}
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">Log date {formatManagerDate(log.logDate)}</p>
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
        {showVisitContext ? (
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">House round</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {slotLabel ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Visit</dt>
                  <dd className="font-semibold text-[var(--text-primary)]">{slotLabel}</dd>
                </div>
              ) : null}
              {log.coopTemperatureC != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Coop temperature</dt>
                  <dd className="font-mono font-semibold">{Number(log.coopTemperatureC).toFixed(1)} °C</dd>
                </div>
              ) : null}
              {log.feedAvailable != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Feed available</dt>
                  <dd className="font-semibold">{log.feedAvailable ? "Yes" : "No"}</dd>
                </div>
              ) : null}
              {log.waterAvailable != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Water available</dt>
                  <dd className="font-semibold">{log.waterAvailable ? "Yes" : "No"}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {hasWeight ? (
          <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">Weight sample</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--text-muted)]">Avg weight</dt>
                <dd className="font-mono font-semibold">{log.avgWeightKg != null ? `${Number(log.avgWeightKg).toFixed(3)} kg` : "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Sample size</dt>
                <dd className="font-mono font-semibold">{log.sampleSize ?? "—"}</dd>
              </div>
              {log.cvPct != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">CV %</dt>
                  <dd className="font-mono font-semibold">{Number(log.cvPct).toFixed(1)}</dd>
                </div>
              ) : null}
              {log.underweightPct != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Underweight %</dt>
                  <dd className="font-mono font-semibold">{Number(log.underweightPct).toFixed(1)}</dd>
                </div>
              ) : null}
              {log.totalFeedUsedKg != null ? (
                <div>
                  <dt className="text-[var(--text-muted)]">Feed to date (kg)</dt>
                  <dd className="font-mono font-semibold">{Number(log.totalFeedUsedKg).toFixed(1)}</dd>
                </div>
              ) : null}
            </dl>
            {log.weighInId ? (
              <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">Weigh-in {log.weighInId.slice(0, 8)}…</p>
            ) : null}
          </section>
        ) : null}

        {log.medicineName ? (
          <section className="rounded-xl border border-violet-200/60 bg-violet-50/40 p-4 dark:border-violet-500/20 dark:bg-violet-500/5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-violet-900 dark:text-violet-300">Medicine</h3>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{log.medicineName}</p>
            {log.treatmentId ? (
              <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">Treatment {log.treatmentId}</p>
            ) : null}
          </section>
        ) : null}

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

        {hasAnyPhotos
          ? PHOTO_SECTION_LABELS.map(({ key, label }) => {
              const images = photoSlots[key];
              if (images.length === 0) return null;
              return (
                <section key={key} className="space-y-3">
                  <h3 className="border-b border-[var(--border-color)] pb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {label}
                  </h3>
                  <div className="space-y-4">
                    {images.map((src, idx) => (
                      <figure
                        key={`${key}-${idx}`}
                        className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)]"
                      >
                        <img
                          src={src}
                          alt={`${label} ${idx + 1}`}
                          className="block h-auto max-h-[min(85vh,720px)] w-full bg-black/5 object-contain"
                          loading="lazy"
                        />
                        <figcaption className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
                          {label} · photo {idx + 1}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              );
            })
          : null}
      </div>
    </article>
  );
}
