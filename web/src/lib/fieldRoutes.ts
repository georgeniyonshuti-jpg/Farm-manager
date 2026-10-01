/** Append or replace flockId on an app-relative path (may include query). */
export function fieldRoute(path: string, flockId?: string | null): string {
  if (!flockId) return path;
  const qIndex = path.indexOf("?");
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const qs = qIndex >= 0 ? path.slice(qIndex + 1) : "";
  const params = new URLSearchParams(qs);
  params.set("flockId", flockId);
  const next = params.toString();
  return next ? `${base}?${next}` : base;
}

export function readFlockIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("flockId")?.trim();
  return id || null;
}
