import { Minus, Plus } from "lucide-react";
import { Button } from "../ui";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  error?: string;
  unit?: string;
};

/** Touch-friendly integer stepper for bird counts. */
export function CountStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 1,
  max,
  error,
  unit = "",
}: Props) {
  const clamp = (n: number) => {
    let v = Math.max(min, Math.round(n));
    if (max != null && Number.isFinite(max)) v = Math.min(max, v);
    return v;
  };

  const display = unit ? `${value} ${unit}` : String(value);

  return (
    <div>
      <p className="type-label mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="field"
          className="!min-w-[52px] !px-0"
          aria-label="Decrease"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="h-5 w-5" aria-hidden />
        </Button>
        <div
          className={`flex min-h-[52px] flex-1 items-center justify-center rounded-xl border bg-[var(--surface-input)] text-2xl font-semibold tabular-nums text-[var(--text-primary)] ${
            error ? "border-[var(--status-danger)]" : "border-[var(--border-input)]"
          }`}
        >
          {display}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="field"
          className="!min-w-[52px] !px-0"
          aria-label="Increase"
          disabled={max != null && value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--status-danger)]">{error}</p> : null}
    </div>
  );
}
