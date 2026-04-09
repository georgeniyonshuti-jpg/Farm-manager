type Props = {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
};

function toneClass(tone: NonNullable<Props["tone"]>): string {
  switch (tone) {
    case "good":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "warn":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "bad":
      return "bg-red-50 text-red-900 border-red-200";
    default:
      return "bg-neutral-50 text-neutral-900 border-neutral-200";
  }
}

export function MiniStat({ label, value, tone = "default" }: Props) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass(tone)}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
