/** Paths rendered via PersistentAppPages (Outlet hidden). */
export function isAppShellPersistentPath(pathname: string): boolean {
  if (pathname === "/") return false;
  // Dynamic flock pages stay on Outlet so useParams() works.
  if (/^\/farm\/flocks\/[^/]+/.test(pathname)) return false;
  return (
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/laborer/") ||
    pathname.startsWith("/farm") ||
    pathname.startsWith("/cleva") ||
    pathname.startsWith("/admin/")
  );
}

export function pathExact(pathname: string, path: string): boolean {
  return pathname === path;
}
