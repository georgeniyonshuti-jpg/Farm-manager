export const CHICKS_IN_RELATIVE = {
  today: 0,
  about_week: 7,
  about_2_weeks: 14,
  about_month: 30,
} as const;

export type ChicksInRelative = keyof typeof CHICKS_IN_RELATIVE | "date";

export function addUtcDays(dateStr: string, days: number): string | null {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function placementFromRelative(
  kind: string | null | undefined,
  now = new Date(),
  exactDate: string | null = null
): string | null {
  if (kind === "date" || exactDate) {
    const s = String(exactDate || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  const days = CHICKS_IN_RELATIVE[kind as keyof typeof CHICKS_IN_RELATIVE];
  if (days == null) return null;
  return addUtcDays(now.toISOString().slice(0, 10), -days);
}

export function sellingWeekFromPlacement(placementDate: string | null, dayMin = 35, dayMax = 42) {
  if (!placementDate) return null;
  const from = addUtcDays(placementDate, dayMin);
  const to = addUtcDays(placementDate, dayMax);
  if (!from || !to) return null;
  return { readyFrom: from, readyTo: to };
}

export function sellingWeekLabel(readyFrom?: string | null, readyTo?: string | null) {
  if (!readyFrom || !readyTo) return "";
  const fmt = (s: string) =>
    new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  return `Selling week ${fmt(readyFrom)}–${fmt(readyTo)}`;
}

export function visitBeforeLabel(readyFrom?: string | null) {
  const due = readyFrom ? addUtcDays(readyFrom, -7) : null;
  if (!due) return "";
  const fmt = new Date(`${due}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `Visit before ${fmt}`;
}

export type ListingPhase = "on_the_book" | "visit_due" | "weighed" | "live";

export function listingPhaseCopy(phase: ListingPhase | string | null | undefined) {
  if (phase === "live") return { label: "Live", tone: "success" as const };
  if (phase === "weighed") return { label: "Weighed", tone: "success" as const };
  if (phase === "visit_due") return { label: "Visit this week", tone: "warning" as const };
  return { label: "On the book", tone: "neutral" as const };
}
