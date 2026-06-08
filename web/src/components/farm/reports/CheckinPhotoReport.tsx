import { PHOTO_SECTION_LABELS, toPhotoSlots, type CheckinPhotoSource } from "../../../farm/checkinPhotoUtils";
import { SubmissionStatusBadge } from "./SubmissionStatusBadge";

export type CheckinReportData = CheckinPhotoSource & {
  id: string;
  flockId: string;
  flockCode?: string | null;
  laborerId: string;
  laborerName?: string | null;
  at: string;
  submissionStatus?: string;
  coopTemperatureC?: number | null;
  feedKg?: number;
  waterL?: number;
  mortalityAtCheckin?: number;
  mortalityReportedInMortalityLog?: boolean;
  feedAvailable?: boolean;
  waterAvailable?: boolean;
  notes?: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
};

type Props = {
  checkin: CheckinReportData;
  onClose?: () => void;
};

export function CheckinPhotoReport({ checkin, onClose }: Props) {
  const slots = toPhotoSlots(checkin);
  const submitted = new Date(checkin.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" });

  return (
    <article className="mx-auto max-w-3xl">
      <header className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--surface-card)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-[var(--text-primary)]">Round check-in report</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {checkin.flockCode ?? checkin.flockId.slice(0, 8)} · {checkin.laborerName ?? checkin.laborerId.slice(0, 8)}
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">{submitted}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SubmissionStatusBadge status={checkin.submissionStatus ?? "approved"} />
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

      <div className="space-y-6 px-4 py-5 sm:px-6">
        <section className="grid gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4 text-sm sm:grid-cols-2">
          <p>
            <span className="text-[var(--text-muted)]">Feed available:</span>{" "}
            <strong>{checkin.feedAvailable ? "Yes" : "No"}</strong>
          </p>
          <p>
            <span className="text-[var(--text-muted)]">Water available:</span>{" "}
            <strong>{checkin.waterAvailable ? "Yes" : "No"}</strong>
          </p>
          <p>
            <span className="text-[var(--text-muted)]">Temperature:</span>{" "}
            <strong>{checkin.coopTemperatureC == null ? "—" : `${checkin.coopTemperatureC} °C`}</strong>
          </p>
          <p>
            <span className="text-[var(--text-muted)]">Feed / water logged:</span>{" "}
            <strong>
              {Number(checkin.feedKg ?? 0)} kg / {Number(checkin.waterL ?? 0)} L
            </strong>
          </p>
          <p>
            <span className="text-[var(--text-muted)]">Mortality at check-in:</span>{" "}
            <strong>{Number(checkin.mortalityAtCheckin ?? 0)}</strong>
          </p>
          <p>
            <span className="text-[var(--text-muted)]">In mortality log:</span>{" "}
            <strong>{checkin.mortalityReportedInMortalityLog ? "Yes" : "No"}</strong>
          </p>
        </section>

        {checkin.notes ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Notes</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{checkin.notes}</p>
          </section>
        ) : null}

        {checkin.reviewNotes ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Review notes</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{checkin.reviewNotes}</p>
          </section>
        ) : null}

        {PHOTO_SECTION_LABELS.map(({ key, label }) => {
          const images = slots[key];
          return (
            <section key={key} className="space-y-3">
              <h3 className="border-b border-[var(--border-color)] pb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {label}
              </h3>
              {images.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No photos in this section.</p>
              ) : (
                <div className="space-y-4">
                  {images.map((src, idx) => (
                    <figure key={`${key}-${idx}`} className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)]">
                      <img
                        src={src}
                        alt={`${label} ${idx + 1}`}
                        className="block w-full h-auto max-h-[min(85vh,720px)] object-contain bg-black/5"
                        loading="lazy"
                      />
                      <figcaption className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
                        {label} · photo {idx + 1}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}
