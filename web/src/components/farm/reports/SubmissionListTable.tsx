import { SubmissionStatusBadge } from "./SubmissionStatusBadge";

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
};

export function SubmissionListTable({ rows, emptyLabel, loading = false }: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--text-muted)] animate-pulse">Loading submissions…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)]">
      <div className="overflow-x-auto">
        <table className="institutional-table min-w-[640px]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Flock</th>
              <th>Submitted by</th>
              <th>Status</th>
              <th>Details</th>
              <th className="tbl-actions">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-[var(--table-row-hover)]" onClick={row.onOpen}>
                <td className="tbl-mono whitespace-nowrap">{row.dateLabel}</td>
                <td className="font-medium">{row.flockLabel}</td>
                <td>{row.authorLabel}</td>
                <td className="tbl-badge">
                  <SubmissionStatusBadge status={row.status} />
                </td>
                <td className="max-w-[12rem] truncate text-[var(--text-muted)]">{row.meta ?? "—"}</td>
                <td className="tbl-actions">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      row.onOpen();
                    }}
                    className="rounded-md border border-[var(--border-color)] px-2 py-1 text-xs font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color-soft)]"
                  >
                    View report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
