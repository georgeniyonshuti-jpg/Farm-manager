type PageTabOption = { value: string; label: string; badge?: number };

type PageTabsProps = {
  value: string;
  options: PageTabOption[];
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * Underline page tabs for distinct jobs on one route (Treatments / Rounds / Inventory).
 * Prefer SegmentedControl for filters and in-form mutually exclusive choices.
 */
export function PageTabs({
  value,
  options,
  onChange,
  className = "",
  "aria-label": ariaLabel = "Page sections",
}: PageTabsProps) {
  return (
    <div
      className={`flex h-full max-w-full items-stretch gap-0.5 overflow-x-auto ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`bounce-tap inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition ${
              active
                ? "border-[var(--primary-color)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {opt.label}
            {opt.badge != null && opt.badge > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  active
                    ? "bg-[var(--primary-color)] text-white"
                    : "bg-[var(--border-color)] text-[var(--text-secondary)]"
                }`}
              >
                {opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
