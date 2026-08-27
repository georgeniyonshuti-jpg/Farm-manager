import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
};

const TONE: Record<StatusTone, string> = {
  success: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  neutral: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral)]",
};

/** Normalized badge: 22px height, 8px horizontal padding, 6px radius (v2 spec §2.5). */
export function StatusPill({ tone = "neutral", children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Badge({ tone = "neutral", children, className = "" }: Props) {
  return (
    <StatusPill tone={tone} className={className}>
      {children}
    </StatusPill>
  );
}
