type Tone = "default" | "good" | "warn" | "bad";

type Props = {
  label: string;
  value: string | number;
  tone?: Tone;
  change?: string;
  icon?: string;
  glow?: boolean;
};

function toneClasses(tone: Tone): { card: string; value: string; change?: string } {
  switch (tone) {
    case "good":
      return {
        card: "border-emerald-500/30 bg-[var(--surface-card)]",
        value: "text-emerald-500",
        change: "text-emerald-500",
      };
    case "warn":
      return {
        card: "border-amber-500/30 bg-[var(--surface-card)]",
        value: "text-amber-500",
        change: "text-amber-500",
      };
    case "bad":
      return {
        card: "border-red-500/30 bg-[var(--surface-card)]",
        value: "text-red-500",
        change: "text-red-500",
      };
    default:
      return {
        card: "border-[var(--border-color)] bg-[var(--surface-card)]",
        value: "text-[var(--text-primary)]",
      };
  }
}

function glowClass(tone: Tone): string {
  switch (tone) {
    case "good": return "stat-glow-good";
    case "warn": return "stat-glow-warn";
    case "bad": return "stat-glow-bad";
    default: return "";
  }
}

export function MiniStat({ label, value, tone = "default", change, icon, glow = false }: Props) {
  const c = toneClasses(tone);
  return (
    <div
      className={[
        "rounded-[var(--radius-lg)] border px-4 py-3 animate-fade-up",
        c.card,
        glow ? glowClass(tone) : "shadow-[var(--shadow-sm)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
        {icon && <span className="text-base opacity-60">{icon}</span>}
      </div>
      <p className={["mt-1.5 text-2xl font-bold tabular-nums", c.value].join(" ")}>{value}</p>
      {change ? (
        <p className={["mt-0.5 text-xs font-medium", c.change ?? "text-[var(--text-muted)]"].join(" ")}>
          {change}
        </p>
      ) : null}
    </div>
  );
}
