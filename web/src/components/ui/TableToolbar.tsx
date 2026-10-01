import type { ReactNode } from "react";

type Props = {
  /** Primary filters (SegmentedControl ≤5, FacetFilter when more). */
  filters?: ReactNode;
  /** Search input or similar. */
  search?: ReactNode;
  /** Counts / meta (“12 rows”, “3 pending”). */
  meta?: ReactNode;
  /** Secondary actions (Refresh, Export) — prefer ghost/secondary. Tertiary → ToolbarOverflow. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Standard manager list controls.
 * Layout: filters · search | meta · actions
 *
 * Use only as `DataTable` `toolbar` (or the sole child of `.table-block` above a flush table).
 * Do not float this under AppTopBar as a second chrome band.
 */
export function TableToolbar({ filters, search, meta, actions, className = "" }: Props) {
  const left = filters != null || search != null;
  const right = meta != null || actions != null;
  if (!left && !right) return null;

  return (
    <div
      className={`flex w-full min-w-0 flex-wrap items-center justify-between gap-2 ${className}`.trim()}
      role="toolbar"
      aria-label="Table controls"
    >
      {left ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {filters}
          {search}
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {right ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta != null ? (
            <span className="text-xs text-[var(--text-muted)] tabular-nums">{meta}</span>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
