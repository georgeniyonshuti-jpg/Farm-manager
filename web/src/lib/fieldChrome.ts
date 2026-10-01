import { stripTenantPrefix } from "./tenancy";

export type FieldChromeMode = "home" | "minimal" | "hidden";

/** Time-of-day greeting prefix for field home dashboards. */
export function fieldHomeGreetingPrefix(): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function fieldHomeFirstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** Time-of-day greeting for field home dashboards. */
export function fieldHomeGreeting(displayName: string): string {
  return `${fieldHomeGreetingPrefix()}, ${fieldHomeFirstName(displayName)}`;
}

/** Resolve global header chrome for field shell users. */
export function resolveFieldChromeMode(pathname: string, search: string): FieldChromeMode {
  const params = new URLSearchParams(search);
  if (params.get("log") === "1") return "hidden";

  const path = stripTenantPrefix(pathname).replace(/\/+$/, "") || "/";
  if (
    path === "/dashboard/laborer" ||
    path === "/dashboard/vet" ||
    path === "/farm/pipeline" ||
    path === "/market" ||
    path === "/market/orders" ||
    path === "/market/listings" ||
    path === "/market/verify" ||
    path === "/market/rates" ||
    path === "/market/jobs" ||
    path === "/market/commissions"
  ) {
    return "home";
  }
  if (path.startsWith("/farm/") || path.startsWith("/laborer/") || path.startsWith("/market/"))
    return "hidden";
  return "minimal";
}
