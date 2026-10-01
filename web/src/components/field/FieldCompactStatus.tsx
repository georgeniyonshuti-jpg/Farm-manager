import type { ReactNode } from "react";
import { Card, Metric } from "../ui";
import { CheckinUrgencyBadge, type CheckinBadge } from "../farm/CheckinUrgencyBadge";

type MetricItem = {
  label: string;
  value: string | number;
  context?: string;
};

type Props = {
  flockLabel: string;
  /** When a flock selector is shown above, omit the duplicate flock title. */
  hideFlockLabel?: boolean;
  badge?: CheckinBadge | null;
  badgeSlot?: ReactNode;
  metrics: MetricItem[];
};

/** Slim hub status strip — flock name + optional urgency + up to 2 metrics. */
export function FieldCompactStatus({
  flockLabel,
  hideFlockLabel = false,
  badge,
  badgeSlot,
  metrics,
}: Props) {
  const shown = metrics.slice(0, 2);
  const showHeader = !hideFlockLabel || badge || badgeSlot;

  return (
    <Card level="subtle" className="!p-4 space-y-3">
      {showHeader ? (
        <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-2">
          {hideFlockLabel ? (
            <span className="sr-only">{flockLabel}</span>
          ) : (
            <p className="type-h3 text-[var(--text-primary)]">{flockLabel}</p>
          )}
          {badgeSlot ?? (badge ? <CheckinUrgencyBadge badge={badge} /> : null)}
        </div>
      ) : null}
      {shown.length > 0 ? (
        <div className={`grid gap-3 ${shown.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {shown.map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} context={m.context} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
