import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, SessionUser, UserRole } from "../../auth/types";
import { canAccessWorkspace } from "../../auth/permissions";
import { isLaborerLocaleUser, useLaborerT } from "../../i18n/laborerI18n";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { BrandLogo } from "../BrandLogo";
import { useTheme } from "../../context/ThemeContext";

const ROLE_LABEL_EN: Record<UserRole, string> = {
  superuser: "Superuser",
  manager: "Manager",
  vet: "Vet",
  vet_manager: "Vet Manager",
  laborer: "Laborer",
  procurement_officer: "Procurement officer",
  sales_coordinator: "Sales coordinator",
  investor: "Investor",
  dispatcher: "Dispatcher",
};

function initialsFromDisplayName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    return w.slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarClasses(role: UserRole): string {
  const base =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm";
  switch (role) {
    case "laborer":
    case "dispatcher":
      return `${base} bg-[#1D9E75]`;
    case "vet":
    case "vet_manager":
      return `${base} bg-[#d97706]`;
    case "manager":
      return `${base} bg-[#185FA5]`;
    default:
      return `${base} bg-slate-500`;
  }
}

function rolePillClasses(role: UserRole): string {
  const base = "rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-tight";
  switch (role) {
    case "laborer":
    case "dispatcher":
      return `${base} bg-[#E1F5EE] text-[#0F6E56]`;
    case "vet":
    case "vet_manager":
      return `${base} bg-[#FAEEDA] text-[#854F0B]`;
    case "manager":
      return `${base} bg-[#E6F1FB] text-[#185FA5]`;
    default:
      return `${base} bg-[var(--surface-subtle)] text-[var(--text-secondary)]`;
  }
}

function routeTitleKey(pathname: string): string | null {
  if (pathname.startsWith("/dashboard/laborer")) return "Field operations hub";
  if (pathname.startsWith("/dashboard/vet")) return "Vet hub";
  if (pathname.startsWith("/dashboard/management")) return "Command center";
  if (pathname.startsWith("/farm")) return "Farm";
  if (pathname.startsWith("/cleva")) return "Clevafarm Finance";
  if (pathname.startsWith("/admin")) return "Admin";
  return null;
}

type UserMenuProps = {
  user: SessionUser;
  roleBadge: string;
  onLogout: () => void;
  compactOnMobile?: boolean;
};

function UserMenuChip({ user, roleBadge, onLogout, compactOnMobile = false }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initials = useMemo(() => initialsFromDisplayName(user.displayName), [user.displayName]);
  const signOut = useLaborerT("Sign out");

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handle);
    }
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative min-w-0" ref={wrapRef}>
      <button
        type="button"
        className="bounce-tap flex max-w-full min-h-[40px] items-center gap-2 rounded-xl border border-transparent px-1 py-1 text-left hover:bg-black/[0.03] md:min-h-0 md:px-2 md:py-1.5"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={avatarClasses(user.role)}>{initials}</span>
        <div className={`min-w-0 flex-1 text-left ${compactOnMobile ? "hidden md:block" : ""}`}>
          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{user.displayName}</p>
          <p className="mt-0.5">
            <span className={rolePillClasses(user.role)}>{roleBadge}</span>
          </p>
        </div>
        <span className="hidden text-[var(--text-muted)] md:inline" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] py-1 shadow-elevated"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="bounce-tap w-full px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            {signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type GlobalHeaderProps = {
  showDesktopSidebarToggle?: boolean;
  desktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  showMobileSidebarToggle?: boolean;
  onToggleMobileSidebar?: () => void;
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="bounce-tap inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] text-[var(--text-secondary)] hover:bg-[var(--primary-color-soft)] hover:text-[var(--primary-color)] transition-colors"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function GlobalHeader({
  showDesktopSidebarToggle = false,
  desktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
  showMobileSidebarToggle = false,
  onToggleMobileSidebar,
}: GlobalHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const { user, logout, activeWorkspace, setActiveWorkspace } = useAuth();
  const location = useLocation();
  const farmWorkspace = useLaborerT("Farm / Poultry");
  const clevaWorkspace = useLaborerT("Clevafarm Finance");
  const switchWorkspaceAria = useLaborerT("Switch active business unit");
  const roleBadge = useLaborerT(user ? ROLE_LABEL_EN[user.role] : "");
  const homeLabel = useLaborerT("Action center");
  const appName = useLaborerT("Clevafarm");
  const linkEarnings = useLaborerT("My earnings");
  const batchCta = useLaborerT("Round schedule");
  const centerTitleRaw = routeTitleKey(location.pathname);
  const centerTitle = useLaborerT(centerTitleRaw ?? "");

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--app-header-h");
    };
  }, [user?.id]);

  if (!user) return null;

  const showSwitcher = user.businessUnitAccess === "both";
  const showLang = isLaborerLocaleUser(user);
  const showActionCenter =
    (user.role === "laborer" || user.role === "dispatcher") && location.pathname !== "/dashboard/laborer";
  const showVetHubActions =
    (user.role === "vet" || user.role === "vet_manager") && location.pathname === "/dashboard/vet";

  const workspaces: { id: ActiveWorkspace; label: string }[] = [
    { id: "farm", label: farmWorkspace },
    { id: "clevacredit", label: clevaWorkspace },
  ];

  const hasActionBar =
    showSwitcher || showLang || showActionCenter || showVetHubActions;
  const nonLaborerMobile =
    user.role !== "laborer" && user.role !== "dispatcher";

  const workspaceSelect = showSwitcher ? (
    <select
      className="bounce-tap min-h-[36px] max-w-[14rem] rounded-xl border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-sm md:min-h-[44px] md:py-2 md:text-sm md:max-w-[18rem]"
      value={activeWorkspace ?? "farm"}
      onChange={(e) => setActiveWorkspace(e.target.value as ActiveWorkspace)}
      aria-label={switchWorkspaceAria}
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id} disabled={!canAccessWorkspace(user, w.id)}>
          {w.label}
        </option>
      ))}
    </select>
  ) : null;

  const actionCluster = (
    <>
      {showActionCenter ? (
        <Link
          to="/dashboard/laborer"
          className="bounce-tap inline-flex min-h-[36px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)] md:min-h-[44px] md:py-2 md:text-sm"
        >
          {homeLabel}
        </Link>
      ) : null}
      {showVetHubActions ? (
        <>
          <Link
            to="/laborer/earnings"
            className="bounce-tap inline-flex min-h-[36px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)] md:min-h-[44px] md:py-2 md:text-sm"
          >
            {linkEarnings}
          </Link>
          <Link
            to="/farm/batch-schedule"
            className="bounce-tap inline-flex min-h-[36px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)] md:min-h-[44px] md:py-2 md:text-sm"
          >
            {batchCta}
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <header
      ref={headerRef}
      className="fixed inset-x-0 top-0 z-[100] border-b border-[var(--border-color)] bg-[var(--surface-elevated)] pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur"
    >
      <div className="w-full">
        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex min-h-[48px] items-center justify-between gap-2 border-b border-[var(--border-color)] px-2.5 py-1.5">
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-color-soft)]">
                <BrandLogo size={34} />
              </span>
              <span className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{appName}</span>
            </Link>
            <div className="flex items-center gap-2">
              {showMobileSidebarToggle ? (
                <button
                  type="button"
                  onClick={onToggleMobileSidebar}
                  className="bounce-tap inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] text-base text-[var(--text-primary)]"
                  aria-label="Open side menu"
                  title="Open side menu"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              ) : null}
              <ThemeToggle />
              <UserMenuChip user={user} roleBadge={roleBadge} onLogout={logout} compactOnMobile />
            </div>
          </div>
          {hasActionBar ? (
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 ${
                nonLaborerMobile
                  ? "overflow-x-auto whitespace-nowrap"
                  : "flex-wrap"
              }`}
            >
              {workspaceSelect}
              {showLang ? <LaborerLanguageToggle /> : null}
              {actionCluster}
            </div>
          ) : null}
        </div>

        {/* Desktop */}
        <div className="hidden h-16 items-center justify-between gap-4 px-6 md:flex">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {showDesktopSidebarToggle ? (
              <button
                type="button"
                onClick={onToggleDesktopSidebar}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] text-lg text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
                aria-label={desktopSidebarCollapsed ? "Show side menu" : "Hide side menu"}
                title={desktopSidebarCollapsed ? "Show side menu" : "Hide side menu"}
              >
                {desktopSidebarCollapsed ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6" />
                  </svg>
                )}
              </button>
            ) : null}
            <Link to="/" className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-color-soft)]">
              <BrandLogo size={36} />
            </span>
            <span className="truncate text-base font-semibold text-[var(--text-primary)]">{appName}</span>
            </Link>
          </div>
          <div className="flex min-w-0 flex-1 justify-center px-2">
            {workspaceSelect ? (
              <div className="flex justify-center">{workspaceSelect}</div>
            ) : centerTitleRaw ? (
              <p className="truncate text-center text-sm font-medium text-[var(--text-secondary)]">{centerTitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {showLang ? <LaborerLanguageToggle /> : null}
            {showActionCenter || showVetHubActions ? (
              <div className="flex items-center gap-2 border-r border-[var(--border-color)] pr-3">
                {actionCluster}
              </div>
            ) : null}
            <ThemeToggle />
            <UserMenuChip user={user} roleBadge={roleBadge} onLogout={logout} />
          </div>
        </div>
      </div>
    </header>
  );
}
