import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
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
  subtitle,
  loading = false,
  error = null,
  empty = false,
  emptyLabel = "No data available",
  children,
  className = "",
  action,
}: Props) {
  return (
    <section
      className={[
        "rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] overflow-hidden",
        className,
      ].join(" ").trim()}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="px-1 pb-3 pt-1">
        {loading ? (
          <div className="space-y-2 px-3 pt-2" aria-busy="true">
            <div className="skeleton-shimmer h-4 w-2/3 rounded" />
            <div className="skeleton-shimmer h-36 w-full rounded-lg" />
          </div>
        ) : null}
        {!loading && error ? (
          <p className="mx-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500 border border-red-500/20">
            {error}
          </p>
        ) : null}
        {!loading && !error && empty ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>
          </div>
        ) : null}
        {!loading && !error && !empty ? children : null}
      </div>
    </section>
  );
}
