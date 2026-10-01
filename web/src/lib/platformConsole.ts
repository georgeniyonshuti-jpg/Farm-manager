import { stripTenantPrefix } from "./tenancy";

/** Platform operator console (superuser) — not tenant farm chrome. */
export function isPlatformConsolePath(pathname: string): boolean {
  const p = stripTenantPrefix(pathname);
  return p === "/admin/super" || p.startsWith("/admin/super/");
}

export type PlatformConsoleSection = "companies" | "plans" | "announce" | "repair";

export function platformConsoleSection(pathname: string): PlatformConsoleSection {
  const p = stripTenantPrefix(pathname);
  if (p.startsWith("/admin/super/plans")) return "plans";
  if (p.startsWith("/admin/super/announce")) return "announce";
  if (p.startsWith("/admin/super/repair")) return "repair";
  return "companies";
}
