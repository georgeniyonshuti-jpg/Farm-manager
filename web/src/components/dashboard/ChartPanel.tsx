import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Inline note on the title row (metric definition) — not a stacked subtitle. */
  metricNote?: ReactNode;
  /** @deprecated Prefer metricNote — rendered inline when provided without metricNote. */
  subtitle?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

export function ChartPanel({
  title,
  metricNote,
  subtitle,
  loading = false,
  error = null,
  empty = false,
  emptyLabel = "No data available",
  children,
  className = "",
  action,
}: Props) {
  const note = metricNote ?? subtitle;
  return (
    <section
      className={[
        "rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] overflow-hidden",
        className,
      ]
        .join(" ")
        .trim()}
    >
      <div className="flex items-center justify-between gap-2 px-card pt-stack pb-1">
        <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          {note ? <span className="truncate text-xs text-[var(--text-muted)]">{note}</span> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="px-1 pb-stack pt-1">
        {loading ? (
          <div className="space-y-2 px-3 pt-2" aria-busy="true">
            <div className="skeleton-shimmer h-4 w-2/3 rounded" />
            <div className="skeleton-shimmer h-36 w-full rounded-lg" />
          </div>
        ) : null}
        {!loading && error ? (
          <p className="mx-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">
            {error}
          </p>
        ) : null}
        {!loading && !error && empty ? (
          <div className="flex items-center justify-center py-section">
            <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>
          </div>
        ) : null}
        {!loading && !error && !empty ? children : null}
      </div>
    </section>
  );
}
