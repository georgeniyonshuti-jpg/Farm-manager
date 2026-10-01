import type { FieldPerformanceSummary } from "../../hooks/useFlockFieldContext";
import type { CheckinStatus } from "../../pages/farm/checkinStatusTypes";

export type FlockPassportMetric = {
  label: string;
  value: string | number;
  context?: string;
};

export function buildFlockPassportMetrics(
  status: Pick<CheckinStatus, "ageDays"> | null | undefined,
  performance: FieldPerformanceSummary | null | undefined,
  labels: { day: string; liveBirds: string },
  context?: string
): FlockPassportMetric[] {
  const live =
    performance?.birdsLiveEstimate ?? performance?.verifiedLiveCount ?? "—";
  return [
    { label: labels.day, value: status?.ageDays ?? "—" },
    { label: labels.liveBirds, value: live, context },
  ];
}
