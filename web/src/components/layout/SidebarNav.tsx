import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  MessageSquare,
  Users,
  Shield,
  Settings2,
  LogOut,
  LayoutDashboard,
  Truck,
  TrendingUp,
  ChevronDown,
  Store,
  Flame,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, SessionUser } from "../../auth/types";
import {
  canAccessPageByKey,
  canAccessPipelineDesk,
  canWorkRecruitment,
  canFlockAction,
  canManageUsers,
  canScoutPipeline,
  farmCoreNavItems,
  hasPermission,
  isCompanyLevelAdmin,
  isFarmOpsLead,
  isMarketDeskPath,
  isOfficeFarmDesktopRole,
  isPipelineSalesRole,
  workspacesForUser,
} from "../../auth/permissions";
import { canEditFlockScheduleRole } from "../../farm/scheduleAccess";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { stripTenantPrefix } from "../../lib/tenancy";

function NavText({ text }: { text: string }) {
  const t = useLaborerT(text);
  return <>{t}</>;
}

type NavItem = { to: string; label: string; end?: boolean };
type Props = { onNavigate?: () => void; collapsed?: boolean };

const ICON_CLS = "mgr-nav-icon h-4 w-4 shrink-0";

const PATH_ICONS: Record<string, ReactNode> = {
  "/dashboard/management": <LayoutDashboard className={ICON_CLS} aria-hidden />,
  "/dashboard/market": <BarChart3 className={ICON_CLS} aria-hidden />,
  "/dashboard/market/trends": <TrendingUp className={ICON_CLS} aria-hidden />,
  "/dashboard/market/recruitment": <Users className={ICON_CLS} aria-hidden />,
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
  "/farm/pipeline": <Truck className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/people": <Users className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/flocks": <Bird className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/shop": <Store className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/bigchix": <Flame className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/buyers": <Users className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/scout": <Truck className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/sellers": <Users className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/weigh": <ClipboardCheck className={ICON_CLS} aria-hidden />,
  "/market/listings": <Package className={ICON_CLS} aria-hidden />,
  "/market/jobs": <ClipboardCheck className={ICON_CLS} aria-hidden />,
  "/market/commissions": <Wallet className={ICON_CLS} aria-hidden />,
  "/farm/flocks": <Bird className={ICON_CLS} aria-hidden />,
  "/farm/schedule-settings": <CalendarCog className={ICON_CLS} aria-hidden />,
  "/farm/payroll": <Wallet className={ICON_CLS} aria-hidden />,
  "/laborer/earnings": <CircleDollarSign className={ICON_CLS} aria-hidden />,
  "/farm/erpnext-setup": <Plug className={ICON_CLS} aria-hidden />,
  "/farm/erpnext": <ExternalLink className={ICON_CLS} aria-hidden />,
  "/farm/reports": <BarChart3 className={ICON_CLS} aria-hidden />,
  "/cleva/portfolio": <PieChart className={ICON_CLS} aria-hidden />,
  "/cleva/business-model": <Landmark className={ICON_CLS} aria-hidden />,
  "/cleva/general-lending": <HandCoins className={ICON_CLS} aria-hidden />,
  "/cleva/investor-memos": <FileText className={ICON_CLS} aria-hidden />,
  "/cleva/credit-scoring": <Gauge className={ICON_CLS} aria-hidden />,
  "/farm/pipeline/messages": <MessageSquare className={ICON_CLS} aria-hidden />,
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

type NavGroup = { title?: string; items: NavItem[]; alwaysLabel?: boolean };

function workspaceForAppPath(appPath: string): ActiveWorkspace {
  if (appPath.startsWith("/cleva")) return "clevacredit";
  if (
    appPath.startsWith("/dashboard/market") ||
    appPath.startsWith("/market") ||
    isMarketDeskPath(appPath)
  ) {
    return "market";
  }
  return "farm";
}

function dedupeNav(items: NavItem[]): NavItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.to)) return false;
    seen.add(item.to);
    return true;
  });
}

function SectionGlyph({ id }: { id: ActiveWorkspace }) {
  const cls = "h-4 w-4 shrink-0 text-white/70";
  if (id === "market") return <BarChart3 className={cls} aria-hidden />;
  if (id === "clevacredit") return <Landmark className={cls} aria-hidden />;
  return <Wheat className={cls} aria-hidden />;
}

export function SidebarNav({ onNavigate, collapsed = false }: Props) {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const farmSectionTitle = useLaborerT("Farm operations");
  const marketSectionTitle = useLaborerT("Market");
  const clevaSectionTitle = useLaborerT("Clevafarm Finance");

  if (!user) return null;

  return (
    <SidebarNavBody
      user={user}
      companyHref={companyHref}
      farmSectionTitle={farmSectionTitle}
      marketSectionTitle={marketSectionTitle}
      clevaSectionTitle={clevaSectionTitle}
      onNavigate={onNavigate}
      collapsed={collapsed}
    />
  );
}

type SidebarNavBodyProps = Props & {
  user: SessionUser;
  companyHref: (path: string) => string;
  farmSectionTitle: string;
  marketSectionTitle: string;
  clevaSectionTitle: string;
};

function SidebarNavBody({
  user,
  companyHref,
  farmSectionTitle,
  marketSectionTitle,
  clevaSectionTitle,
  onNavigate,
  collapsed = false,
}: SidebarNavBodyProps) {
  const { logout, setActiveWorkspace } = useAuth();
  const location = useLocation();
  const { can, erpnextAccess, hasBootstrap, fieldReportingMode } = useFarmCapabilities();
  const workspaces = workspacesForUser(user);
  const hasFarm = workspaces.includes("farm");
  const hasMarket = workspaces.includes("market");
  const href = (path: string) => companyHref(path);
  const signOut = useLaborerT("Sign out");
  const appPath = stripTenantPrefix(location.pathname);
  const routeWorkspace = workspaceForAppPath(appPath);
  const [openSections, setOpenSections] = useState<ActiveWorkspace[] | null>(null);

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
    hasFarm && user && canEditFlockScheduleRole(user.role)
      && canSee("farm_batch_schedule")
      ? { to: "/farm/batch-schedule", label: "Check-in schedule" }
      : null;

  const flocksItem: NavItem | null =
    hasFarm &&
    user &&
    canFlockAction(user, "flock.view") &&
    canSee("farm_flocks")
      ? { to: "/farm/flocks", label: "Flocks" }
      : null;

  const logPayrollItem: NavItem | null =
    hasFarm &&
    isFarmOpsLead(user) &&
    canSee("farm_schedule_settings")
      ? { to: "/farm/schedule-settings", label: "Schedule settings" }
      : null;

  const checkinReviewNavItem: NavItem | null =
    hasFarm &&
    isFarmOpsLead(user) &&
    canSee("farm_checkin_review") &&
    (!hasBootstrap || can("review_queue"))
      ? { to: "/farm/checkin-review", label: "Review check-ins" }
      : null;

  const payrollNavItem: NavItem | null =
    hasFarm &&
    isFarmOpsLead(user) &&
    canSee("farm_payroll")
      ? { to: "/farm/payroll", label: "Payroll" }
      : null;
  const treatmentNavItem: NavItem | null =
    hasFarm &&
    canFlockAction(user, "treatment.execute") &&
    canSee("farm_treatments") &&
    (!hasBootstrap || can("treatment_rounds"))
      ? { to: "/farm/treatments", label: isOfficeFarmDesktopRole(user) ? "Medicine" : "Medicine tracking" }
      : null;
  const slaughterNavItem: NavItem | null =
    hasFarm &&
    canFlockAction(user, "slaughter.schedule") &&
    canSee("farm_slaughter") &&
    (!hasBootstrap || can("slaughter"))
      ? { to: "/farm/slaughter", label: isOfficeFarmDesktopRole(user) ? "Slaughter" : "Slaughter & FCR" }
      : null;
  const pipelineDeskNavItem: NavItem | null = null;
  const peopleNavItem: NavItem | null =
    hasMarket && canWorkRecruitment(user) && canSee("farm_pipeline")
      ? { to: "/farm/pipeline/people", label: "People" }
      : null;
  const flocksNavItem: NavItem | null =
    hasMarket && canWorkRecruitment(user) && canSee("farm_pipeline")
      ? { to: "/farm/pipeline/flocks", label: "Flocks" }
      : null;
  const shopNavItem: NavItem | null =
    hasMarket && canAccessPipelineDesk(user) && canSee("farm_pipeline")
      ? { to: "/farm/pipeline/shop", label: "Shop" }
      : null;
  const bigchixNavItem: NavItem | null = shopNavItem ? { to: "/farm/pipeline/bigchix", label: "BigChix" } : null;
  const marketOverviewNavItem: NavItem | null =
    hasMarket && canAccessPipelineDesk(user) && canSee("dashboard_market")
      ? { to: "/dashboard/market", label: "Market overview", end: true }
      : null;
  const marketTrendsNavItem: NavItem | null =
    hasMarket && canAccessPipelineDesk(user) && canSee("dashboard_market")
      ? { to: "/dashboard/market/trends", label: "Market trends" }
      : null;
  const marketRecruitmentNavItem: NavItem | null =
    hasMarket &&
    (canAccessPipelineDesk(user) || user.role === "sales_officer") &&
    (user.role === "sales_officer" || canSee("dashboard_market"))
      ? { to: "/dashboard/market/recruitment", label: "Recruitment" }
      : null;
  const pipelineScoutNavItem: NavItem | null = null;
  const pipelineSellersNavItem: NavItem | null =
    hasFarm &&
    (user.role === "vet" || user.role === "vet_manager") &&
    !canAccessPipelineDesk(user)
      ? { to: "/farm/pipeline/sellers", label: "My flocks" }
      : null;
  const pipelineWeighNavItem: NavItem | null = null;
  const marketListingsNavItem: NavItem | null =
    (hasFarm || hasMarket) &&
    (user.role === "company_admin" || user.role === "manager")
      ? { to: "/market/listings", label: "My flocks" }
      : null;
  const marketCommissionsNavItem: NavItem | null =
    hasFarm && canScoutPipeline(user) && !canAccessPipelineDesk(user)
      ? { to: "/market/commissions", label: "Scout commissions" }
      : null;
  const laborerEarningsItem: NavItem | null =
    hasFarm &&
    (user.role === "laborer" ||
      user.role === "dispatcher" ||
      user.role === "vet" ||
      user.departmentKeys.includes("junior_vet")) &&
      canSee("laborer_earnings")
      ? { to: "/laborer/earnings", label: "My earnings" }
      : null;

  const erpnextSetupNavItem: NavItem | null =
    hasFarm &&
    erpnextAccess &&
    isCompanyLevelAdmin(user)
      ? { to: "/farm/erpnext-setup", label: "ERPNext" }
      : null;
  const erpnextDeskNavItem: NavItem | null =
    hasFarm &&
    erpnextAccess &&
    isCompanyLevelAdmin(user)
      ? { to: "/farm/erpnext", label: "ERPNext desk" }
      : null;
  const reportsCenterNavItem: NavItem | null =
    hasFarm &&
    (user.role === "vet" || isFarmOpsLead(user)) &&
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
    pipelineDeskNavItem,
    pipelineScoutNavItem,
    pipelineSellersNavItem,
    pipelineWeighNavItem,
    marketListingsNavItem,
    marketCommissionsNavItem,
    erpnextSetupNavItem,
    erpnextDeskNavItem,
    reportsCenterNavItem,
  ].filter(Boolean) as NavItem[];
  const farmCore = farmCoreNavItems(user, fieldReportingMode).filter((item) => {
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
  const salesOnlyNav = isPipelineSalesRole(user)
      ? ([peopleNavItem, flocksNavItem].filter(Boolean) as NavItem[])
      : user.role === "sales_officer"
        ? ([peopleNavItem, flocksNavItem, marketRecruitmentNavItem].filter(Boolean) as NavItem[])
        : null;
  const farmNav = salesOnlyNav ?? [...farmCore, ...farmExtras];
  const clevaItems = clevaNav.filter((item) => {
    if (item.to === "/cleva/portfolio") return canSee("cleva_portfolio");
    if (item.to === "/cleva/business-model") return canSee("cleva_business_model");
    if (item.to === "/cleva/general-lending") return canSee("cleva_business_model");
    if (item.to === "/cleva/investor-memos") return canSee("cleva_investor_memos");
    if (item.to === "/cleva/credit-scoring") return canSee("cleva_credit_scoring");
    return true;
  });

  const dashLink = isPipelineSalesRole(user) || user.role === "sales_officer"
    ? { to: "/farm/pipeline/people", label: "People" }
    : isOfficeFarmDesktopRole(user)
      ? { to: "/dashboard/management", label: "Today" }
      : user.role === "laborer" || user.role === "dispatcher"
        ? { to: "/dashboard/laborer", label: "Action center" }
        : user.role === "vet"
          ? { to: "/dashboard/vet", label: "Vet home" }
          : { to: "/dashboard/management", label: "Today" };
  const effectiveDashLink =
    dashLink.to === "/dashboard/laborer" && !canSee("dashboard_laborer")
      ? null
      : dashLink.to === "/dashboard/vet" && !canSee("dashboard_vet")
        ? null
        : dashLink.to === "/dashboard/management" && !canSee("dashboard_management")
          ? null
          : dashLink;

  const adminLink =
    canManageUsers(user) && canSee("admin_users") ? { to: "/admin/users", label: isOfficeFarmDesktopRole(user) ? "Users" : "User management" } : null;
  const messagesLink =
    user.role === "superuser" || user.role === "sales_coordinator"
      ? { to: "/farm/pipeline/messages", label: "Messages" }
      : null;
  const superAdminLink =
    user.role === "superuser" ? { to: "/admin/super", label: "Super admin" } : null;
  const typeLink =
    isFarmOpsLead(user)
      ? (canSee("admin_system_config") ? { to: "/admin/system-config", label: isOfficeFarmDesktopRole(user) ? "Lists & types" : "Type settings" } : null)
      : null;

  const adminItems = (
    isOfficeFarmDesktopRole(user)
      ? [messagesLink, superAdminLink]
      : [messagesLink, adminLink, superAdminLink, typeLink]
  ).filter(Boolean) as NavItem[];

  const office = isOfficeFarmDesktopRole(user);
  const desk = canAccessPipelineDesk(user);
  const deskMarketItems: NavItem[] =
    hasMarket && desk
      ? ([
          peopleNavItem,
          flocksNavItem,
          shopNavItem,
          bigchixNavItem,
          messagesLink,
          marketOverviewNavItem ? { ...marketOverviewNavItem, label: "Insights" } : null,
          marketRecruitmentNavItem,
          marketTrendsNavItem,
        ].filter(Boolean) as NavItem[])
      : [];
  const officerMarketItems: NavItem[] =
    hasMarket && user.role === "sales_officer"
      ? ([peopleNavItem, flocksNavItem, marketRecruitmentNavItem].filter(Boolean) as NavItem[])
      : [];
  const footerAdmin = office
    ? adminItems.filter(
        (item) =>
          item.to !== "/farm/pipeline/messages" &&
          item.to !== "/admin/super"
      )
    : adminItems;

  const groupedFarmNav = useMemo(() => {
    const byPath = new Map(farmNav.map((item) => [item.to, item]));
    const pick = (paths: string[]) => paths.map((p) => byPath.get(p)).filter(Boolean) as NavItem[];
    const marketGlance = hasMarket
      ? ([] as NavItem[])
      : ([
          marketOverviewNavItem,
          marketTrendsNavItem,
          marketRecruitmentNavItem,
        ].filter(Boolean) as NavItem[]);
    if (isPipelineSalesRole(user)) {
      return {
        overview: [] as NavItem[],
        operations: [] as NavItem[],
        health: [] as NavItem[],
        inventory: farmNav,
        planning_workforce: [] as NavItem[],
        people: [] as NavItem[],
        settings: [] as NavItem[],
        finance: [] as NavItem[],
      };
    }
    const office = isOfficeFarmDesktopRole(user);

    if (office) {
      const healthPages = pick(["/farm/vet-logs", "/farm/treatments", "/farm/mortality", "/farm/checkin-review"]);
      const stockPages = pick(["/farm/inventory", "/farm/slaughter"]);
      return {
        overview: [...(effectiveDashLink ? [{ ...effectiveDashLink, label: "Today" }] : [])],
        operations: [] as NavItem[],
        health: healthPages.length ? [{ to: healthPages[0].to, label: "Health" }] : [],
        inventory: stockPages.length ? [{ to: stockPages[0].to, label: "Stock" }] : [],
        planning_workforce: pick(["/farm/flocks"]),
        people: [adminLink, payrollNavItem].filter(Boolean) as NavItem[],
        settings: [] as NavItem[],
        finance: [] as NavItem[],
      };
    }

    return {
      overview: [...(effectiveDashLink ? [effectiveDashLink] : []), ...marketGlance],
      operations: pick([
        "/farm/checkin",
        "/farm/feed",
        "/farm/mortality-log",
        "/farm/daily-log",
        "/farm/batch-schedule",
        "/farm/checkin-review",
      ]),
      health: pick(["/farm/mortality", "/farm/vet-logs", "/farm/treatments"]),
      inventory: pick([
        "/farm/inventory",
        "/farm/slaughter",
        "/farm/pipeline",
        "/farm/pipeline/scout",
        "/farm/pipeline/sellers",
        "/farm/pipeline/weigh",
        "/market/listings",
        "/market/commissions",
      ]),
      planning_workforce: pick([
        "/farm/flocks",
        "/farm/schedule-settings",
        "/farm/payroll",
        "/laborer/earnings",
      ]),
      people: [] as NavItem[],
      settings: [] as NavItem[],
      finance: pick([
        "/farm/erpnext-setup",
        "/farm/erpnext",
        "/farm/reports",
      ]),
    };
  }, [
    farmNav,
    effectiveDashLink,
    user,
    adminLink,
    payrollNavItem,
    typeLink,
    logPayrollItem,
    erpnextSetupNavItem,
    erpnextDeskNavItem,
    reportsCenterNavItem,
    marketOverviewNavItem,
    marketTrendsNavItem,
    marketRecruitmentNavItem,
    hasMarket,
  ]);

  function groupsFor(ws: ActiveWorkspace): NavGroup[] {
    if (ws === "market") {
      const items =
        user.role === "sales_officer"
          ? officerMarketItems
          : desk
            ? deskMarketItems
            : ([marketListingsNavItem].filter(Boolean) as NavItem[]);
      const unique = dedupeNav(items);
      if (!unique.length) return [];
      return [{ title: marketSectionTitle, items: unique, alwaysLabel: true }];
    }
    if (ws === "clevacredit") {
      if (!clevaItems.length) return [];
      return [{ title: clevaSectionTitle, items: clevaItems }];
    }
    if (isPipelineSalesRole(user)) {
      return farmNav.length ? [{ items: farmNav }] : [];
    }
    if (office) {
      const flat = dedupeNav([
        ...groupedFarmNav.overview,
        ...groupedFarmNav.planning_workforce,
        ...groupedFarmNav.health,
        ...groupedFarmNav.inventory,
        ...groupedFarmNav.people,
        ...groupedFarmNav.settings,
        ...(marketListingsNavItem && !desk && !hasMarket ? [marketListingsNavItem] : []),
        ...(pipelineSellersNavItem ? [pipelineSellersNavItem] : []),
      ]);
      return flat.length ? [{ items: flat }] : [];
    }
    return [
      { title: "Overview", items: groupedFarmNav.overview },
      { title: "Operations", items: groupedFarmNav.operations },
      { title: "Health", items: groupedFarmNav.health },
      { title: "Inventory", items: groupedFarmNav.inventory },
      { title: "Planning", items: groupedFarmNav.planning_workforce },
      { title: "Finance", items: groupedFarmNav.finance },
    ].filter((group) => group.items.length);
  }

  const sections = workspaces
    .map((id) => {
      const groups = groupsFor(id);
      return {
        id,
        title: id === "market" ? marketSectionTitle : id === "farm" ? farmSectionTitle : clevaSectionTitle,
        groups,
        rail: dedupeNav(groups.flatMap((group) => group.items)),
      };
    })
    .filter((section) => section.rail.length > 0);
  const sectionKey = sections.map((section) => section.id).join(",");

  useEffect(() => {
    if (!sectionKey.split(",").includes(routeWorkspace)) return;
    setOpenSections((prev) => {
      if (prev?.includes(routeWorkspace)) return prev;
      return [...(prev ?? []), routeWorkspace];
    });
  }, [routeWorkspace, sectionKey]);

  const defaultOpen: ActiveWorkspace[] = sections.some((section) => section.id === routeWorkspace)
    ? [routeWorkspace]
    : sections[0]
      ? [sections[0].id]
      : [];
  const openNow = openSections ?? defaultOpen;

  function toggleSection(id: ActiveWorkspace) {
    setOpenSections((prev) => {
      const base = prev ?? defaultOpen;
      return base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    });
  }

  function MgrLink({
    item,
    compact = false,
    workspace,
  }: {
    item: NavItem;
    compact?: boolean;
    workspace?: ActiveWorkspace;
  }) {
    return (
      <NavLink
        to={href(item.to)}
        end={item.end}
        onClick={() => {
          if (workspace) setActiveWorkspace(workspace);
          onNavigate?.();
        }}
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

  function GroupSection({
    title,
    items,
    alwaysLabel,
    workspace,
  }: {
    title?: string;
    items: NavItem[];
    alwaysLabel?: boolean;
    workspace?: ActiveWorkspace;
  }) {
    if (!items.length) return null;
    const labeled = Boolean(title) && (alwaysLabel || items.length > 2);
    return (
      <div className="mgr-nav-group">
        {labeled ? <p className="mgr-nav-label">{title}</p> : null}
        <div className={`mgr-nav-group__items${labeled ? "" : " mgr-nav-group__items--flat"}`}>
          {items.map((item) => (
            <MgrLink key={item.to} item={item} workspace={workspace} />
          ))}
        </div>
      </div>
    );
  }

  function renderGroups(groups: NavGroup[], workspace: ActiveWorkspace, nest: boolean) {
    return groups.map((group, index) => {
      const sectionHeading = group.title === marketSectionTitle || group.title === clevaSectionTitle;
      return (
        <GroupSection
          key={`${workspace}-${group.title ?? index}`}
          title={nest && sectionHeading ? undefined : group.title}
          items={group.items}
          alwaysLabel={!nest && group.alwaysLabel}
          workspace={workspace}
        />
      );
    });
  }

  const footerBlock = (
    <div className={`mgr-sidebar-footer ${collapsed ? "mgr-sidebar-footer--collapsed" : ""}`}>
      {footerAdmin.length > 0 ? (
        <div className="mgr-nav-group">
          {!collapsed && footerAdmin.length > 2 ? <p className="mgr-nav-label">Admin</p> : null}
          <div className={`mgr-nav-group__items${footerAdmin.length > 2 ? "" : " mgr-nav-group__items--flat"}`}>
            {footerAdmin.map((item) => (
              <MgrLink key={item.to} item={item} compact={collapsed} />
            ))}
          </div>
        </div>
      ) : null}
      {superAdminLink && !footerAdmin.some((item) => item.to === "/admin/super") ? (
        <MgrLink item={superAdminLink} compact={collapsed} />
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
      <nav className={`mgr-sidebar-nav flex-1 overflow-y-auto ${collapsed ? "mgr-sidebar-nav--collapsed" : ""}`}>
        {collapsed ? (
          <div className="mgr-nav-group__items">
            {sections.map((section) => (
              <div key={section.id} className="mgr-nav-rail-section">
                {section.rail.map((item) => (
                  <MgrLink key={`${section.id}-${item.to}`} item={item} compact workspace={section.id} />
                ))}
              </div>
            ))}
          </div>
        ) : sections.length > 1 ? (
          sections.map((section) => {
            const open = openNow.includes(section.id);
            return (
              <div key={section.id} className="mgr-nav-section">
                <button
                  type="button"
                  className="mgr-nav-section__toggle"
                  aria-expanded={open}
                  onClick={() => toggleSection(section.id)}
                >
                  <SectionGlyph id={section.id} />
                  <span className="truncate">{section.title}</span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-white/70 transition-transform ${open ? "" : "-rotate-90"}`}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <div className="mgr-nav-section__body">
                    {renderGroups(section.groups, section.id, true)}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : sections[0] ? (
          renderGroups(sections[0].groups, sections[0].id, false)
        ) : null}
      </nav>

      {footerBlock}
    </div>
  );
}
