import { useLaborerT } from "../../i18n/laborerI18n";

export type CheckinBadge = "ok" | "upcoming" | "overdue";

type Props = { badge: CheckinBadge; className?: string };

/**
 * FIX: visual urgency from age-based schedule (overdue / within 1h / ok)
 */
export function CheckinUrgencyBadge({ badge, className = "" }: Props) {
  const overdue = useLaborerT("OVERDUE");
  const upcoming = useLaborerT("Due soon");
  const ok = useLaborerT("On track");

  if (badge === "overdue") {
    return (
      <span
        className={`inline-flex rounded-md border border-red-500/30 bg-red-500/12 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-red-400 ${className}`}
      >
        {overdue}
      </span>
    );
  }
  if (badge === "upcoming") {
    return (
      <span
        className={`inline-flex rounded-md border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-400 ${className}`}
      >
        {upcoming}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-400 ${className}`}
    >
      {ok}
    </span>
  );
}
