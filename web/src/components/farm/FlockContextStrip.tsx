import type { ReactNode } from "react";

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
  /** Extra line for mobile (e.g. link to feed page) */
  footer?: ReactNode;
  className?: string;
};

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
  footer,
  className = "",
}: FlockContextStripProps) {
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

  return (
    <section
      className={`rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)]/90 px-4 py-3 text-sm text-[var(--text-secondary)] ${className}`}
      aria-label="Flock context"
    >
      <p className="font-semibold text-[var(--text-primary)]">{titled}</p>
      <p className="mt-1 text-[var(--text-secondary)]">
        Placement <span className="font-mono text-[var(--text-primary)]">{placementDate}</span>
        {" · "}
        Day <span className="tabular-nums font-semibold text-[var(--text-primary)]">{ageDays}</span>
        {" · "}
        Feed to date <span className="tabular-nums font-semibold text-emerald-400">{feed}</span>
      </p>
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
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
