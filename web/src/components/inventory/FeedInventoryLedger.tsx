import { EmptyState } from "../EmptyState";
import { SkeletonList } from "../LoadingSkeleton";
import { OdooSyncBadge } from "../accounting/OdooSyncBadge";
import { DataTable, type DataColumn } from "../ui/DataTable";
import { SegmentedControl } from "../ui";

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

  const columns: DataColumn<LedgerRow>[] = [
    {
      key: "at",
      header: "Date / time",
      className: "tbl-mono whitespace-nowrap",
      render: (row) => new Date(row.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" }),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${txBadgeClass(row.type)}`}>
          {txLabel(row.type)}
        </span>
      ),
    },
    {
      key: "feedType",
      header: "Feed type",
      render: (row) => feedTypeLabel(row.feedType, feedTypeOptions),
    },
    {
      key: "qty",
      header: "Qty (kg)",
      numeric: true,
      render: (row) => row.quantityKg.toFixed(1),
    },
    {
      key: "delta",
      header: "Delta (kg)",
      numeric: true,
      render: (row) => (
        <span className={`font-semibold ${row.deltaKg >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
          {row.deltaKg >= 0 ? "+" : ""}
          {row.deltaKg.toFixed(1)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => <span className="text-[var(--text-secondary)]">{row.reason || "—"}</span>,
    },
    {
      key: "ref",
      header: "Flock / reference",
      className: "tbl-mono",
      render: (row) => <span className="text-[var(--text-muted)]">{row.flockLabel ?? row.reference ?? "—"}</span>,
    },
    {
      key: "accounting",
      header: "Accounting",
      render: (row) =>
        row.type === "procurement_receipt" ? (
          <OdooSyncBadge status={row.accountingStatus} compact approvalsHref="/farm/accounting-approvals" />
        ) : (
          <span className="text-xs text-[var(--text-muted)]">N/A</span>
        ),
    },
  ];

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)]">
      <div className="table-block border-0 bg-transparent">
        <div className="table-toolbar">
          <SegmentedControl
            size="sm"
            value={feedTypeFilter || "__all__"}
            onChange={(v) => onFeedTypeFilterChange(v === "__all__" ? "" : v)}
            options={[
              { value: "__all__", label: "All feeds" },
              ...feedTypeOptions.map((option) => ({ value: option.value, label: option.label })),
            ]}
          />
          <SegmentedControl
            size="sm"
            value={txTypeFilter}
            onChange={(v) => onTxTypeFilterChange(v as TxTypeFilter)}
            options={[
              { value: "all", label: "All types" },
              { value: "procurement_receipt", label: "Received" },
              { value: "feed_consumption", label: "Used" },
              { value: "adjustment", label: "Adjustment" },
            ]}
          />
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
          <DataTable<LedgerRow>
            columns={columns}
            rows={visibleRows}
            rowKey={(row) => row.id}
            renderMobileCard={(row) => (
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${txBadgeClass(row.type)}`}>
                    {txLabel(row.type)}
                  </span>
                  <span className={`text-sm font-semibold ${row.deltaKg >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
                    {row.deltaKg >= 0 ? "+" : ""}
                    {row.deltaKg.toFixed(1)} kg
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {feedTypeLabel(row.feedType, feedTypeOptions)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {new Date(row.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  {row.flockLabel ? ` · ${row.flockLabel}` : ""}
                </p>
              </div>
            )}
          />
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
