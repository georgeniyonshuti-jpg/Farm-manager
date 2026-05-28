type Tone = "default" | "good" | "warn" | "bad";

type Props = {
  label: string;
  value: string | number;
  tone?: Tone;
  change?: string;
  icon?: string;
  glow?: boolean;
};

function toneConfig(tone: Tone): {
  bar: string;
  value: string;
  change: string;
  glow: string;
  watermark: string;
} {
  switch (tone) {
    case "good":
      return {
        bar: "stat-bar-good",
        value: "text-emerald-500",
        change: "text-emerald-500",
        glow: "stat-glow-good",
        watermark: "text-emerald-500/[0.06]",
      };
    case "warn":
      return {
        bar: "stat-bar-warn",
        value: "text-amber-500",
        change: "text-amber-500",
        glow: "stat-glow-warn",
        watermark: "text-amber-500/[0.06]",
      };
    case "bad":
      return {
        bar: "stat-bar-bad",
        value: "text-red-500",
        change: "text-red-500",
        glow: "stat-glow-bad",
        watermark: "text-red-500/[0.06]",
      };
    default:
      return {
        bar: "stat-bar-default",
        value: "text-[var(--text-primary)]",
        change: "text-[var(--text-muted)]",
        glow: "",
        watermark: "text-[var(--text-muted)]/[0.05]",
      };
  }
}

export function MiniStat({ label, value, tone = "default", change, icon, glow = false }: Props) {
  const c = toneConfig(tone);
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-card)] px-4 py-3.5 animate-fade-up",
        c.bar,
        glow ? c.glow : "shadow-[var(--shadow-sm)]",
        "border-[var(--border-color)]",
      ].join(" ")}
    >
      {/* Background watermark icon */}
      {icon && (
        <span
          aria-hidden
          className={["absolute -right-1 -bottom-2 select-none text-[4rem] leading-none pointer-events-none", c.watermark].join(" ")}
        >
          {icon}
        </span>
      )}

      {/* Label */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] truncate pr-8">
        {label}
      </p>

      {/* Value */}
      <p className={["mt-2 font-mono-data text-3xl font-bold leading-none tabular-nums", c.value].join(" ")}>
        {value}
      </p>

      {/* Change / sub-label */}
      {change ? (
        <p className={["mt-1.5 flex items-center gap-1 text-[11px] font-medium", c.change].join(" ")}>
          <span aria-hidden className="text-[10px]">›</span>
          {change}
        </p>
      ) : null}
    </div>
  );
}
