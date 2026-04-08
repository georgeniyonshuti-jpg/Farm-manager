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
      className={`rounded-xl border border-neutral-200 bg-neutral-50/90 px-4 py-3 text-sm text-neutral-800 ${className}`}
      aria-label="Flock context"
    >
      <p className="font-semibold text-neutral-900">{titled}</p>
      <p className="mt-1 text-neutral-600">
        Placement <span className="font-mono text-neutral-800">{placementDate}</span>
        {" · "}
        Day <span className="tabular-nums font-semibold text-neutral-900">{ageDays}</span>
        {" · "}
        Feed to date <span className="tabular-nums font-semibold text-emerald-900">{feed}</span>
      </p>
      {showFlockStats ? (
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-700">
          {placed != null ? (
            <li>
              Initial placed: <span className="font-semibold tabular-nums text-neutral-900">{placed}</span>
            </li>
          ) : null}
          {live != null ? (
            <li>
              Live birds (est.): <span className="font-semibold tabular-nums text-neutral-900">{live}</span>
            </li>
          ) : null}
          {verified != null ? (
            <li>
              Verified count: <span className="font-semibold tabular-nums text-emerald-900">{verified}</span>
            </li>
          ) : null}
          {mort != null ? (
            <li>
              Mortality to date: <span className="font-semibold tabular-nums text-neutral-900">{mort}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-neutral-500">
        Feed total includes round check-ins and entries from the feed log (used for cycle FCR).
      </p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
