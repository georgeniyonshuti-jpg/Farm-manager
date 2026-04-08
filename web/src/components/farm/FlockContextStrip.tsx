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
  /** Extra line for mobile (e.g. link to feed page) */
  footer?: ReactNode;
  className?: string;
};

export function FlockContextStrip({
  label,
  code,
  placementDate,
  ageDays,
  feedToDateKg,
  footer,
  className = "",
}: FlockContextStripProps) {
  const feed =
    feedToDateKg != null && Number.isFinite(Number(feedToDateKg))
      ? `${Number(feedToDateKg).toFixed(2)} kg`
      : "—";
  const titled = code && code !== label ? `${label} (${code})` : label;

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
      <p className="mt-1 text-xs text-neutral-500">
        Feed total includes round check-ins and entries from the feed log (used for cycle FCR).
      </p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  );
}
