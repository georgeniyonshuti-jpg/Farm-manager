/**
 * API configuration for ClevaFarm PWA.
 *
 * VITE_API_MODE:
 *   legacy — Node API at VITE_API_URL (default, bridge mode)
 *   frappe — ERPNext whitelisted methods at VITE_ERPNEXT_URL
 */
export type ApiMode = "legacy" | "frappe";

export const API_MODE: ApiMode =
  (import.meta.env.VITE_API_MODE as ApiMode | undefined) ?? "legacy";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

export const ERPNEXT_URL =
  import.meta.env.VITE_ERPNEXT_URL ?? "https://erp.clevacredit.com";

export const IS_FRAPPE_MODE = API_MODE === "frappe";

/** Build legacy Node API URL. */
export function legacyApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

/** Build Frappe whitelisted method URL. */
export function frappeMethodUrl(method: string): string {
  const normalized = method.startsWith("clevafarm_integration.")
    ? method
    : `clevafarm_integration.api.${method}`;
  return `${ERPNEXT_URL}/api/method/${normalized}`;
}

/** Route map: legacy path → Frappe method for incremental migration. */
export const FRAPPE_METHOD_MAP: Record<string, string> = {
  "/api/flocks": "flock.get_flocks",
  "/api/companies/resolve": "company.get_company_by_slug",
  "/api/feed-entries/pending": "feed.get_pending_feed_entries",
  "/api/mortality-events/pending": "mortality.get_pending_mortality_events",
  "/api/check-ins/pending": "checkin.get_pending_checkins",
  "/api/vet-logs": "vet.get_vet_logs",
};

export function buildApiUrl(legacyPath: string, frappeMethod?: string): string {
  if (!IS_FRAPPE_MODE) return legacyApiUrl(legacyPath);
  const method =
    frappeMethod ??
    FRAPPE_METHOD_MAP[legacyPath.replace(/\/[^/]+$/, "").replace(/\?.*$/, "")] ??
    legacyPath;
  if (method.startsWith("/")) return legacyApiUrl(method);
  return frappeMethodUrl(method);
}

export function apiFetchInit(token: string | null): RequestInit {
  if (IS_FRAPPE_MODE) {
    return { credentials: "include" };
  }
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
