import { NavLink, Link } from "react-router-dom";
import { useMemo, type ReactNode } from "react";
import {
  Home,
  ClipboardCheck,
  Wheat,
  Skull,
  NotebookPen,
  Stethoscope,
  Pill,
  Package,
  Drumstick,
  Bird,
  CalendarCog,
  Wallet,
  CircleDollarSign,
  FileCheck2,
  Plug,
  ExternalLink,
  BarChart3,
  PieChart,
  Landmark,
  HandCoins,
  FileText,
  Gauge,
  Users,
  Shield,
  Settings2,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, SessionUser } from "../../auth/types";
import { canAccessPageByKey, canAccessWorkspace, canFlockAction, canManageUsers, farmCoreNavItems, hasPermission } from "../../auth/permissions";
import { canEditFlockScheduleRole } from "../../farm/scheduleAccess";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { BrandLogo } from "../BrandLogo";
import { useTenant } from "../../context/TenantContext";

function NavText({ text }: { text: string }) {
  const t = useLaborerT(text);
  return <>{t}</>;
}

type NavItem = { to: string; label: string; end?: boolean };
type Props = { onNavigate?: () => void; collapsed?: boolean };

const ICON_CLS = "mgr-nav-icon h-4 w-4 shrink-0";

const PATH_ICONS: Record<string, ReactNode> = {
  "/dashboard/management": <LayoutDashboard className={ICON_CLS} aria-hidden />,
  "/dashboard/laborer": <Home className={ICON_CLS} aria-hidden />,
  "/dashboard/vet": <Stethoscope className={ICON_CLS} aria-hidden />,
  "/farm/checkin": <ClipboardCheck className={ICON_CLS} aria-hidden />,
  "/farm/feed": <Wheat className={ICON_CLS} aria-hidden />,
  "/farm/mortality-log": <Skull className={ICON_CLS} aria-hidden />,
  "/farm/daily-log": <NotebookPen className={ICON_CLS} aria-hidden />,
  "/farm/batch-schedule": <CalendarCog className={ICON_CLS} aria-hidden />,
  "/farm/checkin-review": <FileCheck2 className={ICON_CLS} aria-hidden />,
  "/farm/mortality": <Skull className={ICON_CLS} aria-hidden />,
  "/farm/vet-logs": <Stethoscope className={ICON_CLS} aria-hidden />,
  "/farm/treatments": <Pill className={ICON_CLS} aria-hidden />,
  "/farm/inventory": <Package className={ICON_CLS} aria-hidden />,
  "/farm/slaughter": <Drumstick className={ICON_CLS} aria-hidden />,
  "/farm/flocks": <Bird className={ICON_CLS} aria-hidden />,
  "/farm/schedule-settings": <CalendarCog className={ICON_CLS} aria-hidden />,
  "/farm/payroll": <Wallet className={ICON_CLS} aria-hidden />,
  "/laborer/earnings": <CircleDollarSign className={ICON_CLS} aria-hidden />,
  "/farm/accounting-approvals": <FileCheck2 className={ICON_CLS} aria-hidden />,
  "/farm/erpnext-setup": <Plug className={ICON_CLS} aria-hidden />,
  "/farm/erpnext": <ExternalLink className={ICON_CLS} aria-hidden />,
  "/farm/odoo-setup": <Plug className={ICON_CLS} aria-hidden />,
  "/farm/reports": <BarChart3 className={ICON_CLS} aria-hidden />,
  "/cleva/portfolio": <PieChart className={ICON_CLS} aria-hidden />,
  "/cleva/business-model": <Landmark className={ICON_CLS} aria-hidden />,
  "/cleva/general-lending": <HandCoins className={ICON_CLS} aria-hidden />,
  "/cleva/investor-memos": <FileText className={ICON_CLS} aria-hidden />,
  "/cleva/credit-scoring": <Gauge className={ICON_CLS} aria-hidden />,
  "/admin/users": <Users className={ICON_CLS} aria-hidden />,
  "/admin/super": <Shield className={ICON_CLS} aria-hidden />,
  "/admin/system-config": <Settings2 className={ICON_CLS} aria-hidden />,
};

function iconForPath(to: string): ReactNode {
  return PATH_ICONS[to] ?? <Home className={ICON_CLS} aria-hidden />;
}

const CLEVA_NAV: NavItem[] = [
  { to: "/cleva/portfolio", label: "Portfolio analytics", end: true },
  { to: "/cleva/business-model", label: "Business model" },
  { to: "/cleva/general-lending", label: "General lending" },
  { to: "/cleva/investor-memos", label: "Investor memos" },
  { to: "/cleva/credit-scoring", label: "Credit scoring" },
];

export function SidebarNav({ onNavigate, collapsed = false }: Props) {
  const { activeWorkspace, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const farmSectionTitle = useLaborerT("Farm operations");
  const clevaSectionTitle = useLaborerT("Clevafarm Finance");

  if (!user || !activeWorkspace) return null;

  return (
    <SidebarNavBody
      user={user}
      activeWorkspace={activeWorkspace}
      companyHref={companyHref}
      farmSectionTitle={farmSectionTitle}
      clevaSectionTitle={clevaSectionTitle}
      onNavigate={onNavigate}
      collapsed={collapsed}
    />
  );
}

type SidebarNavBodyProps = Props & {
  user: SessionUser;
  activeWorkspace: ActiveWorkspace;
  companyHref: (path: string) => string;
  farmSectionTitle: string;
  clevaSectionTitle: string;
};

function SidebarNavBody({
  user,
  activeWorkspace,
  companyHref,
  farmSectionTitle,
  clevaSectionTitle,
  onNavigate,
  collapsed = false,
}: SidebarNavBodyProps) {
  const { logout, setActiveWorkspace } = useAuth();
  const { tenantCompany } = useTenant();
  const { can, erpnextAccess, hasBootstrap } = useFarmCapabilities();
  const href = (path: string) => companyHref(path);
  const signOut = useLaborerT("Sign out");
  const appName = useLaborerT("Clevafarm");
  const farmWorkspace = useLaborerT("Farm / Poultry");
  const clevaWorkspace = useLaborerT("Clevafarm Finance");
  const switchWorkspaceAria = useLaborerT("Switch active business unit");

  const clevaNav = CLEVA_NAV.filter((item) => {
    if (item.to !== "/cleva/investor-memos") return true;
    return (
      user.role === "superuser" ||
      user.departmentKeys.includes("investor_memo") ||
      hasPermission(user, "view_investor_memos")
    );
  });
  const canSee = (key: string) => canAccessPageByKey(user, key);

  const scheduleItem: NavItem | null =
    activeWorkspace === "farm" && user && canEditFlockScheduleRole(user.role)
      && canSee("farm_batch_schedule")
      ? { to: "/farm/batch-schedule", label: "Check-in schedule" }
      : null;

  const flocksItem: NavItem | null =
    activeWorkspace === "farm" &&
    user &&
    canFlockAction(user, "flock.view") &&
    canSee("farm_flocks")
      ? { to: "/farm/flocks", label: "Flocks" }
      : null;

  const logPayrollItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "vet_manager" || user.role === "superuser") &&
    canSee("farm_schedule_settings")
      ? { to: "/farm/schedule-settings", label: "Schedule settings" }
      : null;

  const checkinReviewNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "vet_manager" || user.role === "superuser") &&
    canSee("farm_checkin_review") &&
    (!hasBootstrap || can("review_queue"))
      ? { to: "/farm/checkin-review", label: "Review check-ins" }
      : null;

  const payrollNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "vet_manager" || user.role === "superuser") &&
    canSee("farm_payroll")
      ? { to: "/farm/payroll", label: "Payroll" }
      : null;
  const treatmentNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    canFlockAction(user, "treatment.execute") &&
    canSee("farm_treatments") &&
    (!hasBootstrap || can("treatment_rounds"))
      ? { to: "/farm/treatments", label: "Medicine tracking" }
      : null;
  const slaughterNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    canFlockAction(user, "slaughter.schedule") &&
    canSee("farm_slaughter") &&
    (!hasBootstrap || can("slaughter"))
      ? { to: "/farm/slaughter", label: "Slaughter & FCR" }
      : null;
  const laborerEarningsItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "laborer" ||
      user.role === "dispatcher" ||
      user.role === "vet" ||
      user.departmentKeys.includes("junior_vet")) &&
      canSee("laborer_earnings")
      ? { to: "/laborer/earnings", label: "My earnings" }
      : null;

  const accountingApprovalsNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    erpnextAccess &&
    (user.role === "manager" || user.role === "superuser")
      ? { to: "/farm/accounting-approvals", label: "Accounting approvals" }
      : null;

  const erpnextSetupNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    erpnextAccess &&
    (user.role === "manager" || user.role === "superuser")
      ? { to: "/farm/erpnext-setup", label: "ERPNext integration" }
      : null;
  const erpnextDeskNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    erpnextAccess &&
    (user.role === "manager" || user.role === "superuser")
      ? { to: "/farm/erpnext", label: "ERPNext desk" }
      : null;
  const reportsCenterNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "vet" || user.role === "vet_manager" || user.role === "manager" || user.role === "superuser") &&
    canSee("farm_reports")
      ? { to: "/farm/reports", label: "Reports center" }
      : null;

  const farmExtras = [
    laborerEarningsItem,
    flocksItem,
    scheduleItem,
    logPayrollItem,
    checkinReviewNavItem,
    payrollNavItem,
    treatmentNavItem,
    slaughterNavItem,
    accountingApprovalsNavItem,
    erpnextSetupNavItem,
    erpnextDeskNavItem,
    reportsCenterNavItem,
  ].filter(Boolean) as NavItem[];
  const farmCore = farmCoreNavItems(user).filter((item) => {
    const byPath: Record<string, string> = {
      "/farm/checkin": "farm_checkin",
      "/farm/feed": "farm_feed",
      "/farm/mortality-log": "farm_mortality_log",
      "/farm/daily-log": "farm_daily_log",
      "/farm/vet-logs": "farm_vet_logs",
      "/farm/mortality": "farm_mortality",
      "/farm/inventory": "farm_inventory",
    };
    const capByPath: Partial<Record<string, Parameters<typeof can>[0]>> = {
      "/farm/checkin": "checkin",
      "/farm/feed": "feed_log",
      "/farm/mortality-log": "mortality",
      "/farm/mortality": "mortality",
      "/farm/vet-logs": "vet_log_create",
      "/farm/inventory": "medicine_stock",
    };
    const k = byPath[item.to];
    const cap = capByPath[item.to];
    if (hasBootstrap && cap && !can(cap)) return false;
    return k ? canSee(k) : true;
  });
  const farmNav = [...farmCore, ...farmExtras];
  const nav = activeWorkspace === "farm" ? farmNav : clevaNav.filter((item) => {
    if (item.to === "/cleva/portfolio") return canSee("cleva_portfolio");
    if (item.to === "/cleva/business-model") return canSee("cleva_business_model");
    if (item.to === "/cleva/general-lending") return canSee("cleva_business_model");
    if (item.to === "/cleva/investor-memos") return canSee("cleva_investor_memos");
    if (item.to === "/cleva/credit-scoring") return canSee("cleva_credit_scoring");
    return true;
  });

  const dashLink =
    user.role === "laborer" || user.role === "dispatcher"
      ? { to: "/dashboard/laborer", label: "Action center" }
      : user.role === "vet" || user.role === "vet_manager"
        ? { to: "/dashboard/vet", label: "Vet home" }
        : { to: "/dashboard/management", label: "Command center" };
  const effectiveDashLink =
    dashLink.to === "/dashboard/laborer" && !canSee("dashboard_laborer")
      ? null
      : dashLink.to === "/dashboard/vet" && !canSee("dashboard_vet")
        ? null
        : dashLink.to === "/dashboard/management" && !canSee("dashboard_management")
          ? null
          : dashLink;

  const adminLink =
    canManageUsers(user) && canSee("admin_users") ? { to: "/admin/users", label: "User management" } : null;
  const superAdminLink =
    user.role === "superuser" ? { to: "/admin/super", label: "Super admin" } : null;
  const typeLink =
    user.role === "vet_manager" || user.role === "manager" || user.role === "company_admin" || user.role === "superuser"
      ? (canSee("admin_system_config") ? { to: "/admin/system-config", label: "Type settings" } : null)
      : null;

  const adminItems = [adminLink, superAdminLink, typeLink].filter(Boolean) as NavItem[];

  const groupedFarmNav = useMemo(() => {
    const byPath = new Map(farmNav.map((item) => [item.to, item]));
    const pick = (paths: string[]) => paths.map((p) => byPath.get(p)).filter(Boolean) as NavItem[];

    return {
      overview: effectiveDashLink ? [effectiveDashLink] : [],
      operations: pick([
        "/farm/checkin",
        "/farm/feed",
        "/farm/mortality-log",
        "/farm/daily-log",
        "/farm/batch-schedule",
        "/farm/checkin-review",
      ]),
      health: pick(["/farm/mortality", "/farm/vet-logs", "/farm/treatments"]),
      inventory: pick(["/farm/inventory", "/farm/slaughter"]),
      planning_workforce: pick([
        "/farm/flocks",
        "/farm/schedule-settings",
        "/farm/payroll",
        "/laborer/earnings",
      ]),
      finance: pick([
        "/farm/accounting-approvals",
        "/farm/erpnext-setup",
        "/farm/erpnext",
        "/farm/odoo-setup",
        "/farm/reports",
      ]),
    };
  }, [farmNav, effectiveDashLink]);

  const compactPrimary = (() => {
    const base =
      activeWorkspace === "farm"
        ? [
            ...groupedFarmNav.overview,
            ...groupedFarmNav.operations,
            ...groupedFarmNav.health,
            ...groupedFarmNav.inventory,
            ...groupedFarmNav.planning_workforce,
            ...groupedFarmNav.finance,
          ]
        : nav;
    const seen = new Set<string>();
    return base.filter((i) => {
      if (seen.has(i.to)) return false;
      seen.add(i.to);
      return true;
    });
  })();

  function MgrLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
    return (
      <NavLink
        to={href(item.to)}
        end={item.end}
        onClick={onNavigate}
        title={compact ? item.label : undefined}
        className={({ isActive }) =>
          `mgr-nav-link ${compact ? "mgr-nav-link--compact" : ""} ${isActive ? "active" : ""}`
        }
      >
        {iconForPath(item.to)}
        {compact ? (
          <span className="sr-only">{item.label}</span>
        ) : (
          <span className="mgr-nav-link-label truncate">
            <NavText text={item.label} />
          </span>
        )}
      </NavLink>
    );
  }

  function GroupSection({ title, items }: { title: string; items: NavItem[] }) {
    if (!items.length) return null;
    return (
      <div className="mgr-nav-group">
        <p className="mgr-nav-label">{title}</p>
        <div className="mgr-nav-group__items">
          {items.map((item) => (
            <MgrLink key={item.to} item={item} />
          ))}
        </div>
      </div>
    );
  }

  const showWorkspaceSwitch = user.businessUnitAccess === "both";
  const workspaceLabel =
    activeWorkspace === "farm" ? farmSectionTitle : clevaSectionTitle;
  const companyLabel = tenantCompany?.name ?? user.companyName ?? appName;

  const footerBlock = (
    <div className={`mgr-sidebar-footer ${collapsed ? "mgr-sidebar-footer--collapsed" : ""}`}>
      {adminItems.length > 0 ? (
        <div className="mgr-nav-group">
          {!collapsed ? <p className="mgr-nav-label">Admin</p> : null}
          <div className="mgr-nav-group__items">
            {adminItems.map((item) => (
              <MgrLink key={item.to} item={item} compact={collapsed} />
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`mgr-nav-link w-full ${collapsed ? "mgr-nav-link--compact" : ""}`}
        title={collapsed ? signOut : undefined}
        onClick={() => {
          onNavigate?.();
          void logout();
        }}
      >
        <LogOut className={ICON_CLS} aria-hidden />
        {collapsed ? (
          <span className="sr-only">{signOut}</span>
        ) : (
          <span className="mgr-nav-link-label truncate">{signOut}</span>
        )}
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col text-white">
      {!collapsed ? (
        <div className="border-b border-white/10 px-3.5 pb-3.5 pt-5">
          <Link
            to={user.companySlug ? companyHref("") : "/"}
            onClick={onNavigate}
            className="mgr-sidebar-brand inline-flex min-h-10 w-full items-center gap-2.5"
          >
            {/* Solid white plate — green mark vanishes on the green sidebar otherwise */}
            <span className="mgr-sidebar-logo-plate inline-flex size-9 shrink-0 items-center justify-center">
              <BrandLogo size={30} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mgr-brand-name block truncate text-[15px] leading-tight">
                {companyLabel}
              </span>
              {!showWorkspaceSwitch ? (
                <span className="mt-0.5 block truncate text-[10px] font-medium tracking-wide text-white/55">
                  {workspaceLabel}
                </span>
              ) : null}
            </span>
          </Link>
          {showWorkspaceSwitch ? (
            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-white/40">
                Workspace
              </span>
              <select
                className="mgr-sidebar-select"
                value={activeWorkspace ?? "farm"}
                aria-label={switchWorkspaceAria}
                onChange={(e) => setActiveWorkspace(e.target.value as ActiveWorkspace)}
              >
                <option value="farm" disabled={!canAccessWorkspace(user, "farm")}>
                  {farmWorkspace}
                </option>
                <option value="clevacredit" disabled={!canAccessWorkspace(user, "clevacredit")}>
                  {clevaWorkspace}
                </option>
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <div className="flex justify-center border-b border-white/10 px-2 py-4">
          <Link
            to={user.companySlug ? companyHref("") : "/"}
            onClick={onNavigate}
            className="mgr-sidebar-logo-plate inline-flex size-10 items-center justify-center"
            aria-label={appName}
          >
            <BrandLogo size={32} />
          </Link>
        </div>
      )}

      <nav className={`mgr-sidebar-nav flex-1 overflow-y-auto ${collapsed ? "mgr-sidebar-nav--collapsed" : ""}`}>
        {collapsed ? (
          <div className="mgr-nav-group__items">
            {compactPrimary.map((item) => (
              <MgrLink key={item.to} item={item} compact />
            ))}
          </div>
        ) : activeWorkspace === "farm" ? (
          <>
            <GroupSection title="Overview" items={groupedFarmNav.overview} />
            <GroupSection title="Operations" items={groupedFarmNav.operations} />
            <GroupSection title="Health" items={groupedFarmNav.health} />
            <GroupSection title="Inventory" items={groupedFarmNav.inventory} />
            <GroupSection title="Planning" items={groupedFarmNav.planning_workforce} />
            <GroupSection title="Finance" items={groupedFarmNav.finance} />
          </>
        ) : (
          <div className="mgr-nav-group">
            <p className="mgr-nav-label">{clevaSectionTitle}</p>
            <div className="mgr-nav-group__items">
              {nav.map((item) => (
                <MgrLink key={item.to} item={item} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {footerBlock}
    </div>
  );
}
