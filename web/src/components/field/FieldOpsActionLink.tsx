import { Link } from "react-router-dom";

type Variant = "primary" | "danger" | "neutral" | "emerald" | "purple" | "soft";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-[var(--primary-color)] text-lg font-semibold text-white shadow hover:bg-[var(--primary-color-dark)]",
  danger:
    "border-2 border-red-500/35 bg-red-500/10 text-lg font-semibold text-red-300 hover:bg-red-500/15",
  neutral:
    "border border-[var(--border-color)] bg-[var(--surface-card)] text-lg font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]",
  emerald:
    "border-2 border-emerald-600/35 bg-emerald-600/10 text-lg font-semibold text-emerald-800 hover:bg-emerald-600/15 dark:text-emerald-300",
  purple:
    "border-2 border-violet-500/35 bg-violet-500/10 text-lg font-semibold text-violet-800 hover:bg-violet-500/15 dark:text-violet-300",
  soft:
    "border border-[var(--primary-color)]/30 bg-[var(--primary-color-soft)] text-lg font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]",
};

type Props = {
  to: string;
  variant?: Variant;
  children: React.ReactNode;
};

export function FieldOpsActionLink({ to, variant = "neutral", children }: Props) {
  return (
    <Link
      to={to}
      className={`bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl px-4 ${VARIANT_CLASS[variant]}`}
    >
      {children}
    </Link>
  );
}
