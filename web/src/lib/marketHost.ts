import { isAdOrMarketSignupSearch } from "./signupAttribution.ts";

/** Public market site. Farm superuser controls stay on farm.cleva.rw. */
export const MARKET_HOST = "market.cleva.rw";
export const FARM_HOST = "farm.cleva.rw";

const SCOUT_PREFIXES = [
  "/farm/pipeline/home",
  "/farm/pipeline/how-it-works",
  "/farm/pipeline/scout",
  "/farm/pipeline/sellers",
  "/farm/pipeline/crm-sellers",
  "/farm/pipeline/weigh",
];

const MARKET_ACCOUNT_PREFIXES = [
  "/market/listings",
  "/market/pending",
  "/market/orders",
  "/market/commissions",
];

const DESK_MARKET_PREFIXES = [
  "/market/verify",
  "/market/jobs",
  "/market/rates",
  "/market/leads",
];

function appPath(pathname: string): string {
  const match = pathname.match(/^\/app\/[^/]+(\/.*)?$/);
  if (!match) return pathname;
  return match[1] || "/";
}

function starts(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isMarketHostname(hostname: string): boolean {
  return hostname === MARKET_HOST;
}

export function isFarmHostname(hostname: string): boolean {
  return hostname === FARM_HOST;
}

export function isPublicMarketPath(pathname: string): boolean {
  return pathname === "/market" || pathname.startsWith("/market/");
}

/** True when the user explicitly asked for Full Clevafarm workspace signup. */
export function isWorkspaceSignupSearch(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  const w = (p.get("workspace") || "").trim().toLowerCase();
  return w === "1" || w === "true" || w === "yes" || w === "farm";
}

/**
 * Seller, buyer, and scout registration.
 * On market.cleva.rw every /signup is market signup unless workspace=1.
 * On farm.cleva.rw only when ad/market query params are present.
 */
export function isMarketSignup(pathname: string, search: string, hostname = ""): boolean {
  if (pathname !== "/signup") return false;
  if (isWorkspaceSignupSearch(search)) return false;
  if (hostname && isMarketHostname(hostname)) return true;
  return isAdOrMarketSignupSearch(search);
}

/** Desk, farm OS, and admin. Scout field pages and seller accounts are not controls. */
export function isFarmControlPath(pathname: string): boolean {
  const path = appPath(pathname);
  if (path.startsWith("/admin") || path.startsWith("/cleva") || path.startsWith("/dashboard")) return true;
  if (DESK_MARKET_PREFIXES.some((prefix) => starts(path, prefix))) return true;
  if (SCOUT_PREFIXES.some((prefix) => starts(path, prefix))) return false;
  if (MARKET_ACCOUNT_PREFIXES.some((prefix) => starts(path, prefix))) return false;
  if (path === "/farm" || path.startsWith("/farm/")) return true;
  return false;
}

/** Full URL when this request belongs on the other host. Null means stay. */
export function hostRedirectTarget(hostname: string, pathname: string, search = ""): string | null {
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  if (isFarmHostname(hostname) && pathname === "/privacy") {
    return `https://${MARKET_HOST}/privacy${query}`;
  }
  if (
    isFarmHostname(hostname) &&
    (isPublicMarketPath(pathname) || isMarketSignup(pathname, search, hostname))
  ) {
    return `https://${MARKET_HOST}${pathname}${query}`;
  }
  if (isMarketHostname(hostname) && isFarmControlPath(pathname)) {
    return `https://${FARM_HOST}${pathname}${query}`;
  }
  // Full Clevafarm workspace signup belongs on the farm host, not market.
  if (isMarketHostname(hostname) && pathname === "/signup" && isWorkspaceSignupSearch(search)) {
    return `https://${FARM_HOST}${pathname}${query}`;
  }
  return null;
}
