/**
 * The public market has two sections, each with its own short address:
 * Fresh chicken (/raw, the butcher shop) and Live birds (/live, the farm market).
 * Older /market and /market/shop links keep working.
 */

export type MarketSection = "raw" | "live";

export const RAW_PATH = "/raw";
export const LIVE_PATH = "/live";

/** Where an old /market/shop address now lives. Null when it is not a shop address. */
export function shopRedirectPath(pathname: string, search = ""): string | null {
  const m = pathname.match(/^\/market\/shop(\/.*)?$/);
  if (!m) return null;
  const rest = (m[1] || "").replace(/\/+$/, "");
  return `${RAW_PATH}${rest}${search}`;
}

/** Pages that show the section tabs, and which tab is lit. */
export function sectionForPath(pathname: string, shopOpen: boolean): MarketSection | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === RAW_PATH) return "raw";
  if (path === LIVE_PATH || path === "/market") return "live";
  if (path === "/") return shopOpen ? "raw" : "live";
  return null;
}

export function isSectionPath(pathname: string): boolean {
  return pathname === RAW_PATH || pathname.startsWith(`${RAW_PATH}/`) || pathname === LIVE_PATH;
}
