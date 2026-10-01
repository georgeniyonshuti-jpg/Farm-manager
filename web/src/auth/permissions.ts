import type { ActiveWorkspace, SessionUser, UserRole } from "./types";

const ROLE_ORDER: UserRole[] = [
  "laborer",
  "dispatcher",
  "buyer",
  "procurement_officer",
  "sales_coordinator",
  "vet",
  "vet_manager",
  "investor",
  "manager",
  "company_admin",
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

export function isCompanyAdmin(user: SessionUser | null): boolean {
  return user?.role === "company_admin";
}

/** Company-level operator on farm.cleva.rw (not platform superuser-only). */
export function isCompanyLevelAdmin(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "company_admin" || user.role === "manager" || user.role === "superuser";
}

/** Vet lead or company operator — reviews, payroll, schedule. */
export function isFarmOpsLead(user: SessionUser | null): boolean {
  if (!user) return false;
  return isCompanyLevelAdmin(user) || user.role === "vet_manager";
}

export function canManageUsers(user: SessionUser | null): boolean {
  return isSuperuser(user) || isCompanyAdmin(user);
}

/** Submit vet logs: vet (incl. junior), vet_manager, manager, superuser. */
export function canSubmitVetLog(user: SessionUser | null): boolean {
  if (!user) return false;
  const r = user.role;
  return r === "vet" || r === "vet_manager" || r === "manager" || r === "company_admin" || r === "superuser";
}

/** Approve/reject pending vet logs: vet_manager, manager, company_admin, superuser. */
export function canReviewVetLog(user: SessionUser | null): boolean {
  if (!user) return false;
  const r = user.role;
  return r === "vet_manager" || r === "manager" || r === "company_admin" || r === "superuser";
}

/** Approve/reject pending feed logs: vet_manager, manager, superuser. */
export function canReviewFeedEntry(user: SessionUser | null): boolean {
  return canReviewVetLog(user);
}

/** Junior vet submissions need lead-vet approval; vet_manager+ save as approved. */
export function vetLogNeedsManagerReview(user: SessionUser | null): boolean {
  if (!user || !canSubmitVetLog(user)) return false;
  if (canReviewVetLog(user)) return false;
  return user.role === "vet" && user.departmentKeys.includes("junior_vet");
}

export function isJuniorVet(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "vet" && user.departmentKeys.includes("junior_vet");
}

export type FieldReportingMode = "laborer_rounds" | "vet_only" | "both" | "none";

export function normalizeFieldReportingMode(mode: string | null | undefined): FieldReportingMode {
  const m = String(mode ?? "").trim().toLowerCase();
  if (m === "laborer_rounds" || m === "both" || m === "none") return m;
  return "vet_only";
}

/** Laborer/dispatcher round check-in nav — never for field vets; hidden when vet_only or none. */
export function shouldShowRoundCheckin(
  user: SessionUser | null,
  fieldReportingMode?: string | null
): boolean {
  if (!user) return false;
  // All PWA vets (junior + mapped ERP junior_vet) use scheduled vet visits only.
  if (user.role === "vet") return false;
  if (isJuniorVet(user)) return false;
  const mode = normalizeFieldReportingMode(fieldReportingMode);
  if (mode === "vet_only" || mode === "none") return false;
  return user.role === "laborer" || user.role === "dispatcher";
}

export function isSuperuser(user: SessionUser | null): boolean {
  return user?.role === "superuser";
}

/** Sales matcher only (not superuser) — mobile sales shell, no farm OS. */
export function isPipelineSalesRole(user: SessionUser | null): boolean {
  return user?.role === "sales_coordinator";
}

/** Marketplace buyer — browse / book lots only. */
export function isBuyerRole(user: SessionUser | null): boolean {
  return user?.role === "buyer";
}

/** Market signup seller — pageAccess is only farm_market, no Farm OS. */
export function isMarketOnlySeller(user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role !== "manager" && user.role !== "company_admin") return false;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess.filter(Boolean) : [];
  return access.length > 0 && access.every((key) => key === "farm_market");
}

/** Chocolate market chrome: buyers, market-only sellers, farmers on /market, desk on /market. */
export function usesMarketPartnerShell(user: SessionUser | null, appPath: string): boolean {
  if (!user) return false;
  if (isBuyerRole(user) || isMarketOnlySeller(user)) return true;
  const path = (appPath || "/").replace(/\/+$/, "") || "/";
  const onMarket = path === "/market" || path.startsWith("/market/");
  if (canAccessPipelineDesk(user)) return onMarket;
  return canListFarmerMarketLots(user) && onMarket;
}

/** Pipeline desk: Cleva matcher (sales coordinator + platform superuser). */
export function canAccessPipelineDesk(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "superuser" || user.role === "sales_coordinator";
}

/** Verified farmer tenant operators who can self-list lots. */
export function canListFarmerMarketLots(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.role === "company_admin" || user.role === "manager" || user.role === "superuser";
}

/** Browse live market (buyers + ops). */
export function canBrowseMarket(user: SessionUser | null): boolean {
  if (!user) return false;
  return isBuyerRole(user) || canAccessPipelineDesk(user);
}

/** Vet / manager inventory scout (managed or off-platform lots). */
export function canScoutPipeline(user: SessionUser | null): boolean {
  if (!user) return false;
  const r = user.role;
  return (
    r === "superuser" ||
    r === "sales_coordinator" ||
    r === "vet" ||
    r === "vet_manager" ||
    r === "manager" ||
    r === "company_admin"
  );
}

/** Opt a company flock into the pipeline. */
export function canOptInPipelineFlock(user: SessionUser | null): boolean {
  if (!user) return false;
  const r = user.role;
  return (
    r === "superuser" ||
    r === "sales_coordinator" ||
    r === "manager" ||
    r === "company_admin" ||
    r === "vet_manager"
  );
}

/**
 * Whether `role` is allowed by an explicit roles allow-list.
 * Company admins inherit any page that allows managers (sidebar already does).
 */
export function roleInAllowList(role: UserRole, roles: UserRole[]): boolean {
  if (roles.includes(role)) return true;
  if (role === "company_admin" && roles.includes("manager")) return true;
  return false;
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
  "company_admin",
  "superuser",
];

export function farmFieldOpsNavEligible(user: SessionUser | null): boolean {
  if (!user) return false;
  return FARM_FIELD_OPS_ROLES.includes(user.role);
}

/** Desk/office roles: sidebar IA without field capture items. */
export function isOfficeFarmDesktopRole(user: SessionUser | null): boolean {
  if (!user) return false;
  return (
    user.role === "vet_manager" ||
    user.role === "manager" ||
    user.role === "company_admin" ||
    user.role === "superuser"
  );
}

export type FarmNavItem = { to: string; label: string; end?: boolean };

/**
 * Core farm sidebar links (before clinical/workforce extras).
 * Office roles: procurement sees inventory only; sales/investor see none here (flocks etc. stay in extras).
 */
export function farmCoreNavItems(
  user: SessionUser | null,
  fieldReportingMode?: string | null
): FarmNavItem[] {
  if (!user || !canAccessWorkspace(user, "farm")) return [];
  if (isOfficeFarmDesktopRole(user)) {
    const items: FarmNavItem[] = [];
    items.push({ to: "/farm/inventory", label: "Feed inventory" });
    if (canSubmitVetLog(user)) {
      items.push({ to: "/farm/vet-logs", label: "Vet logs" });
    }
    items.push({ to: "/farm/mortality", label: "Mortality tracking" });
    return items;
  }
  if (farmFieldOpsNavEligible(user)) {
    const items: FarmNavItem[] = [];
    if (shouldShowRoundCheckin(user, fieldReportingMode)) {
      items.push({ to: "/farm/checkin", label: "Round check-in" });
    }
    items.push({ to: "/farm/feed", label: "Feed request / log" });
    items.push({ to: "/farm/mortality-log", label: "Log mortality" });
    items.push({ to: "/farm/inventory", label: "Feed inventory" });
    if (canSubmitVetLog(user)) {
      items.push({ to: "/farm/vet-logs", label: "Vet logs" });
    }
    items.push({ to: "/farm/mortality", label: "Mortality tracking" });
    return items;
  }
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

/** Mirrors server: manager / vet_manager / superuser, or Command Center read roles. */
export function canViewERPNextConnectionStatus(user: SessionUser | null): boolean {
  if (!user) return false;
  if (user.role === "superuser" || user.role === "manager" || user.role === "company_admin" || user.role === "vet_manager") return true;
  if (user.role === "procurement_officer" || user.role === "sales_coordinator") return true;
  return false;
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
  { key: "dashboard_management", label: "Today", prefixes: ["/dashboard/management"] },
  { key: "laborer_earnings", label: "My earnings", prefixes: ["/laborer/earnings"] },
  { key: "farm_checkin", label: "Round check-in", prefixes: ["/farm/checkin"] },
  { key: "farm_feed", label: "Feed log", prefixes: ["/farm/feed"] },
  { key: "farm_mortality_log", label: "Log mortality", prefixes: ["/farm/mortality-log"] },
  { key: "farm_daily_log", label: "Daily logs (legacy)", prefixes: ["/farm/daily-log"] },
  { key: "farm_vet_logs", label: "Vet logs", prefixes: ["/farm/vet-logs"] },
  { key: "farm_mortality", label: "Mortality tracking", prefixes: ["/farm/mortality"] },
  { key: "farm_inventory", label: "Feed inventory", prefixes: ["/farm/inventory"] },
  { key: "farm_flocks", label: "Flocks", prefixes: ["/farm/flocks"] },
  { key: "farm_batch_schedule", label: "Check-in schedule", prefixes: ["/farm/batch-schedule"] },
  { key: "farm_schedule_settings", label: "Schedule settings", prefixes: ["/farm/schedule-settings"] },
  { key: "farm_payroll", label: "Payroll", prefixes: ["/farm/payroll"] },
  { key: "farm_checkin_review", label: "Review check-ins", prefixes: ["/farm/checkin-review"] },
  { key: "farm_treatments", label: "Medicine tracking", prefixes: ["/farm/treatments"] },
  { key: "farm_slaughter", label: "Slaughter & FCR", prefixes: ["/farm/slaughter"] },
  { key: "farm_pipeline", label: "Supply pipeline", prefixes: ["/farm/pipeline"] },
  { key: "farm_market", label: "Broiler market", prefixes: ["/market"] },
  { key: "farm_reports", label: "Reports center", prefixes: ["/farm/reports"] },
  { key: "cleva_portfolio", label: "Portfolio analytics", prefixes: ["/cleva/portfolio"] },
  {
    key: "cleva_business_model",
    label: "Business model analytics (Streamlit)",
    prefixes: ["/cleva/business-model"],
  },
  { key: "cleva_investor_memos", label: "Investor memos", prefixes: ["/cleva/investor-memos"] },
  { key: "cleva_credit_scoring", label: "Credit scoring", prefixes: ["/cleva/credit-scoring"] },
  { key: "admin_system_config", label: "Type settings", prefixes: ["/admin/system-config"] },
  { key: "admin_users", label: "User management", prefixes: ["/admin/users"] },
];
const PAGE_KEYS = new Set(PAGE_ACCESS_DEFS.map((d) => d.key));

export function canAccessPageByKey(user: SessionUser | null, key: string): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  // Company admin is the tenant sovereign for company-scoped pages (incl. Reports).
  if (isCompanyAdmin(user)) return true;
  if (!PAGE_KEYS.has(key)) return true;
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : [];
  if (access.length === 0) return true;
  if (access.includes(key)) return true;
  // Legacy pageAccess snapshots predate farm_market; pipeline desk ops need market routes.
  if (key === "farm_market") {
    if (user.role === "sales_coordinator") return true;
    if (access.includes("farm_pipeline")) return true;
  }
  return false;
}

export function canAccessPathByPageVisibility(user: SessionUser | null, path: string): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  const appPath = path.replace(/^\/app\/[^/]+/, "") || "/";
  const match = PAGE_ACCESS_DEFS.find((d) => d.prefixes.some((p) => appPath.startsWith(p)));
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
  "mortality.record": "laborer",
  "slaughter.schedule": "vet_manager",
  "slaughter.record": "vet_manager",
  "flock.close": "vet_manager",
  "alert.acknowledge": "vet_manager",
};

export function canFlockAction(user: SessionUser | null, action: FlockActionKey): boolean {
  if (!user) return false;
  if (!canAccessWorkspace(user, "farm")) return false;
  if (user.role === "superuser") return true;
  // Coordinators sell via pipeline lots — no flock OS browse/ops.
  if (isPipelineSalesRole(user)) return false;
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
