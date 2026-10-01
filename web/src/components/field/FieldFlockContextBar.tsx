import type { ReactNode } from "react";
import { SkeletonList } from "../LoadingSkeleton";
import { FieldCompactStatus } from "./FieldCompactStatus";
import { FlockScopeSelector } from "./FlockScopeSelector";
import type { CheckinBadge } from "../farm/CheckinUrgencyBadge";
import type { FlockListRow } from "../../hooks/useFlockFieldContext";

type MetricItem = {
  label: string;
  value: string | number;
  context?: string;
};

type Props = {
  flocks: FlockListRow[];
  flockId: string;
  onFlockChange: (id: string) => void;
  flockLabel?: string;
  flockLabelText?: string;
  badge?: CheckinBadge | null;
  badgeSlot?: ReactNode;
  metrics: MetricItem[];
  loading?: boolean;
  className?: string;
};

/**
 * Task-page flock context: selector (when multiple) + read-only metrics without repeating the flock name.
 */
export function FieldFlockContextBar({
  flocks,
  flockId,
  onFlockChange,
  flockLabel,
  flockLabelText,
  badge,
  badgeSlot,
  metrics,
  loading = false,
  className = "",
}: Props) {
  const showSelector = flocks.length > 1;
  const selectorLabel = flockLabel;

  return (
    <div className={`min-h-[7.5rem] space-y-3 ${className}`}>
      {showSelector ? (
        <FlockScopeSelector
          flocks={flocks}
          flockId={flockId}
          onChange={onFlockChange}
          label={selectorLabel}
        />
      ) : null}

      {loading ? (
        <SkeletonList rows={1} />
      ) : flockLabelText ? (
        <FieldCompactStatus
          flockLabel={flockLabelText}
          hideFlockLabel={showSelector}
          badge={badge}
          badgeSlot={badgeSlot}
          metrics={metrics}
        />
      ) : null}
    </div>
  );
}
