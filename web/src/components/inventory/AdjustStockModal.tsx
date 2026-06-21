type FeedTypeOption = {
  value: string;
  label: string;
};

type RefOption = {
  value: string;
  label: string;
};

type Props = {
  open: boolean;
  busy: boolean;
  feedTypeOptions: FeedTypeOption[];
  adjustReasons: RefOption[];
  adjFeedType: string;
  adjDelta: string;
  adjReasonCode: string;
  onClose: () => void;
  onSubmit: () => void;
  setAdjFeedType: (value: string) => void;
  setAdjDelta: (value: string) => void;
  setAdjReasonCode: (value: string) => void;
};

export function AdjustStockModal({
  open,
  busy,
  feedTypeOptions,
  adjustReasons,
  adjFeedType,
  adjDelta,
  adjReasonCode,
  onClose,
  onSubmit,
  setAdjFeedType,
  setAdjDelta,
  setAdjReasonCode,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-elevated md:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Adjust stock</h2>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">Use negative values for losses (damage, expiry, count corrections).</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Feed type</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={adjFeedType}
                onChange={(e) => setAdjFeedType(e.target.value)}
              >
                {feedTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Delta kg (+/-)</label>
              <input
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="e.g. -20 or +50"
                inputMode="decimal"
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={adjReasonCode}
                onChange={(e) => setAdjReasonCode(e.target.value)}
              >
                {adjustReasons.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] pt-3">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !adjDelta}
              onClick={onSubmit}
              className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save adjustment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
