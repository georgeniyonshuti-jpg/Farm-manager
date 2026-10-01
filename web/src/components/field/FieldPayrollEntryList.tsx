import { formatRwf } from "../../lib/formatRwf";
import { formatFieldDateTime } from "../../lib/formatFieldDateTime";
import type { PayrollRow } from "../../hooks/usePayrollMonthTotals";
import { StatusPill } from "../ui/StatusPill";
import {
  payrollApprovalLabel,
  payrollApprovalTone,
  payrollLogTypeLabel,
} from "./payrollLabels";

type Props = {
  entries: PayrollRow[];
  approvedLabel: string;
  pendingLabel: string;
  onTimeYes: string;
  onTimeNo: string;
  emptyText: string;
  getTypeLabel?: (logType: string) => string;
};

/** Mobile card list for payroll / earnings entries. */
export function FieldPayrollEntryList({
  entries,
  approvedLabel,
  pendingLabel,
  onTimeYes,
  onTimeNo,
  emptyText,
  getTypeLabel = payrollLogTypeLabel,
}: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {entries.map((e) => {
        const amountClass =
          e.rwfDelta >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]";
        const sign = e.rwfDelta >= 0 ? "+" : "";
        const statusLabel = payrollApprovalLabel(e.approvedAt, pendingLabel, approvedLabel);
        const onTime =
          e.onTime == null ? null : e.onTime ? onTimeYes : onTimeNo;

        return (
          <li key={e.id}>
            <article className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
                  {getTypeLabel(e.logType)}
                </p>
                <p className={`shrink-0 text-sm font-bold tabular-nums ${amountClass}`}>
                  {sign}
                  {formatRwf(e.rwfDelta)}
                </p>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{formatFieldDateTime(e.submittedAt)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill tone={payrollApprovalTone(e.approvedAt)}>{statusLabel}</StatusPill>
                {onTime ? (
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">{onTime}</span>
                ) : null}
              </div>
              {e.reason ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)] line-clamp-2">{e.reason}</p>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
