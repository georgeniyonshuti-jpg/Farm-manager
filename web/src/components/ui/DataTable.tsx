import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "../EmptyState";
import { readTableDensity, type TableDensity } from "../../lib/tableDensity";
import { Button } from "./Button";

export type CellTone = "success" | "warning" | "critical" | "default";

export type ColorScaleThreshold = {
  min?: number;
  max?: number;
  tone: CellTone;
};

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  numeric?: boolean;
  badge?: boolean;
  colorScale?: ColorScaleThreshold[];
  render: (row: T) => ReactNode;
  value?: (row: T) => number | null | undefined;
  defaultHidden?: boolean;
  /** When set with DataTable `sortKey` / `onSort`, header becomes a sort control. */
  sortable?: boolean;
};

type Props<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** When filters are active but rows is empty — preferred over emptyTitle. */
  filteredEmptyTitle?: string;
  filteredEmptyDescription?: string;
  /** True when a filter/search is narrowing the dataset. */
  isFiltered?: boolean;
  renderMobileCard?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  /** When true, skip outer card frame (use inside `.table-block`). */
  flush?: boolean;
  toolbar?: ReactNode;
  density?: TableDensity;
  columnPicker?: boolean;
  sortKey?: string | null;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
};

const toneClass: Record<CellTone, string> = {
  default: "",
  success: "text-[var(--status-success)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-danger)]",
};

export function resolveColorScale(
  value: number | null | undefined,
  scale?: ColorScaleThreshold[]
): CellTone {
  if (value == null || !scale?.length) return "default";
  for (const band of scale) {
    const aboveMin = band.min == null || value >= band.min;
    const belowMax = band.max == null || value < band.max;
    if (aboveMin && belowMax) return band.tone;
  }
  return "default";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  emptyTitle = "No records yet",
  emptyDescription = "Records will appear here once added.",
  emptyAction,
  filteredEmptyTitle = "No matching records",
  filteredEmptyDescription = "Try changing filters or clearing search.",
  isFiltered = false,
  renderMobileCard,
  onRowClick,
  className = "",
  flush = false,
  toolbar,
  density: densityProp,
  columnPicker = false,
  sortKey = null,
  sortDir = "asc",
  onSort,
}: Props<T>) {
  const [storedDensity, setStoredDensity] = useState<TableDensity>(readTableDensity);
  useEffect(() => {
    const onChange = () => setStoredDensity(readTableDensity());
    window.addEventListener("cleva-table-density", onChange);
    return () => window.removeEventListener("cleva-table-density", onChange);
  }, []);
  const density = densityProp ?? storedDensity;
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );

  const visibleCols = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden]
  );

  const picker = columnPicker ? (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-[var(--border-color)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
        Columns
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[var(--border-color)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-md)]">
        {columns.map((c) => (
          <label key={c.key} className="flex items-center gap-2 py-1 text-xs text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={!hidden.has(c.key)}
              onChange={() => {
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.key)) next.delete(c.key);
                  else next.add(c.key);
                  return next;
                });
              }}
            />
            {typeof c.header === "string" ? c.header : c.key}
          </label>
        ))}
      </div>
    </details>
  ) : null;

  const showEmpty = rows.length === 0;
  const resolvedEmpty =
    empty ??
    (showEmpty ? (
      <div className="px-4 py-10">
        <EmptyState
          title={isFiltered ? filteredEmptyTitle : emptyTitle}
          description={isFiltered ? filteredEmptyDescription : emptyDescription}
          action={isFiltered ? undefined : emptyAction}
        />
      </div>
    ) : null);

  const headerCell = (col: DataColumn<T>) => {
    const canSort = Boolean(col.sortable && onSort);
    const active = sortKey === col.key;
    const label = col.header;
    if (!canSort) return label;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)] hover:text-[var(--primary-color-dark)]"
        onClick={() => onSort?.(col.key)}
      >
        {label}
        {active ? (
          <span className="text-[10px] opacity-80" aria-hidden>
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        ) : null}
      </button>
    );
  };

  const frameClass = flush
    ? className
    : `overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] ${className}`;

  const frame = (
    <div className={frameClass}>
      {toolbar || picker ? (
        <div className="table-toolbar items-center">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {picker}
        </div>
      ) : null}
      {showEmpty ? (
        resolvedEmpty
      ) : (
        <>
          {renderMobileCard ? (
            <div className="space-y-3 p-3 md:hidden">
              {rows.map((row) => (
                <div key={rowKey(row)}>{renderMobileCard(row)}</div>
              ))}
            </div>
          ) : null}
          <div
            className={`institutional-table-wrapper max-h-[min(70vh,40rem)] overflow-auto ${
              renderMobileCard ? "hidden md:block" : ""
            }`}
          >
            <table
              className={`institutional-table ${density === "compact" ? "institutional-table--compact" : ""}`}
            >
              <thead>
                <tr>
                  {visibleCols.map((col) => (
                    <th
                      key={col.key}
                      className={[
                        col.numeric ? "tbl-num" : "",
                        col.badge ? "tbl-badge" : "",
                        col.className ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {headerCell(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {visibleCols.map((col) => {
                      const tone = col.colorScale
                        ? resolveColorScale(col.value?.(row), col.colorScale)
                        : "default";
                      return (
                        <td
                          key={col.key}
                          className={[
                            col.numeric ? "tbl-num" : "",
                            col.badge ? "tbl-badge" : "",
                            col.className ?? "",
                            toneClass[tone],
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {col.render(row)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  return frame;
}

export function TableDensityToggle({
  density,
  onChange,
}: {
  density: TableDensity;
  onChange: (d: TableDensity) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onChange(density === "compact" ? "comfortable" : "compact")}
    >
      {density === "compact" ? "Comfortable" : "Compact"}
    </Button>
  );
}
