import { Button } from "../ui/Button";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/** Shared pager for manager DataTables (Vet logs, Feed ledger, etc.). */
export function TablePagination({ page, pageSize, total, onPageChange, className = "" }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (total <= pageSize) return null;

  return (
    <div
      className={`flex items-center justify-between gap-2 border-t border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-muted)] ${className}`.trim()}
    >
      <span className="tabular-nums">
        Page {page} of {totalPages} ({total} total)
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          ← Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
