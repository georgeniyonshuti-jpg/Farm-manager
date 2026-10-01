import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  /** Accessible name when placeholder alone is not enough. */
  label?: string;
};

const TOOLBAR_SEARCH =
  "h-8 min-w-[12rem] max-w-xs rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60";

/**
 * Compact search for TableToolbar — fixed 32px height, standard width band.
 * Do not use Field `Input` (48px) on manager list toolbars.
 */
export function ToolbarSearch({ className = "", label, ...rest }: Props) {
  return (
    <input
      type="search"
      className={`${TOOLBAR_SEARCH} ${className}`.trim()}
      aria-label={label ?? rest["aria-label"] ?? rest.placeholder ?? "Search"}
      {...rest}
    />
  );
}
