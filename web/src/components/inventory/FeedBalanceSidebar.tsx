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

type Props = {
  summary: StockRow[];
  feedTypeFilter: string;
  onFeedTypeFilterChange: (value: string) => void;
  feedTypeOptions: FeedTypeOption[];
};

function labelForFeedType(value: string | null, feedTypeOptions: FeedTypeOption[]) {
  if (!value) return "Unspecified";
  return feedTypeOptions.find((option) => option.value === value)?.label ?? value;
}

export function FeedBalanceSidebar({
  summary,
  feedTypeFilter,
  onFeedTypeFilterChange,
  feedTypeOptions,
}: Props) {
  const knownTypes = new Set(feedTypeOptions.map((option) => option.value));
  const summaryByType = new Map(summary.map((row) => [String(row.feedType ?? ""), row]));
  const orderedRows = [
    ...feedTypeOptions.map((option) => {
      const row = summaryByType.get(option.value);
      return {
        feedType: option.value,
        label: option.label,
        purchasedKg: row?.purchasedKg ?? 0,
        usedKg: row?.usedKg ?? 0,
        adjustmentsKg: row?.adjustmentsKg ?? 0,
        balanceKg: row?.balanceKg ?? 0,
      };
    }),
    ...summary
      .filter((row) => row.feedType && !knownTypes.has(row.feedType))
      .map((row) => ({
        feedType: String(row.feedType),
        label: labelForFeedType(row.feedType, feedTypeOptions),
        purchasedKg: row.purchasedKg,
        usedKg: row.usedKg,
        adjustmentsKg: row.adjustmentsKg,
        balanceKg: row.balanceKg,
      })),
  ];

  return (
    <>
      <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 lg:hidden">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Feed balances</h2>
          <button
            type="button"
            className="text-xs font-medium text-[var(--primary-color)] hover:underline"
            onClick={() => onFeedTypeFilterChange("")}
          >
            All feed types
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderedRows.map((row) => {
            const isActive = feedTypeFilter === row.feedType;
            return (
              <button
                key={`chip-${row.feedType}`}
                type="button"
                onClick={() => onFeedTypeFilterChange(isActive ? "" : row.feedType)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  isActive
                    ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {row.label}: {row.balanceKg.toFixed(1)} kg
              </button>
            );
          })}
        </div>
      </section>

      <aside className="hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 lg:block">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Feed balances</h2>
          <button
            type="button"
            className="text-xs font-medium text-[var(--primary-color)] hover:underline"
            onClick={() => onFeedTypeFilterChange("")}
          >
            All feed types
          </button>
        </div>
        <div className="space-y-2">
          {orderedRows.map((row) => {
            const isActive = feedTypeFilter === row.feedType;
            return (
              <button
                key={row.feedType}
                type="button"
                onClick={() => onFeedTypeFilterChange(isActive ? "" : row.feedType)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  isActive
                    ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)]"
                    : "border-[var(--border-color)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{row.label}</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{row.balanceKg.toFixed(1)} kg</span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  +{row.purchasedKg.toFixed(1)} received · {row.usedKg.toFixed(1)} used
                </p>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
