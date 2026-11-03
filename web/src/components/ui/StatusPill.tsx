import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  /** Sentence case. The default pill stays in capitals. */
  sentence?: boolean;
};

const TONE: Record<StatusTone, string> = {
  success: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  neutral: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral)]",
};

/** Normalized badge: 22px height, 8px horizontal padding, 6px radius (v2 spec §2.5). */
export function StatusPill({ tone = "neutral", children, className = "", sentence = false }: Props) {
  const letter = sentence ? "normal-case tracking-normal" : "uppercase tracking-wide";
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold ${letter} ${TONE[tone]} ${className}`}
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
