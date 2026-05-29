import { stripTenantPrefix } from "../lib/tenancy";

/** Paths rendered via PersistentAppPages (Outlet hidden). */
export function isAppShellPersistentPath(pathname: string): boolean {
  const p = stripTenantPrefix(pathname);
  if (p === "/") return false;
  // Dynamic flock pages stay on Outlet so useParams() works.
  if (/^\/farm\/flocks\/[^/]+/.test(p)) return false;
  return (
    p.startsWith("/dashboard/") ||
    p.startsWith("/laborer/") ||
    p.startsWith("/farm") ||
    p.startsWith("/cleva") ||
    p.startsWith("/admin/")
  );
}

export function pathExact(pathname: string, path: string): boolean {
  return stripTenantPrefix(pathname) === path;
}
