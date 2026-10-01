import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost" | "success";
type Size = "xs" | "sm" | "md" | "lg" | "field";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--primary-color)] text-[var(--text-on-primary)] hover:bg-[var(--primary-color-dark)] border border-transparent",
  secondary:
    "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--surface-subtle)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]",
  danger: "bg-[var(--status-danger)] text-white border border-transparent hover:opacity-90",
  dangerGhost:
    "bg-transparent text-[var(--status-danger)] border border-[var(--status-danger)]/30 hover:bg-[var(--status-danger-soft)]",
  /** @deprecated Prefer primary for approve. Kept for migration. */
  success: "bg-[var(--status-success)] text-white border border-transparent hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  xs: "min-h-control-sm px-2 text-xs rounded-control",
  sm: "min-h-control-sm px-2.5 text-xs rounded-control",
  md: "min-h-control-md px-3 text-sm rounded-control",
  lg: "min-h-control-lg px-4 text-sm rounded-control",
  field: "min-h-control-field px-4 text-base rounded-control bounce-tap",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  loading = false,
  children,
  disabled,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const resolvedSize = size === "xs" ? "sm" : size;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[resolvedSize]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
