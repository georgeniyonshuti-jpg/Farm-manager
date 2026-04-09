import type { ReactNode } from "react";
import { DashboardCard } from "./DashboardCard";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
  className?: string;
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
}: Props) {
  return (
    <DashboardCard title={title} subtitle={subtitle} className={className}>
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton-shimmer h-4 w-2/3 rounded" />
          <div className="skeleton-shimmer h-28 w-full rounded-lg" />
        </div>
      ) : null}
      {!loading && error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>
      ) : null}
      {!loading && !error && empty ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-8 text-center text-sm text-neutral-500">{emptyLabel}</p>
      ) : null}
      {!loading && !error && !empty ? children : null}
    </DashboardCard>
  );
}
