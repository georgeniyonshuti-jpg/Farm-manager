import { Minus, Plus } from "lucide-react";
import { Button } from "../ui";

type Props = {
  label: string;
  value: number;
  unit: string;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  error?: string;
};

/** Touch-friendly dose stepper for medicine logging (ml, g, tablets, etc.). */
export function DoseStepper({
  label,
  value,
  unit,
  onChange,
  step = 1,
  min = 0,
  max,
  error,
}: Props) {
  const clamp = (n: number) => {
    let v = Math.max(min, n);
    if (max != null && Number.isFinite(max)) v = Math.min(max, v);
    const decimals = step < 1 ? 1 : 0;
    return Number(v.toFixed(decimals));
  };

  const display =
    value <= 0 ? "—" : step < 1 ? value.toFixed(1) : String(Math.round(value));

  return (
    <div>
      <p className="type-label mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="field"
          className="!min-w-[52px] !px-0"
          aria-label="Decrease dose"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus className="h-5 w-5" aria-hidden />
        </Button>
        <div
          className={`flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl border bg-[var(--surface-input)] tabular-nums text-[var(--text-primary)] ${
            error ? "border-[var(--status-danger)]" : "border-[var(--border-input)]"
          }`}
        >
          <span className="text-3xl font-semibold">{display}</span>
          {unit ? (
            <span className="text-sm font-medium text-[var(--text-muted)]">{unit}</span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="field"
          className="!min-w-[52px] !px-0"
          aria-label="Increase dose"
          disabled={max != null && value >= max}
          onClick={() => onChange(clamp(value <= 0 ? step : value + step))}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--status-danger)]">{error}</p> : null}
    </div>
  );
}
