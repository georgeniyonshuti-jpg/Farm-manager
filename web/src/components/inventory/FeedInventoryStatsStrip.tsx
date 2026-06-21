type StockRow = {
  feedType: string | null;
  purchasedKg: number;
  usedKg: number;
  adjustmentsKg: number;
  balanceKg: number;
};

type Props = {
  summary: StockRow[];
};

export function FeedInventoryStatsStrip({ summary }: Props) {
  const totals = summary.reduce(
    (acc, row) => {
      acc.balanceKg += Number(row.balanceKg) || 0;
      acc.purchasedKg += Number(row.purchasedKg) || 0;
      acc.usedKg += Number(row.usedKg) || 0;
      return acc;
    },
    { balanceKg: 0, purchasedKg: 0, usedKg: 0 }
  );

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Balance</p>
          <p className="text-base font-semibold text-[var(--text-primary)]">{totals.balanceKg.toFixed(1)} kg</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Purchased</p>
          <p className="text-base font-semibold text-[var(--text-primary)]">+{totals.purchasedKg.toFixed(1)} kg</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Used</p>
          <p className="text-base font-semibold text-[var(--text-primary)]">{totals.usedKg.toFixed(1)} kg</p>
        </div>
      </div>
    </section>
  );
}
