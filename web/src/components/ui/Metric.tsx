import type { ReactNode } from "react";

type Trend = "up" | "down" | "flat";

type Props = {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  trend?: Trend;
  trendLabel?: string;
  className?: string;
};

const TREND_ARROW: Record<Trend, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export function Metric({ label, value, context, trend, trendLabel, className = "" }: Props) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="type-label truncate">{label}</p>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <p className="type-metric whitespace-nowrap text-[var(--text-primary)] animate-count">{value}</p>
        {trend ? (
          <span
            className={`shrink-0 text-xs font-semibold ${
              trend === "up"
                ? "text-[var(--status-success)]"
                : trend === "down"
                  ? "text-[var(--status-danger)]"
                  : "text-[var(--text-muted)]"
            }`}
          >
            {TREND_ARROW[trend]}
            {trendLabel ? ` ${trendLabel}` : ""}
          </span>
        ) : null}
      </div>
      {context ? <p className="mt-1 type-caption truncate">{context}</p> : null}
    </div>
  );
}
