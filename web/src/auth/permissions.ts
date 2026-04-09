import type { ActiveWorkspace, SessionUser, UserRole } from "./types";

const ROLE_ORDER: UserRole[] = [
  "laborer",
  "dispatcher",
  "procurement_officer",
  "sales_coordinator",
  "vet",
  "vet_manager",
  "investor",
  "manager",
  "superuser",
];

export function roleAtLeast(user: SessionUser | null, minRole: UserRole): boolean {
  if (!user) return false;
  if (user.role === "superuser") return true;
  const u = ROLE_ORDER.indexOf(user.role);
  const m = ROLE_ORDER.indexOf(minRole);
  if (u < 0 || m < 0) return false;
  return u >= m;
}

export function isSuperuser(user: SessionUser | null): boolean {
  return user?.role === "superuser";
}

export function canAccessWorkspace(user: SessionUser | null, workspace: ActiveWorkspace): boolean {
  if (!user) return false;
  const a = user.businessUnitAccess;
  if (a === "both") return true;
  return a === workspace;
}

/** Roles that may use field-ops farm routes (check-in, mortality log, daily log, mortality table). */
export const FARM_FIELD_OPS_ROLES: UserRole[] = [
  "laborer",
  "dispatcher",
  "vet",
  "vet_manager",
  "manager",
  "superuser",
];

export function farmFieldOpsNavEligible(user: SessionUser | null): boolean {
  if (!user) return false;
  return FARM_FIELD_OPS_ROLES.includes(user.role);
}

export type FarmNavItem = { to: string; label: string; end?: boolean };

const FARM_CORE_FULL: FarmNavItem[] = [
  { to: "/farm/checkin", label: "Round check-in" },
  { to: "/farm/feed", label: "Feed log" },
  { to: "/farm/mortality-log", label: "Log mortality" },
  { to: "/farm/daily-log", label: "Daily logs" },
  { to: "/farm/mortality", label: "Mortality tracking" },
  { to: "/farm/inventory", label: "Feed inventory" },
];

/**
 * Core farm sidebar links (before clinical/workforce extras).
 * Office roles: procurement sees inventory only; sales/investor see none here (flocks etc. stay in extras).
 */
export function farmCoreNavItems(user: SessionUser | null): FarmNavItem[] {
  if (!user || !canAccessWorkspace(user, "farm")) return [];
  if (farmFieldOpsNavEligible(user)) return [...FARM_CORE_FULL];
  if (user.role === "procurement_officer") return [{ to: "/farm/inventory", label: "Feed inventory" }];
  return [];
}

/** Effective workspace: null if user has no access */
export function defaultWorkspaceForUser(user: SessionUser | null): ActiveWorkspace | null {
  if (!user) return null;
  if (user.businessUnitAccess === "farm") return "farm";
  if (user.businessUnitAccess === "clevacredit") return "clevacredit";
  return "farm";
}

export function canViewClevaSensitive(user: SessionUser | null): boolean {
  if (!user) return false;
  if (!canAccessWorkspace(user, "clevacredit")) return false;
  return user.canViewSensitiveFinancial;
}

export function canAccessRouteLaborerBlock(user: SessionUser | null, path: string): boolean {
  if (!user) return false;
  if (user.role === "laborer" || user.role === "dispatcher") {
    const blocked = ["/admin", "/clevacredit/investor-memos", "/clevacredit/credit-scoring"];
    if (blocked.some((p) => path.startsWith(p))) return false;
  }
  return true;
}

export type PermissionKey =
  | "view_net_profit"
  | "view_bank_balances"
  | "view_investor_memos"
  | "manage_users";

export const PAGE_ACCESS_DEFS: Array<{ key: string; label: string; prefixes: string[] }> = [
  { key: "dashboard_laborer", label: "Action center", prefixes: ["/dashboard/laborer"] },
  { key: "dashboard_vet", label: "Vet home", prefixes: ["/dashboard/vet"] },
  { key: "dashboard_management", label: "Command center", prefixes: ["/dashboard/management"] },
  { key: "laborer_earnings", label: "My earnings", prefixes: ["/laborer/earnings"] },
  { key: "farm_checkin", label: "Round check-in", prefixes: ["/farm/checkin"] },
  { key: "farm_feed", label: "Feed log", prefixes: ["/farm/feed"] },
  { key: "farm_mortality_log", label: "Log mortality", prefixes: ["/farm/mortality-log"] },
  { key: "farm_daily_log", label: "Daily logs", prefixes: ["/farm/daily-log"] },
  { key: "farm_mortality", label: "Mortality tracking", prefixes: ["/farm/mortality"] },
  { key: "farm_inventory", label: "Feed inventory", prefixes: ["/farm/inventory"] },
  { key: "farm_flocks", label: "Flocks", prefixes: ["/farm/flocks", "/farm/fcr"] },
  { key: "farm_batch_schedule", label: "Check-in schedule", prefixes: ["/farm/batch-schedule"] },
  { key: "farm_schedule_settings", label: "Schedule settings", prefixes: ["/farm/schedule-settings"] },
  { key: "farm_payroll", label: "Payroll", prefixes: ["/farm/payroll"] },
  { key: "farm_treatments", label: "Medicine tracking", prefixes: ["/farm/treatments"] },
  { key: "farm_slaughter", label: "Slaughter & FCR", prefixes: ["/farm/slaughter"] },
  { key: "cleva_portfolio", label: "Portfolio analytics", prefixes: ["/cleva/portfolio"] },
  { key: "cleva_investor_memos", label: "Investor memos", prefixes: ["/cleva/investor-memos"] },
  { key: "cleva_credit_scoring", label: "Credit scoring", prefixes: ["/cleva/credit-scoring"] },
  { key: "admin_system_config", label: "Type settings", prefixes: ["/admin/system-config"] },
  { key: "admin_users", label: "User management", prefixes: ["/admin/users"] },
];
const PAGE_KEYS = new Set(PAGE_ACCESS_DEFS.map((d) => d.key));

export function canAccessPageByKey(user: SessionUser | null, key: string): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  if (!PAGE_KEYS.has(key)) return true;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : [];
  if (access.length === 0) return true;
  return access.includes(key);
}

export function canAccessPathByPageVisibility(user: SessionUser | null, path: string): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  const match = PAGE_ACCESS_DEFS.find((d) => d.prefixes.some((p) => path.startsWith(p)));
  if (!match) return true;
  return canAccessPageByKey(user, match.key);
}

export type FlockActionKey =
  | "flock.view"
  | "flock.create"
  | "treatment.execute"
  | "weighin.record"
  | "mortality.record"
  | "slaughter.schedule"
  | "slaughter.record"
  | "flock.close"
  | "alert.acknowledge";

const FLOCK_ACTION_MIN_ROLE: Record<FlockActionKey, UserRole> = {
  "flock.view": "laborer",
  "flock.create": "vet_manager",
  "treatment.execute": "vet",
  "weighin.record": "vet",
  "mortality.record": "vet",
  "slaughter.schedule": "vet_manager",
  "slaughter.record": "vet_manager",
  "flock.close": "vet_manager",
  "alert.acknowledge": "vet_manager",
};

export function canFlockAction(user: SessionUser | null, action: FlockActionKey): boolean {
  if (!user) return false;
  if (!canAccessWorkspace(user, "farm")) return false;
  if (user.role === "superuser") return true;
  return roleAtLeast(user, FLOCK_ACTION_MIN_ROLE[action]);
}

export type ActionPresentationMode = "enabled" | "disabled_with_reason" | "hidden";
export type ActionPresentation = { mode: ActionPresentationMode; reason?: string };

const ACTION_REASON: Record<FlockActionKey, string> = {
  "flock.view": "Requires farm access.",
  "flock.create": "Requires vet manager, manager, or superuser.",
  "treatment.execute": "Requires vet or higher.",
  "weighin.record": "Requires vet or higher.",
  "mortality.record": "Requires vet or higher.",
  "slaughter.schedule": "Requires vet manager, manager, or superuser.",
  "slaughter.record": "Requires vet manager, manager, or superuser.",
  "flock.close": "Requires vet manager, manager, or superuser.",
  "alert.acknowledge": "Requires vet manager, manager, or superuser.",
};

export function flockActionPresentation(
  user: SessionUser | null,
  action: FlockActionKey,
  options?: { allowDisabledContext?: boolean }
): ActionPresentation {
  const allowed = canFlockAction(user, action);
  if (allowed) return { mode: "enabled" };
  if (options?.allowDisabledContext) {
    return { mode: "disabled_with_reason", reason: ACTION_REASON[action] };
  }
  return { mode: "hidden" };
}

export function hasPermission(user: SessionUser | null, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "superuser") return true;

  switch (key) {
    case "manage_users":
      return false;
    case "view_net_profit":
      if (user.role === "investor") return canAccessWorkspace(user, "clevacredit");
      if (!user.canViewSensitiveFinancial) return false;
      return roleAtLeast(user, "manager");
    case "view_bank_balances":
      if (!user.canViewSensitiveFinancial) return false;
      return roleAtLeast(user, "manager");
    case "view_investor_memos":
      if (!canAccessWorkspace(user, "clevacredit")) return false;
      if (user.role === "investor") return true;
      return user.canViewSensitiveFinancial && roleAtLeast(user, "manager");
    default:
      return false;
  }
}
