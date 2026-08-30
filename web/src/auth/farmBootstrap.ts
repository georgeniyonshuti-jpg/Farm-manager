import type { UserRole } from "./types";

export const FARM_BOOTSTRAP_STORAGE_KEY = "cleva_farm_bootstrap";

export type FarmCapabilities = {
  checkin?: boolean;
  feed_log?: boolean;
  mortality?: boolean;
  weigh_in?: boolean;
  vet_log_create?: boolean;
  vet_log_review?: boolean;
  treatment_rounds?: boolean;
  medicine_stock?: boolean;
  slaughter?: boolean;
  payroll_visible?: boolean;
  review_queue?: boolean;
};

export type FarmTodayItem = {
  item_id?: string;
  category?: string;
  severity?: string;
  title?: string;
  subtitle?: string;
  action_route?: string;
  actionRoute?: string;
  action_label?: string;
  actionLabel?: string;
  flock_id?: string;
  flockId?: string;
  barn?: string | null;
  meta?: Record<string, unknown>;
};

export type FarmTodayPayload = {
  items?: FarmTodayItem[];
  summary?: { red?: number; amber?: number; green?: number };
  slug?: string;
};

export type FarmBootstrapFarm = {
  name: string;
  slug: string;
  farm_name?: string;
  company?: string;
  farm_type?: string;
  erpnext_access?: boolean;
  capabilities?: FarmCapabilities;
  barns?: Array<{ id: string; name: string }>;
  flocks?: Array<{ id: string; name: string; barn?: string; status?: string }>;
  today?: FarmTodayPayload | null;
};

export type ErpAppRole = "laborer" | "junior_vet" | "vet_manager" | "admin" | string;

export type FarmBootstrap = {
  user?: string;
  email?: string;
  name?: string;
  role?: ErpAppRole;
  language?: string;
  auth_source?: string;
  erpnext_access?: boolean;
  farm_type?: string;
  capabilities?: FarmCapabilities;
  farms?: FarmBootstrapFarm[];
  pwa_base_url?: string;
  today?: FarmTodayPayload | null;
};

/** ERP contract route key → tenant-relative PWA path (under /app/:slug). */
export const CONTRACT_ROUTE_ALIASES: Record<string, string> = {
  checkin: "farm/checkin",
  feed: "farm/feed",
  mortality: "farm/mortality-log",
  "vet/log": "farm/vet-logs",
  "medicine/rounds": "farm/treatments",
  "weigh-in": "farm/vet-logs",
  slaughter: "farm/slaughter",
  "medicine/stock": "farm/inventory",
  review: "farm/checkin-review",
};

export function mapErpRoleToPwaRole(erpRole: string | undefined | null): UserRole | null {
  switch (String(erpRole || "").trim().toLowerCase()) {
    case "laborer":
      return "laborer";
    case "junior_vet":
      return "vet";
    case "vet_manager":
      return "vet_manager";
    case "admin":
      return "company_admin";
    default:
      return null;
  }
}

export function readStoredFarmBootstrap(): FarmBootstrap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FARM_BOOTSTRAP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FarmBootstrap;
  } catch {
    return null;
  }
}

export function persistFarmBootstrap(bootstrap: FarmBootstrap | null | undefined): void {
  if (typeof window === "undefined") return;
  if (!bootstrap) {
    sessionStorage.removeItem(FARM_BOOTSTRAP_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(FARM_BOOTSTRAP_STORAGE_KEY, JSON.stringify(bootstrap));
}

export function clearStoredFarmBootstrap(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(FARM_BOOTSTRAP_STORAGE_KEY);
}

export function farmForSlug(bootstrap: FarmBootstrap | null | undefined, slug: string | undefined) {
  if (!bootstrap?.farms?.length || !slug) return null;
  const key = slug.trim().toLowerCase();
  return (
    bootstrap.farms.find((f) => String(f.slug || "").trim().toLowerCase() === key) ??
    bootstrap.farms.find((f) => String(f.name || "").trim().toLowerCase() === key) ??
    null
  );
}

export function capabilitiesForFarm(
  bootstrap: FarmBootstrap | null | undefined,
  slug: string | undefined
): FarmCapabilities | null {
  const farm = farmForSlug(bootstrap, slug);
  if (farm?.capabilities) return farm.capabilities;
  return bootstrap?.capabilities ?? null;
}

export function erpnextAccessForFarm(
  bootstrap: FarmBootstrap | null | undefined,
  slug: string | undefined
): boolean {
  const farm = farmForSlug(bootstrap, slug);
  if (farm && typeof farm.erpnext_access === "boolean") return farm.erpnext_access;
  if (typeof bootstrap?.erpnext_access === "boolean") return bootstrap.erpnext_access;
  return true;
}

export function hasCapability(
  capabilities: FarmCapabilities | null | undefined,
  key: keyof FarmCapabilities
): boolean {
  if (!capabilities) return true;
  const value = capabilities[key];
  if (value === undefined) return true;
  return Boolean(value);
}

export function todayForFarm(
  bootstrap: FarmBootstrap | null | undefined,
  slug: string | undefined
): FarmTodayPayload | null {
  const farm = farmForSlug(bootstrap, slug);
  if (farm?.today?.items?.length) return farm.today;
  if (bootstrap?.today?.items?.length && bootstrap.farms?.length === 1) return bootstrap.today;
  return farm?.today ?? null;
}

export function todayItemActionRoute(item: FarmTodayItem): string {
  return String(item.actionRoute || item.action_route || "").trim();
}

export function applyBootstrapToUser(
  user: import("./types").SessionUser,
  bootstrap: FarmBootstrap | null | undefined
): import("./types").SessionUser {
  if (!bootstrap) return user;
  const erpnextAccess =
    typeof bootstrap.erpnext_access === "boolean" ? bootstrap.erpnext_access : user.erpnextAccess;
  return { ...user, erpnextAccess, erpAppRole: bootstrap.role ?? user.erpAppRole };
}
