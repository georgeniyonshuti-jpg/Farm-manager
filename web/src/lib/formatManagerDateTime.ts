const KIGALI = "Africa/Kigali";

/** Manager tables: human Kigali date/time. Keep ISO in title/tooltip only. */
export function formatManagerDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    const date = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: KIGALI,
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: KIGALI,
    });
    return `${date}, ${time}`;
  } catch {
    return iso;
  }
}

/** Date-only (YYYY-MM-DD or ISO). */
export function formatManagerDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const raw = iso.length <= 10 ? `${iso}T12:00:00` : iso;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: KIGALI,
    });
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatManagerDate(iso);
}
