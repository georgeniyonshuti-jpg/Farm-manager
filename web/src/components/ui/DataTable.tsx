import type { ReactNode } from "react";
import { EmptyState } from "../EmptyState";

export type CellTone = "success" | "warning" | "critical" | "default";

export type ColorScaleThreshold = {
  /** Inclusive lower bound. */
  min?: number;
  /** Exclusive upper bound. */
  max?: number;
  tone: CellTone;
};

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  numeric?: boolean;
  badge?: boolean;
  /** Threshold coloring for performance metrics (v2 spec §2.4). */
  colorScale?: ColorScaleThreshold[];
  render: (row: T) => ReactNode;
  /** Numeric value extractor used with `colorScale`. */
  value?: (row: T) => number | null | undefined;
};

type Props<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  renderMobileCard?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
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

function DefaultTableEmpty({ title, description }: { title: string; description?: string }) {
  return <EmptyState title={title} description={description} />;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  emptyTitle = "No records yet",
  emptyDescription = "Records will appear here once added.",
  renderMobileCard,
  onRowClick,
  className = "",
}: Props<T>) {
  if (!rows.length) {
    return <>{empty ?? <DefaultTableEmpty title={emptyTitle} description={emptyDescription} />}</>;
  }

  return (
    <div className={className}>
      {renderMobileCard ? (
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <div key={rowKey(row)}>{renderMobileCard(row)}</div>
          ))}
        </div>
      ) : null}

      <div className={`institutional-table-wrapper ${renderMobileCard ? "hidden md:block" : ""}`}>
        <table className="institutional-table">
          <thead>
            <tr>
              {columns.map((col) => (
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
                  {col.header}
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
                {columns.map((col) => {
                  const tone = col.colorScale
                    ? resolveColorScale(col.value?.(row), col.colorScale)
                    : "default";
                  return (
                    <td
                      key={col.key}
                      className={[
                        col.numeric ? "tbl-num" : "",
                        col.badge ? "tbl-badge" : "",
                        toneClass[tone],
                        col.className ?? "",
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
    </div>
  );
}
