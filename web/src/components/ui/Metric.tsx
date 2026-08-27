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
      <p className="type-label">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="type-metric text-[var(--text-primary)] animate-count">{value}</p>
        {trend ? (
          <span
            className={`text-xs font-semibold ${
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
      {context ? <p className="mt-1 type-caption">{context}</p> : null}
    </div>
  );
}
