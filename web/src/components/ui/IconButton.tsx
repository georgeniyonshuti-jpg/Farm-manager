import type { ButtonHTMLAttributes, ReactNode } from "react";

type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: Size;
  label: string;
  children: ReactNode;
};

const SIZE: Record<Size, string> = {
  sm: "h-control-sm w-control-sm min-h-control-sm",
  md: "h-control-md w-control-md min-h-control-md",
  lg: "h-control-lg w-control-lg min-h-control-lg",
};

/** Square icon-only control — use instead of ad-hoc h-9/h-10 buttons. */
export function IconButton({
  size = "md",
  label,
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={`inline-flex shrink-0 items-center justify-center rounded-control border border-[var(--border-color)] bg-[var(--surface-color)] text-[var(--text-secondary)] hover:bg-[var(--primary-color-soft)] hover:text-[var(--primary-color)] transition disabled:opacity-50 ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
