import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

type Props = {
  to: string;
  label: string;
  className?: string;
};

/** Quiet way back to a list. Same shape as a secondary button, with a chevron. */
export function ListBackLink({ to, label, className = "" }: Props) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-control-sm items-center gap-1 rounded-control border border-[var(--border-color)] bg-[var(--surface-card)] pl-1.5 pr-2.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-subtle)] ${className}`.trim()}
    >
      <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
      {label}
    </Link>
  );
}
