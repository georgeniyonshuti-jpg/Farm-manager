import type { ReactNode } from "react";
import { Card, Metric } from "../ui";

type MetricItem = {
  label: string;
  value: string;
  context?: string;
};

type Props = {
  statusTitle?: string;
  statusSubtitle?: string;
  metrics?: MetricItem[];
  primaryAction?: ReactNode;
  children?: ReactNode;
};

/** Compact hub body: status card, optional metrics, primary CTA, recent list slot. */
export function FieldTaskHub({ statusTitle, statusSubtitle, metrics, primaryAction, children }: Props) {
  const showStatus = Boolean(statusTitle || statusSubtitle);

  return (
    <div className="space-y-4">
      {showStatus ? (
        <Card level="subtle" className="!p-4">
          {statusTitle ? <p className="type-h3 text-[var(--text-primary)]">{statusTitle}</p> : null}
          {statusSubtitle ? (
            <p className={`type-caption text-[var(--text-muted)]${statusTitle ? " mt-1" : ""}`}>{statusSubtitle}</p>
          ) : null}
        </Card>
      ) : null}

      {metrics && metrics.length > 0 ? (
        <Card
          level="subtle"
          className={
            metrics.length > 2
              ? "field-metric-strip grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--border-color)]"
              : "grid grid-cols-2 gap-3 sm:gap-4"
          }
        >
          {metrics.map((m) => (
            <Metric
              key={m.label}
              label={m.label}
              value={m.value}
              context={m.context}
              className={metrics.length > 2 ? "sm:px-4 first:sm:pl-0 last:sm:pr-0" : undefined}
            />
          ))}
        </Card>
      ) : null}

      {primaryAction ? <div>{primaryAction}</div> : null}
      {children}
    </div>
  );
}
