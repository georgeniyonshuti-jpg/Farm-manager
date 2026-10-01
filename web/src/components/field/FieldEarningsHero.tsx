import { formatRwf } from "../../lib/formatRwf";
import { TranslatedText } from "../../i18n/laborerI18n";
import type { PayrollTotals } from "../../hooks/usePayrollMonthTotals";

type Props = {
  totals: PayrollTotals;
  approvedLabel: string;
  pendingLabel: string;
  netAllLabel: string;
  awaitingLabel: string;
  approvedCount: number;
  pendingCount: number;
};

/** Hero summary for field earnings — approved amount first, pending secondary. */
export function FieldEarningsHero({
  totals,
  approvedLabel,
  pendingLabel,
  netAllLabel,
  awaitingLabel,
  approvedCount,
  pendingCount,
}: Props) {
  const awaitingText = awaitingLabel
    .replace("{approved}", String(approvedCount))
    .replace("{pending}", String(pendingCount));

  return (
    <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
      <p className="type-caption text-[var(--text-muted)]">
        <TranslatedText text={approvedLabel} />
      </p>
      <p className="type-h2 mt-0.5 text-[var(--text-primary)]">{formatRwf(totals.netApproved)}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
        <span>
          <TranslatedText text={pendingLabel} />:{" "}
          <span className="font-semibold text-[var(--text-primary)]">{formatRwf(totals.netPending)}</span>
        </span>
        <span>
          <TranslatedText text={netAllLabel} />:{" "}
          <span className="font-semibold text-[var(--text-primary)]">{formatRwf(totals.netAll)}</span>
        </span>
      </div>
      <p className="mt-2 type-caption text-[var(--text-muted)]">{awaitingText}</p>
    </section>
  );
}
