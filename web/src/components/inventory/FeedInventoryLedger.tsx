import { DataTable, type DataColumn } from "../ui/DataTable";
import {
  SegmentedControl,
  StatusPill,
  TablePagination,
  TableToolbar,
  FacetFilter,
  ToolbarOverflow,
  type StatusTone,
} from "../ui";
import { Button } from "../ui/Button";
import { useAuth } from "../../auth/AuthContext";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useErpnextSyncBySource } from "../../hooks/useErpnextSyncBySource";
import { ERPNextSyncBadge } from "../accounting/ERPNextSyncBadge";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";
import { SkeletonList } from "../LoadingSkeleton";

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

type StockRow = {
  feedType: string | null;
  purchasedKg: number;
  usedKg: number;
  adjustmentsKg: number;
  balanceKg: number;
};

type FeedTypeOption = {
  value: string;
  label: string;
};

type TxTypeFilter = "all" | "procurement_receipt" | "feed_consumption" | "adjustment";

type Props = {
  rows: LedgerRow[];
  summary: StockRow[];
  loading: boolean;
  totalRows: number;
  page: number;
  feedTypeFilter: string;
  txTypeFilter: TxTypeFilter;
  feedTypeOptions: FeedTypeOption[];
  exportHref: string;
  onFeedTypeFilterChange: (value: string) => void;
  onTxTypeFilterChange: (value: TxTypeFilter) => void;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onRefresh?: () => void;
  onAdjust?: () => void;
  operationsReportHref?: string;
};

function txLabel(type: LedgerRow["type"]): string {
  if (type === "procurement_receipt") return "Received";
  if (type === "feed_consumption") return "Used";
  return "Adjustment";
}

function txTone(type: LedgerRow["type"]): StatusTone {
  if (type === "procurement_receipt") return "success";
  if (type === "feed_consumption") return "neutral";
  return "info";
}

function feedTypeLabel(value: string | null, feedTypeOptions: FeedTypeOption[]): string {
  return feedTypeOptions.find((option) => option.value === value)?.label ?? value ?? "—";
}

function formatKg(n: number): string {
  return `${Number(n).toFixed(1)} kg`;
}

export function FeedInventoryLedger({
  rows,
  summary,
  loading,
  totalRows,
  page,
  feedTypeFilter,
  txTypeFilter,
  feedTypeOptions,
  exportHref,
  onFeedTypeFilterChange,
  onTxTypeFilterChange,
  onPageChange,
  pageSize = 50,
  onRefresh,
  onAdjust,
  operationsReportHref,
}: Props) {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { bySource } = useErpnextSyncBySource(user?.erpnextAccess ? token : null);
  const visibleRows = txTypeFilter === "all" ? rows : rows.filter((row) => row.type === txTypeFilter);
  const isFiltered = Boolean(feedTypeFilter) || txTypeFilter !== "all";

  const summaryByType = new Map(summary.map((row) => [String(row.feedType ?? ""), row]));
  const scoped =
    feedTypeFilter && summaryByType.has(feedTypeFilter)
      ? summaryByType.get(feedTypeFilter)!
      : summary.reduce(
          (acc, row) => {
            acc.balanceKg += Number(row.balanceKg) || 0;
            acc.purchasedKg += Number(row.purchasedKg) || 0;
            acc.usedKg += Number(row.usedKg) || 0;
            return acc;
          },
          { balanceKg: 0, purchasedKg: 0, usedKg: 0 }
        );

  const facetOptions = feedTypeOptions.map((option) => {
    const row = summaryByType.get(option.value);
    const bal = row ? formatKg(row.balanceKg) : "0.0 kg";
    return { value: option.value, label: `${option.label} · ${bal}` };
  });

  const columns: DataColumn<LedgerRow>[] = [
    {
      key: "at",
      header: "Date / time",
      className: "tbl-mono whitespace-nowrap",
      render: (row) => formatManagerDateTime(row.at),
    },
    {
      key: "status",
      header: "Type",
      badge: true,
      render: (row) => <StatusPill tone={txTone(row.type)}>{txLabel(row.type)}</StatusPill>,
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
        <span
          className={`font-semibold ${
            row.deltaKg >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-warning)]"
          }`}
        >
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
      render: (row) => (
        <span className="text-[var(--text-muted)]">{row.flockLabel ?? row.reference ?? "—"}</span>
      ),
    },
    ...(user?.erpnextAccess
      ? ([
          {
            key: "erpnext",
            header: "ERPNext",
            badge: true,
            render: (row: LedgerRow) => {
              const hint = bySource.get(row.id);
              if (!hint) return null;
              return (
                <ERPNextSyncBadge
                  state={hint.state}
                  reference={hint.reference}
                  compact
                  href={companyHref(`farm/erpnext-setup?q=${encodeURIComponent(row.id)}`)}
                />
              );
            },
          },
        ] as DataColumn<LedgerRow>[])
      : []),
  ];

  return (
    <div className="table-block">
      {loading ? (
        <div className="p-card">
          <SkeletonList rows={4} />
        </div>
      ) : (
        <DataTable<LedgerRow>
          flush
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => row.id}
          isFiltered={isFiltered}
          emptyTitle="No transactions yet"
          emptyDescription=""
          filteredEmptyTitle="No matching transactions"
          filteredEmptyDescription=""
          toolbar={
            <TableToolbar
              filters={
                <>
                  <SegmentedControl
                    size="sm"
                    value={txTypeFilter}
                    onChange={(v) => onTxTypeFilterChange(v as TxTypeFilter)}
                    options={[
                      { value: "all", label: "All" },
                      { value: "procurement_receipt", label: "Received" },
                      { value: "feed_consumption", label: "Used" },
                      { value: "adjustment", label: "Adjustment" },
                    ]}
                  />
                  <FacetFilter
                    label="Feed type"
                    value={feedTypeFilter || "all"}
                    allValue="all"
                    allLabel="All types"
                    onChange={(v) => onFeedTypeFilterChange(v === "all" ? "" : v)}
                    options={facetOptions}
                  />
                </>
              }
              meta={`Balance ${formatKg(scoped.balanceKg)} · Received +${formatKg(scoped.purchasedKg)} · Used ${formatKg(scoped.usedKg)} · ${visibleRows.length} rows`}
              actions={
                <>
                  {onRefresh ? (
                    <Button variant="ghost" size="sm" onClick={onRefresh}>
                      Refresh
                    </Button>
                  ) : null}
                  <a
                    href={exportHref}
                    download
                    className="inline-flex h-control-sm items-center rounded-control px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]"
                  >
                    Export CSV
                  </a>
                  {onAdjust || operationsReportHref ? (
                    <ToolbarOverflow
                      items={[
                        ...(onAdjust
                          ? [{ key: "adjust", label: "Adjust stock", onClick: onAdjust }]
                          : []),
                        ...(operationsReportHref
                          ? [{ key: "ops", label: "Operations report", href: operationsReportHref }]
                          : []),
                      ]}
                    />
                  ) : null}
                </>
              }
            />
          }
          renderMobileCard={(row) => (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
              <div className="flex items-center justify-between gap-2">
                <StatusPill tone={txTone(row.type)}>{txLabel(row.type)}</StatusPill>
                <span
                  className={`text-sm font-semibold ${
                    row.deltaKg >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-warning)]"
                  }`}
                >
                  {row.deltaKg >= 0 ? "+" : ""}
                  {row.deltaKg.toFixed(1)} kg
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {feedTypeLabel(row.feedType, feedTypeOptions)}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
              <p className="mt-1 type-caption tabular-nums text-[var(--text-primary)]">
                {formatManagerDateTime(row.at)}
                {row.flockLabel ? ` · ${row.flockLabel}` : ""}
              </p>
            </div>
          )}
        />
      )}

      {!loading && totalRows > 0 ? (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={totalRows}
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
