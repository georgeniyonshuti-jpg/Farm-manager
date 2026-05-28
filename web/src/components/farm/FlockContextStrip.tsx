import type { ReactNode } from "react";
import { CheckinUrgencyBadge } from "./CheckinUrgencyBadge";
import { useLaborerT } from "../../i18n/laborerI18n";
import type { CheckinStatus } from "../../pages/farm/checkinStatusTypes";

/**
 * Read-only batch context: placement, day count, cumulative feed (cycle FCR source).
 */
export type FlockContextStripProps = {
  label: string;
  code?: string | null;
  placementDate: string;
  ageDays: number;
  feedToDateKg?: number | null;
  /** Placed at start (hatch / introduction) */
  initialCount?: number | null;
  /** Current live estimate used for FCR / ops */
  birdsLiveEstimate?: number | null;
  /** Manager-verified headcount when set */
  verifiedLiveCount?: number | null;
  /** Cumulative mortality in memory for this flock */
  mortalityToDate?: number | null;
  /** When set, merges check-in schedule / overdue into this card (check-in page). */
  status?: CheckinStatus;
  /** Extra line for mobile (e.g. link to feed page) */
  footer?: ReactNode;
  className?: string;
};

function formatDurationMs(ms: number): string {
  const abs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtInt(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return String(Math.floor(Number(n)));
}

export function FlockContextStrip({
  label,
  code,
  placementDate,
  ageDays,
  feedToDateKg,
  initialCount,
  birdsLiveEstimate,
  verifiedLiveCount,
  mortalityToDate,
  status,
  footer,
  className = "",
}: FlockContextStripProps) {
  const onSiteLine = useLaborerT(
    status
      ? `Day ${status.ageDays} on-site • target harvest ~days ${status.targetSlaughterDays.min}–${status.targetSlaughterDays.max}`
      : ""
  );
  const sourceWord =
    status?.intervalSource === "default_age_curve" ? "age-based default" : "custom batch";
  const policyLine = useLaborerT(
    status ? `Current policy: every ${status.intervalHours} h (${sourceWord})` : ""
  );
  const nextDueLbl = useLaborerT("Next due:");
  const overdueMsg = useLaborerT("Overdue — please complete check-in as soon as possible.");
  const onTrackMsg = useLaborerT("You are on track.");
  const feed =
    feedToDateKg != null && Number.isFinite(Number(feedToDateKg))
      ? `${Number(feedToDateKg).toFixed(2)} kg`
      : "—";
  const titled = code && code !== label ? `${label} (${code})` : label;
  const placed = fmtInt(initialCount);
  const live = fmtInt(birdsLiveEstimate);
  const verified = fmtInt(verifiedLiveCount);
  const mort = fmtInt(mortalityToDate);
  const showFlockStats = placed != null || live != null || verified != null || mort != null;

  const nextDueMs = status ? new Date(status.nextDueAt).getTime() : 0;
  const remainingMs = status ? Math.max(0, nextDueMs - Date.now()) : 0;

  return (
    <section
      className={`rounded-xl border border-[var(--border-color)] ${
        status ? "bg-[var(--surface-card)] shadow-[var(--shadow-sm)]" : "bg-[var(--surface-subtle)]/90"
      } px-4 py-3 text-sm text-[var(--text-secondary)] ${className}`}
      aria-label="Flock context"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-[var(--text-primary)]">{titled}</p>
        {status ? <CheckinUrgencyBadge badge={status.checkinBadge} /> : null}
      </div>
      <p className="mt-1 text-[var(--text-secondary)]">
        Placement <span className="font-mono text-[var(--text-primary)]">{placementDate}</span>
        {" · "}
        Day <span className="tabular-nums font-semibold text-[var(--text-primary)]">{ageDays}</span>
        {" · "}
        Feed to date <span className="tabular-nums font-semibold text-emerald-400">{feed}</span>
      </p>
      {status ? (
        <>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{onSiteLine}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{policyLine}</p>
          <p className="mt-1 text-sm">
            {nextDueLbl}{" "}
            <time className="font-mono text-[var(--text-primary)]" dateTime={status.nextDueAt}>
              {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
            </time>
          </p>
        </>
      ) : null}
      {showFlockStats ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-secondary)]">
          {placed != null ? (
            <li>
              Initial placed: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{placed}</span>
            </li>
          ) : null}
          {live != null ? (
            <li>
              Live birds (est.): <span className="font-semibold tabular-nums text-[var(--text-primary)]">{live}</span>
            </li>
          ) : null}
          {verified != null ? (
            <li>
              Verified count: <span className="font-semibold tabular-nums text-emerald-400">{verified}</span>
            </li>
          ) : null}
          {mort != null ? (
            <li>
              Mortality to date: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{mort}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Feed total includes round check-ins and entries from the feed log (used for cycle FCR).
      </p>
      {status ? (
        status.isOverdue ? (
          <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400">
            {overdueMsg} ({formatDurationMs(status.overdueMs)})
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400">
            {onTrackMsg} ({formatDurationMs(remainingMs)} remaining)
          </p>
        )
      ) : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
