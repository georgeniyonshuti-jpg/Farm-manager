import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, SessionUser, UserRole } from "../../auth/types";
import { canAccessWorkspace } from "../../auth/permissions";
import { isLaborerLocaleUser, useLaborerT } from "../../i18n/laborerI18n";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { BrandLogo } from "../BrandLogo";

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
      return `${base} bg-neutral-500`;
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
      return `${base} bg-neutral-100 text-neutral-700`;
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
};

function UserMenuChip({ user, roleBadge, onLogout }: UserMenuProps) {
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
        className="bounce-tap flex max-w-full min-h-[44px] items-center gap-2 rounded-xl border border-transparent px-1 py-1 text-left hover:bg-black/[0.03] md:min-h-0 md:px-2 md:py-1.5"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={avatarClasses(user.role)}>{initials}</span>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{user.displayName}</p>
          <p className="mt-0.5">
            <span className={rolePillClasses(user.role)}>{roleBadge}</span>
          </p>
        </div>
        <span className="hidden text-neutral-400 md:inline" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-[var(--border-color)] bg-white py-1 shadow-lg"
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

export function GlobalHeader() {
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

  const workspaceSelect = showSwitcher ? (
    <select
      className="bounce-tap min-h-[44px] max-w-[14rem] rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm md:max-w-[18rem]"
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
          className="bounce-tap inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
        >
          {homeLabel}
        </Link>
      ) : null}
      {showVetHubActions ? (
        <>
          <Link
            to="/laborer/earnings"
            className="bounce-tap inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
          >
            {linkEarnings}
          </Link>
          <Link
            to="/farm/batch-schedule"
            className="bounce-tap inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
          >
            {batchCta}
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <header className="border-b border-[var(--border-color)] bg-[var(--surface-elevated)] shadow-sm backdrop-blur">
      <div className="mx-auto w-full max-w-[1440px]">
        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex min-h-[52px] items-center justify-between gap-2 border-b border-[var(--border-color)] px-3 py-2">
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-color-soft)]">
                <BrandLogo size={36} />
              </span>
              <span className="truncate text-base font-semibold text-[var(--text-primary)]">{appName}</span>
            </Link>
            <UserMenuChip user={user} roleBadge={roleBadge} onLogout={logout} />
          </div>
          {hasActionBar ? (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              {workspaceSelect}
              {showLang ? <LaborerLanguageToggle /> : null}
              {actionCluster}
            </div>
          ) : null}
        </div>

        {/* Desktop */}
        <div className="hidden min-h-[52px] items-center justify-between gap-4 px-4 py-2 md:flex">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-color-soft)]">
              <BrandLogo size={36} />
            </span>
            <span className="truncate text-base font-semibold text-[var(--text-primary)]">{appName}</span>
          </Link>
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
            <UserMenuChip user={user} roleBadge={roleBadge} onLogout={logout} />
          </div>
        </div>
      </div>
    </header>
  );
}
