import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export type FacetOption = {
  value: string;
  label: string;
  count?: number;
};

type Props = {
  label: string;
  options: FacetOption[];
  /** Single-select value. Use "" / "all" for none. */
  value: string;
  onChange: (value: string) => void;
  /** Value that means “no filter” (default “all”). */
  allValue?: string;
  allLabel?: string;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Filter menu for >5 options or secondary facets.
 * Applied value shows as a removable chip; closed menu shows “Filter: Label”.
 */
export function FacetFilter({
  label,
  options,
  value,
  onChange,
  allValue = "all",
  allLabel = "All",
  className = "",
  size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = value !== allValue && value !== "";
  const activeLabel = options.find((o) => o.value === value)?.label;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <Button
        type="button"
        variant="secondary"
        size={size}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {active ? (
          <span className="ml-1 text-[var(--text-muted)]">· 1</span>
        ) : null}
      </Button>
      {active && activeLabel ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          onClick={() => onChange(allValue)}
          aria-label={`Clear ${label} filter`}
        >
          {activeLabel}
          <span aria-hidden className="text-[var(--text-muted)]">
            ×
          </span>
        </button>
      ) : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-[12rem] overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-md)]"
        >
          <FacetOptionRow
            selected={value === allValue || value === ""}
            onSelect={() => {
              onChange(allValue);
              setOpen(false);
            }}
          >
            {allLabel}
          </FacetOptionRow>
          {options.map((opt) => (
            <FacetOptionRow
              key={opt.value}
              selected={opt.value === value}
              onSelect={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="flex-1">{opt.label}</span>
              {opt.count != null ? (
                <span className="tabular-nums text-[var(--text-muted)]">{opt.count}</span>
              ) : null}
            </FacetOptionRow>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FacetOptionRow({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition ${
        selected
          ? "bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
      }`}
    >
      {children}
    </button>
  );
}
