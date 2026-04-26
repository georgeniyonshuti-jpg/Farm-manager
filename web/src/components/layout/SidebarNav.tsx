import { NavLink } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey, canFlockAction, farmCoreNavItems, hasPermission } from "../../auth/permissions";
import { canEditFlockScheduleRole } from "../../farm/scheduleAccess";
import { useLaborerT } from "../../i18n/laborerI18n";

function NavText({ text }: { text: string }) {
  const t = useLaborerT(text);
  return <>{t}</>;
}

type NavItem = { to: string; label: string; end?: boolean };
type Props = { onNavigate?: () => void; collapsed?: boolean };
type GroupId = "overview" | "operations" | "flocks_health" | "planning_workforce" | "integrations_admin";

const CLEVA_NAV: NavItem[] = [
  { to: "/cleva/portfolio", label: "Portfolio analytics", end: true },
  { to: "/cleva/business-model", label: "Business model" },
  { to: "/cleva/general-lending", label: "General lending" },
  { to: "/cleva/investor-memos", label: "Investor memos" },
  { to: "/cleva/credit-scoring", label: "Credit scoring" },
];

export function SidebarNav({ onNavigate, collapsed = false }: Props) {
  const { activeWorkspace, user } = useAuth();
  const farmSectionTitle = useLaborerT("Farm operations");
  const clevaSectionTitle = useLaborerT("Clevafarm Finance");

  if (!user || !activeWorkspace) return null;

  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>({
    overview: true,
    operations: true,
    flocks_health: true,
    planning_workforce: true,
    integrations_admin: true,
  });

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

  // FIX: flock list + urgency for management / clinical roles
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
    canSee("farm_checkin_review")
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
    canSee("farm_treatments")
      ? { to: "/farm/treatments", label: "Medicine tracking" }
      : null;
  const slaughterNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    canFlockAction(user, "slaughter.schedule") &&
    canSee("farm_slaughter")
      ? { to: "/farm/slaughter", label: "Slaughter & FCR" }
      : null;
  const cycleFcrNavItem: NavItem | null =
    activeWorkspace === "farm" && canFlockAction(user, "flock.view") && canSee("farm_flocks")
      ? { to: "/farm/fcr", label: "Cycle FCR" }
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
    (user.role === "manager" || user.role === "superuser")
      ? { to: "/farm/accounting-approvals", label: "Accounting approvals" }
      : null;

  const odooSetupNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "superuser")
      ? { to: "/farm/odoo-setup", label: "Odoo integration" }
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
    cycleFcrNavItem,
    accountingApprovalsNavItem,
    odooSetupNavItem,
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
    const k = byPath[item.to];
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
    user.role === "superuser" && canSee("admin_users") ? { to: "/admin/users", label: "User management" } : null;
  const typeLink =
    user.role === "vet_manager" || user.role === "manager" || user.role === "superuser"
      ? (canSee("admin_system_config") ? { to: "/admin/system-config", label: "Type settings" } : null)
      : null;

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
        "/farm/inventory",
      ]),
      flocks_health: pick([
        "/farm/flocks",
        "/farm/mortality",
        "/farm/vet-logs",
        "/farm/treatments",
        "/farm/slaughter",
        "/farm/fcr",
      ]),
      planning_workforce: pick([
        "/farm/batch-schedule",
        "/farm/checkin-review",
        "/farm/schedule-settings",
        "/farm/payroll",
        "/laborer/earnings",
      ]),
      integrations_admin: pick([
        "/farm/accounting-approvals",
        "/farm/odoo-setup",
        "/farm/reports",
      ]),
    };
  }, [farmNav, effectiveDashLink]);

  function toggleGroup(id: GroupId) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function GroupSection({ id, title, items, icon }: { id: GroupId; title: string; items: NavItem[]; icon: string }) {
    if (!items.length) return null;
    const isOpen = openGroups[id];
    return (
      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)]/60">
        <button
          type="button"
          onClick={() => toggleGroup(id)}
          className="bounce-tap flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]"
        >
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="text-sm">{icon}</span>
            <span>{title}</span>
          </span>
          <span aria-hidden className="text-sm">{isOpen ? "▾" : "▸"}</span>
        </button>
        {isOpen ? (
          <div className="flex flex-col gap-1 px-2 pb-2">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    "bounce-tap flex h-9 items-center rounded-lg border-l-[3px] px-3 text-sm font-medium",
                    isActive
                      ? "border-l-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--text-primary)]"
                      : "border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--primary-color-soft)] hover:text-[var(--text-primary)]",
                  ].join(" ")
                }
              >
                <NavText text={item.label} />
              </NavLink>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const compactItems = (() => {
    const base = [
      ...(activeWorkspace === "farm"
        ? [
            ...groupedFarmNav.overview,
            ...groupedFarmNav.operations,
            ...groupedFarmNav.flocks_health,
            ...groupedFarmNav.planning_workforce,
            ...groupedFarmNav.integrations_admin,
          ]
        : nav),
      adminLink,
      typeLink,
    ].filter(Boolean) as NavItem[];
    const seen = new Set<string>();
    return base.filter((i) => {
      if (seen.has(i.to)) return false;
      seen.add(i.to);
      return true;
    });
  })();

  function CollapsedGlyph({ label }: { label: string }) {
    const trimmed = label.trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const glyph =
      parts.length >= 2
        ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
        : (trimmed.slice(0, 2) || "?").toUpperCase();
    return (
      <span
        aria-hidden
        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--surface-card)] text-[10px] font-semibold text-[var(--text-muted)]"
      >
        {glyph}
      </span>
    );
  }

  return (
    <aside className="w-full border-b border-[var(--border-color)] bg-[var(--surface-elevated)] md:h-full md:border-b-0 md:border-r">
      <div className="p-4 md:p-5">
        {!collapsed ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {activeWorkspace === "farm" ? farmSectionTitle : clevaSectionTitle}
          </p>
        ) : null}
        <nav className="mt-4 flex flex-col gap-2.5 pb-20 md:pb-0">
          {          collapsed
            ? compactItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={item.label}
                  className={({ isActive }) =>
                    [
                      "bounce-tap flex h-10 items-center justify-center rounded-lg border-l-[3px]",
                      isActive
                        ? "border-l-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--text-primary)]"
                        : "border-l-transparent text-[var(--text-muted)] hover:bg-[var(--primary-color-soft)]",
                    ].join(" ")
                  }
                >
                  <CollapsedGlyph label={item.label} />
                  <span className="sr-only">{item.label}</span>
                </NavLink>
              ))
            : null}
          {!collapsed ? (
            <>
          {activeWorkspace === "farm" ? (
            <>
              <GroupSection id="overview" title="Overview" icon="⌂" items={groupedFarmNav.overview} />
              <GroupSection id="operations" title="Daily operations" icon="☀" items={groupedFarmNav.operations} />
              <GroupSection id="flocks_health" title="Flocks & health" icon="◉" items={groupedFarmNav.flocks_health} />
              <GroupSection id="planning_workforce" title="Planning & workforce" icon="☰" items={groupedFarmNav.planning_workforce} />
              <GroupSection id="integrations_admin" title="Integrations & admin" icon="⚙" items={groupedFarmNav.integrations_admin} />
            </>
          ) : (
            nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    "bounce-tap flex h-9 items-center rounded-lg border-l-[3px] px-3 text-sm font-medium",
                    isActive
                      ? "border-l-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--text-primary)]"
                      : "border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--primary-color-soft)] hover:text-[var(--text-primary)]",
                  ].join(" ")
                }
              >
                <NavText text={item.label} />
              </NavLink>
            ))
          )}
          {adminLink && (
            <NavLink
              to={adminLink.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "mt-2 flex h-9 items-center rounded-lg border-l-[3px] px-3 text-sm font-medium",
                  isActive
                    ? "border-l-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--text-primary)]"
                    : "border border-dashed border-[var(--border-color)] border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)]",
                ].join(" ")
              }
            >
              <NavText text={adminLink.label} />
            </NavLink>
          )}
          {typeLink && (!adminLink || typeLink.to !== adminLink.to) && (
            <NavLink
              to={typeLink.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  "flex h-9 items-center rounded-lg border-l-[3px] px-3 text-sm font-medium",
                  isActive
                    ? "border-l-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--text-primary)]"
                    : "border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--primary-color-soft)] hover:text-[var(--text-primary)]",
                ].join(" ")
              }
            >
              <NavText text={typeLink.label} />
            </NavLink>
          )}
            </>
          ) : null}
        </nav>
      </div>
    </aside>
  );
}
