import { Card, Metric } from "../ui";

export type FieldMetricItem = {
  label: string;
  value: string | number;
  context?: string;
};

type Props = {
  metrics: FieldMetricItem[];
  columns?: 2 | 3;
};

/** Compact metric row for field capture flows (e.g. vet mortality review). */
export function FieldMetricStrip({ metrics, columns = 3 }: Props) {
  const shown = metrics.slice(0, columns);
  if (shown.length === 0) return null;

  const gridClass =
    shown.length === 1
      ? "grid-cols-1"
      : shown.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <Card level="subtle" className="!p-3">
      <div className={`grid gap-3 ${gridClass}`}>
        {shown.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} context={m.context} />
        ))}
      </div>
    </Card>
  );
}
