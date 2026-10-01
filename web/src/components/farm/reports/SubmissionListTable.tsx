import type { ReactNode } from "react";
import { SubmissionStatusBadge } from "./SubmissionStatusBadge";
import { DataTable, type DataColumn } from "../../ui/DataTable";
import { TextLink } from "../../ui/TextLink";

export type SubmissionRow = {
  id: string;
  dateLabel: string;
  flockLabel: string;
  authorLabel: string;
  status: string;
  meta?: string;
  onOpen: () => void;
};

type Props = {
  rows: SubmissionRow[];
  emptyLabel: string;
  loading?: boolean;
  toolbar?: ReactNode;
  renderRowActions?: (row: SubmissionRow) => ReactNode;
};

export function SubmissionListTable({ rows, emptyLabel, loading = false, toolbar, renderRowActions }: Props) {
  const columns: DataColumn<SubmissionRow>[] = [
    { key: "date", header: "Date", className: "tbl-mono", render: (row) => row.dateLabel },
    { key: "flock", header: "Flock", render: (row) => <span className="font-medium">{row.flockLabel}</span> },
    { key: "author", header: "Submitted by", render: (row) => row.authorLabel },
    {
      key: "status",
      header: "Status",
      badge: true,
      render: (row) => <SubmissionStatusBadge status={row.status} />,
    },
    {
      key: "details",
      header: "Details",
      render: (row) => (
        <span className="max-w-[12rem] truncate text-[var(--text-muted)]">{row.meta ?? "—"}</span>
      ),
    },
    ...(renderRowActions
      ? [
          {
            key: "review",
            header: "Review",
            className: "tbl-actions",
            render: (row: SubmissionRow) => (
              <div onClick={(e) => e.stopPropagation()}>{renderRowActions(row)}</div>
            ),
          } satisfies DataColumn<SubmissionRow>,
        ]
      : []),
  ];

  return (
    <DataTable<SubmissionRow>
      columns={columns}
      rows={loading ? [] : rows}
      rowKey={(row) => row.id}
      onRowClick={(row) => row.onOpen()}
      emptyTitle={loading ? "Loading submissions…" : emptyLabel}
      emptyDescription={loading ? undefined : "Nothing needs review right now."}
      toolbar={toolbar}
      renderMobileCard={(row) => (
        <button
          type="button"
          onClick={row.onOpen}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-left shadow-[var(--shadow-sm)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm">{row.flockLabel}</span>
            <SubmissionStatusBadge status={row.status} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {row.dateLabel} · {row.authorLabel}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{row.meta ?? "—"}</p>
          {renderRowActions ? (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              {renderRowActions(row)}
            </div>
          ) : (
            <TextLink className="mt-2 text-xs" onClick={row.onOpen}>
              Open
            </TextLink>
          )}
        </button>
      )}
    />
  );
}
