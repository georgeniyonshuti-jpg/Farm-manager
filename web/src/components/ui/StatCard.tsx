import type { ReactNode } from "react";

type TrendTone = "positive" | "negative" | "neutral";
type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
type ValueColor = "default" | "success" | "warning" | "critical";

type Props = {
  label: ReactNode;
  value: ReactNode;
  /** Small gray helper line under the hero value (v2 spec §2.2). */
  subtext?: ReactNode;
  /** Color the hero number only when it is itself a health signal (v2 spec §2.2). */
  valueColor?: ValueColor;
  trend?: ReactNode;
  trendTone?: TrendTone;
  status?: ReactNode;
  statusTone?: StatusTone;
  muted?: boolean;
};

const trendClass: Record<TrendTone, string> = {
  positive: "text-[var(--status-success)]",
  negative: "text-[var(--status-danger)]",
  neutral: "text-[var(--text-muted)]",
};

const valueColorClass: Record<ValueColor, string> = {
  default: "text-[var(--text-primary)]",
  success: "text-[var(--status-success)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-danger)]",
};

const statusClass: Record<StatusTone, string> = {
  success: "border-[var(--status-success)]/25 bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "border-[var(--status-warning)]/25 bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "border-[var(--status-danger)]/25 bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  info: "border-[var(--status-info)]/25 bg-[var(--status-info-soft)] text-[var(--status-info)]",
  neutral: "border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--text-secondary)]",
};

export function StatCard({
  label,
  value,
  subtext,
  valueColor = "default",
  trend,
  trendTone = "neutral",
  status,
  statusTone = "neutral",
  muted = false,
}: Props) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-sm)]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--text-label,var(--text-muted))]">{label}</p>
      <p
        className={[
          "mt-2 text-[34px] font-bold leading-[38px] tabular-nums",
          valueColorClass[valueColor],
          muted ? "opacity-60" : "",
        ].join(" ")}
      >
        {value}
      </p>
      {subtext != null ? <p className="mt-1 text-xs text-[var(--text-muted)]">{subtext}</p> : null}
      {(trend != null || status != null) && (
        <div className="mt-3 flex items-center gap-2">
          {trend != null ? <span className={`text-xs font-medium ${trendClass[trendTone]}`}>{trend}</span> : null}
          {status != null ? (
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass[statusTone]}`}>
              {status}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
