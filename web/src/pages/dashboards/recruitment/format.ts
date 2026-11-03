/** Display helpers for recruitment analytics. Rates are always "x of n". */

export function kigaliToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
}

export function rangeFor(preset: string, now = new Date()): { from: string; to: string } {
  const to = kigaliToday(now);
  if (preset === "today") return { from: to, to };
  const days = preset === "90" ? 89 : preset === "30" ? 29 : preset === "14" ? 13 : 6;
  return { from: addIsoDays(to, -days), to };
}

export function formatRate(x: number, n: number): string {
  if (!(n > 0)) return "n/a";
  if (x < 0 || x > n) return "check data";
  const pct = Math.round((x / n) * 1000) / 10;
  return `${x} of ${n} (${pct}%)`;
}

export function paceLabel(pace: string | null | undefined): string {
  if (pace === "ahead") return "Ahead of pace";
  if (pace === "behind") return "Behind pace";
  if (pace === "on_track") return "On track";
  return "No pace";
}

export function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
