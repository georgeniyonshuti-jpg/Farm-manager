import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /** Top-aligned, less padding — for field task pages on mobile. */
  variant?: "default" | "compact";
};

/** Teaching empty state — compact by default for desktop density. */
export function EmptyState({ title, description, action, icon, variant = "default" }: Props) {
  const compact = variant === "compact";
  return (
    <div
      className={`flex flex-col rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--surface-elevated)] px-card ${
        compact ? "items-start py-stack text-left" : "items-center justify-center py-section text-center"
      }`}
    >
      {icon ? (
        <div className={`text-[var(--text-muted)] ${compact ? "mb-2" : "mb-2"}`}>{icon}</div>
      ) : (
        <svg
          className={`text-[var(--text-muted)] ${compact ? "mb-2 h-8 w-8" : "mb-2 h-6 w-6"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.25}
            d="M20 13V7a2 2 0 00-2-2h-3l-1-2H10L9 5H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0h-6m-6 0H4"
          />
        </svg>
      )}
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description ? <p className="mt-1 max-w-md type-caption">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
