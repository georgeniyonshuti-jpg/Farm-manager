/** Calendar month bounds in Africa/Kigali (matches server payroll days). */
export function kigaliMonthRange(): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const fallback = new Date();
    const y0 = fallback.getFullYear();
    const m0 = String(fallback.getMonth() + 1).padStart(2, "0");
    const from = `${y0}-${m0}-01`;
    const last = new Date(y0, Number(m0), 0).getDate();
    return { from, to: `${y0}-${m0}-${String(last).padStart(2, "0")}` };
  }
  const ms = String(m).padStart(2, "0");
  const from = `${y}-${ms}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${y}-${ms}-${String(last).padStart(2, "0")}` };
}
