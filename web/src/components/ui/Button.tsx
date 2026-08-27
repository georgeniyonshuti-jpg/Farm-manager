import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "field";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--primary-color)] text-[var(--text-on-primary)] hover:bg-[var(--primary-color-dark)] border border-transparent",
  secondary:
    "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--surface-subtle)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--status-neutral-soft)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[var(--status-danger)] text-white border border-transparent hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "min-h-[36px] px-3 text-xs rounded-lg",
  md: "min-h-[44px] px-4 text-sm rounded-xl",
  field: "min-h-[52px] px-4 text-base rounded-xl bounce-tap",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
