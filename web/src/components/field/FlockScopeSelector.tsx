import { ChevronDown } from "lucide-react";
import { useLaborerT } from "../../i18n/laborerI18n";
import { SegmentedControl } from "../ui";
import type { FlockListRow } from "../../hooks/useFlockFieldContext";

type Props = {
  flocks: FlockListRow[];
  flockId: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
  /** compact = chip style for inline headers */
  variant?: "default" | "inline";
  /** Show an "All flocks" empty option (history filters). */
  allowAll?: boolean;
  allLabel?: string;
};

const SEGMENTED_MAX = 3;

function shortFlockLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 12)}…`;
}

export function FlockScopeSelector({
  flocks,
  flockId,
  onChange,
  className = "",
  label,
  variant = "default",
  allowAll = false,
  allLabel,
}: Props) {
  const defaultLabel = useLaborerT("Flock");
  const lbl = label ?? defaultLabel;
  const allLbl = allLabel ?? useLaborerT("All flocks");

  if (flocks.length <= 1 && !allowAll) return null;

  const selected = flocks.find((f) => f.id === flockId);
  const useSegmented = !allowAll && flocks.length >= 2 && flocks.length <= SEGMENTED_MAX;

  if (variant === "inline") {
    return (
      <div className={`relative inline-flex max-w-full ${className}`}>
        <label className="sr-only" htmlFor="flock-scope-inline">
          {lbl}
        </label>
        <select
          id="flock-scope-inline"
          value={flockId}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-full appearance-none rounded-full border border-[var(--border-color)] bg-[var(--surface-subtle)] py-1.5 pl-3 pr-8 text-sm font-semibold text-[var(--text-primary)]"
        >
          {flocks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
      </div>
    );
  }

  if (useSegmented) {
    return (
      <div className={`space-y-1 ${className}`}>
        <SegmentedControl
          label={lbl}
          value={flockId}
          onChange={onChange}
          fullWidth
          variant="grid"
          options={flocks.map((f) => ({
            value: f.id,
            label: shortFlockLabel(f.label),
          }))}
        />
        {selected?.barnName ? (
          <p className="type-caption min-h-[1.25rem] text-[var(--text-muted)]">{selected.barnName}</p>
        ) : (
          <p className="min-h-[1.25rem]" aria-hidden />
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="type-caption text-[var(--text-muted)]" htmlFor="flock-scope-select">
        {lbl}
      </label>
      <div className="relative">
        <select
          id="flock-scope-select"
          value={flockId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-3 pr-10 text-base font-semibold text-[var(--text-primary)] shadow-sm"
        >
          {allowAll ? <option value="">{allLbl}</option> : null}
          {flocks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
      </div>
      {selected?.barnName ? (
        <p className="type-caption min-h-[1.25rem] text-[var(--text-muted)]">{selected.barnName}</p>
      ) : (
        <p className="min-h-[1.25rem]" aria-hidden />
      )}
    </div>
  );
}
