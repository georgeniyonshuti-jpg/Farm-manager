import { EmptyState } from "../EmptyState";
import { SkeletonList } from "../LoadingSkeleton";
import { OdooSyncBadge } from "../accounting/OdooSyncBadge";

type LedgerRow = {
  id: string;
  type: "procurement_receipt" | "feed_consumption" | "adjustment";
  at: string;
  flockId: string | null;
  flockLabel: string | null;
  feedType: string | null;
  feedEntryId: string | null;
  quantityKg: number;
  deltaKg: number;
  reason: string;
  reference: string;
  supplierName?: string | null;
  accountingStatus: string | null;
};

type FeedTypeOption = {
  value: string;
  label: string;
};

type TxTypeFilter = "all" | "procurement_receipt" | "feed_consumption" | "adjustment";

type Props = {
  rows: LedgerRow[];
  loading: boolean;
  totalRows: number;
  page: number;
  totalPages: number;
  feedTypeFilter: string;
  txTypeFilter: TxTypeFilter;
  feedTypeOptions: FeedTypeOption[];
  exportHref: string;
  onFeedTypeFilterChange: (value: string) => void;
  onTxTypeFilterChange: (value: TxTypeFilter) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

function txLabel(type: LedgerRow["type"]): string {
  if (type === "procurement_receipt") return "Received";
  if (type === "feed_consumption") return "Used";
  return "Adjustment";
}

function txBadgeClass(type: LedgerRow["type"]): string {
  if (type === "procurement_receipt") return "bg-[var(--surface-subtle)] text-[var(--text-primary)]";
  if (type === "feed_consumption") return "bg-[var(--surface-subtle)] text-[var(--text-secondary)]";
  return "bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]";
}

function feedTypeLabel(value: string | null, feedTypeOptions: FeedTypeOption[]): string {
  return feedTypeOptions.find((option) => option.value === value)?.label ?? value ?? "—";
}

export function FeedInventoryLedger({
  rows,
  loading,
  totalRows,
  page,
  totalPages,
  feedTypeFilter,
  txTypeFilter,
  feedTypeOptions,
  exportHref,
  onFeedTypeFilterChange,
  onTxTypeFilterChange,
  onPrevPage,
  onNextPage,
}: Props) {
  const visibleRows = txTypeFilter === "all" ? rows : rows.filter((row) => row.type === txTypeFilter);

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)]">
      <div className="table-block border-0 bg-transparent">
        <div className="table-toolbar">
          <select
            className="rounded border border-[var(--border-input)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            value={feedTypeFilter}
            onChange={(e) => onFeedTypeFilterChange(e.target.value)}
          >
            <option value="">All feed types</option>
            {feedTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-[var(--border-input)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            value={txTypeFilter}
            onChange={(e) => onTxTypeFilterChange(e.target.value as TxTypeFilter)}
          >
            <option value="all">All transaction types</option>
            <option value="procurement_receipt">Received</option>
            <option value="feed_consumption">Used</option>
            <option value="adjustment">Adjustment</option>
          </select>
          <a
            href={exportHref}
            className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            download
          >
            Export CSV
          </a>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{totalRows} rows</span>
        </div>

        {loading ? (
          <div className="p-4">
            <SkeletonList rows={3} />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No transactions found." description="Try changing feed type or transaction filters." />
          </div>
        ) : (
          <div className="institutional-table-wrapper">
            <table className="institutional-table">
              <thead>
                <tr>
                  <th>Date / time</th>
                  <th>Status</th>
                  <th>Feed type</th>
                  <th className="tbl-num">Qty (kg)</th>
                  <th className="tbl-num">Delta (kg)</th>
                  <th>Reason</th>
                  <th>Flock / reference</th>
                  <th>Accounting</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className="tbl-mono whitespace-nowrap">
                      {new Date(row.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                    </td>
                    <td>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${txBadgeClass(row.type)}`}>
                        {txLabel(row.type)}
                      </span>
                    </td>
                    <td>{feedTypeLabel(row.feedType, feedTypeOptions)}</td>
                    <td className="tbl-num">{row.quantityKg.toFixed(1)}</td>
                    <td className={`tbl-num font-semibold ${row.deltaKg >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
                      {row.deltaKg >= 0 ? "+" : ""}
                      {row.deltaKg.toFixed(1)}
                    </td>
                    <td className="text-[var(--text-secondary)]">{row.reason || "—"}</td>
                    <td className="tbl-mono text-[var(--text-muted)]">{row.flockLabel ?? row.reference ?? "—"}</td>
                    <td>
                      {row.type === "procurement_receipt" ? (
                        <OdooSyncBadge status={row.accountingStatus} compact approvalsHref="/farm/accounting-approvals" />
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3">
          <span className="text-xs text-[var(--text-muted)]">
            Page {page} of {totalPages} ({totalRows} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={onPrevPage}
              className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={onNextPage}
              className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
