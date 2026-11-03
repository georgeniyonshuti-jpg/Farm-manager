/** Africa/Kigali has no daylight saving. Weeks start Monday 00:00. */

const TZ = "Africa/Kigali";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kigaliDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function utcNoon(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function ymdFromUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(ymd, days) {
  const next = utcNoon(ymd);
  next.setUTCDate(next.getUTCDate() + days);
  return ymdFromUtc(next);
}

/** Inclusive date range length in days. */
export function inclusiveDays(from, to) {
  const a = utcNoon(from).getTime();
  const b = utcNoon(to).getTime();
  return Math.round((b - a) / DAY_MS) + 1;
}

export function previousRange(from, to) {
  const len = inclusiveDays(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  return { from: prevFrom, to: prevTo };
}

export function inRange(input, from, to) {
  const ymd = kigaliDate(input);
  if (!ymd) return false;
  return ymd >= from && ymd <= to;
}

export function kigaliWeek(now = new Date()) {
  const ymd = kigaliDate(now);
  const noon = utcNoon(ymd);
  const dow = noon.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  const from = addDays(ymd, delta);
  const to = addDays(from, 6);
  const startMs = Date.parse(`${from}T00:00:00+02:00`);
  const elapsedFraction = Math.min(1, Math.max(0, (now.getTime() - startMs) / WEEK_MS));
  return { from, to, elapsedFraction, timezone: TZ };
}

export function weeksEnding(toYmd, count) {
  const probe = new Date(`${toYmd}T12:00:00+02:00`);
  const current = kigaliWeek(probe);
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const from = addDays(current.from, -7 * i);
    out.push({ from, to: addDays(from, 6) });
  }
  return out;
}

export function daysBetween(earlier, later) {
  const a = new Date(earlier).getTime();
  const b = new Date(later).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / DAY_MS;
}

export function hoursBetween(earlier, later) {
  const days = daysBetween(earlier, later);
  return days == null ? null : days * 24;
}

export function kigaliHour(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const day = order.indexOf(weekday);
  if (day < 0 || !Number.isFinite(hour)) return null;
  return { day, hour };
}

export { TZ as KIGALI_TZ };
