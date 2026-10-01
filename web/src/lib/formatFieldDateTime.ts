/** Human-readable date/time for field mobile lists (e.g. "Mon 1 Sep · 8:54 AM"). */
export function formatFieldDateTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
}

/** Month heading from payroll period bounds (Africa/Kigali calendar month). */
export function formatPayrollPeriodLabel(from: string, to: string): string {
  try {
    const d = new Date(`${from}T12:00:00`);
    const month = d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "Africa/Kigali" });
    if (from.slice(0, 7) === to.slice(0, 7)) return month;
    return `${from} – ${to}`;
  } catch {
    return `${from} – ${to}`;
  }
}
