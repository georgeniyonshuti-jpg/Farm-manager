import { NavLink } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction, hasPermission } from "../../auth/permissions";
import { canEditFlockScheduleRole } from "../../farm/scheduleAccess";
import { useLaborerT } from "../../i18n/laborerI18n";

function NavText({ text }: { text: string }) {
  const t = useLaborerT(text);
  return <>{t}</>;
}

type NavItem = { to: string; label: string; end?: boolean };
type Props = { onNavigate?: () => void };

const FARM_NAV_BASE: NavItem[] = [
  { to: "/farm/checkin", label: "Round check-in" },
  { to: "/farm/mortality-log", label: "Log mortality" },
  { to: "/farm/daily-log", label: "Daily logs" },
  { to: "/farm/mortality", label: "Mortality tracking" },
  { to: "/farm/inventory", label: "Feed inventory" },
];

const CLEVA_NAV: NavItem[] = [
  { to: "/cleva/portfolio", label: "Portfolio analytics", end: true },
  { to: "/cleva/investor-memos", label: "Investor memos" },
  { to: "/cleva/credit-scoring", label: "Credit scoring" },
];

export function SidebarNav({ onNavigate }: Props) {
  const { activeWorkspace, user } = useAuth();
  const farmSectionTitle = useLaborerT("Farm operations");
  const clevaSectionTitle = useLaborerT("Clevafarm Finance");

  if (!user || !activeWorkspace) return null;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    core: true,
    clinical: true,
    workforce: true,
  });

  const clevaNav = CLEVA_NAV.filter((item) => {
    if (item.to !== "/cleva/investor-memos") return true;
    return (
      user.role === "superuser" ||
      user.departmentKeys.includes("investor_memo") ||
      hasPermission(user, "view_investor_memos")
    );
  });

  const scheduleItem: NavItem | null =
    activeWorkspace === "farm" && user && canEditFlockScheduleRole(user.role)
      ? { to: "/farm/batch-schedule", label: "Check-in schedule" }
      : null;

  // FIX: flock list + urgency for management / clinical roles
  const flocksItem: NavItem | null =
    activeWorkspace === "farm" &&
    user &&
    canFlockAction(user, "flock.view")
      ? { to: "/farm/flocks", label: "Flocks" }
      : null;

  const logPayrollItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "vet_manager" || user.role === "superuser")
      ? { to: "/farm/schedule-settings", label: "Schedule settings" }
      : null;

  const payrollNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    (user.role === "manager" || user.role === "vet_manager" || user.role === "superuser")
      ? { to: "/farm/payroll", label: "Payroll" }
      : null;
  const treatmentNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    canFlockAction(user, "treatment.execute")
      ? { to: "/farm/treatments", label: "Medicine tracking" }
      : null;
  const slaughterNavItem: NavItem | null =
    activeWorkspace === "farm" &&
    canFlockAction(user, "slaughter.schedule")
      ? { to: "/farm/slaughter", label: "Slaughter & FCR" }
      : null;

  const laborerEarningsItem: NavItem | null =
    activeWorkspace === "farm" && (user.role === "laborer" || user.role === "dispatcher")
      ? { to: "/laborer/earnings", label: "My earnings" }
      : null;

  const farmExtras = [
    laborerEarningsItem,
    flocksItem,
    scheduleItem,
    logPayrollItem,
    payrollNavItem,
    treatmentNavItem,
    slaughterNavItem,
  ].filter(Boolean) as NavItem[];
  const farmNav = farmExtras.length ? [...FARM_NAV_BASE, ...farmExtras] : FARM_NAV_BASE;
  const nav = activeWorkspace === "farm" ? farmNav : clevaNav;

  const dashLink =
    user.role === "laborer" || user.role === "dispatcher"
      ? { to: "/dashboard/laborer", label: "Action center" }
      : user.role === "vet" || user.role === "vet_manager"
        ? { to: "/dashboard/vet", label: "Vet home" }
        : { to: "/dashboard/management", label: "Command center" };

  const adminLink =
    user.role === "superuser" ? { to: "/admin/users", label: "User management" } : null;

  const groupedFarmNav = useMemo(
    () => ({
      core: FARM_NAV_BASE,
      clinical: farmNav.filter((i) => ["/farm/flocks", "/farm/batch-schedule", "/farm/treatments", "/farm/slaughter"].includes(i.to)),
      workforce: farmNav.filter((i) => ["/farm/schedule-settings", "/farm/payroll", "/laborer/earnings"].includes(i.to)),
    }),
    [farmNav]
  );

  function toggleGroup(id: "core" | "clinical" | "workforce") {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function GroupSection({ id, title, items }: { id: "core" | "clinical" | "workforce"; title: string; items: NavItem[] }) {
    if (!items.length) return null;
    const isOpen = openGroups[id];
    return (
      <section className="rounded-lg border border-neutral-200 bg-white/70">
        <button
          type="button"
          onClick={() => toggleGroup(id)}
          className="bounce-tap flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600"
        >
          <span>{title}</span>
          <span aria-hidden>{isOpen ? "−" : "+"}</span>
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
                    "bounce-tap rounded-lg px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-[var(--primary-color)] text-white"
                      : "text-neutral-800 hover:bg-[var(--primary-color-soft)]",
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

  return (
    <aside className="w-full border-b border-neutral-200 bg-neutral-50 sm:w-56 sm:border-b-0 sm:border-r">
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {activeWorkspace === "farm" ? farmSectionTitle : clevaSectionTitle}
        </p>
        <nav className="mt-3 flex flex-col gap-2 sm:flex-col">
          <NavLink
            to={dashLink.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                "rounded-lg px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-emerald-800 text-white"
                  : "text-neutral-800 hover:bg-neutral-200/80",
              ].join(" ")
            }
          >
            <NavText text={dashLink.label} />
          </NavLink>
          {activeWorkspace === "farm" ? (
            <>
              <GroupSection id="core" title="Core operations" items={groupedFarmNav.core} />
              <GroupSection id="clinical" title="Clinical & flock control" items={groupedFarmNav.clinical} />
              <GroupSection id="workforce" title="Workforce & admin" items={groupedFarmNav.workforce} />
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
                    "bounce-tap rounded-lg px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-[var(--primary-color)] text-white"
                      : "text-neutral-800 hover:bg-[var(--primary-color-soft)]",
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
                  "mt-2 rounded-lg px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-neutral-900 text-white"
                    : "border border-dashed border-neutral-300 text-neutral-800 hover:bg-neutral-200/80",
                ].join(" ")
              }
            >
              <NavText text={adminLink.label} />
            </NavLink>
          )}
        </nav>
      </div>
    </aside>
  );
}
