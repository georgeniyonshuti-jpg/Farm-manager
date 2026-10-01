import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "warning" | "danger";

type Props = {
  children: ReactNode;
  tone?: Tone;
  action?: ReactNode;
  className?: string;
  role?: "status" | "alert";
};

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--surface-subtle)] text-[var(--text-secondary)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
};

/**
 * Soft one-line notice under AppTopBar — no border-b, no card chrome.
 * Use for sync warnings, short promo lines, or constraint callouts.
 */
export function NoticeStrip({ children, tone = "neutral", action, className = "", role = "status" }: Props) {
  return (
    <div
      role={role}
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium ${TONE[tone]} ${className}`.trim()}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action != null ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
