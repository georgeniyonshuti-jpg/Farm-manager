import { Link, useLocation } from "react-router-dom";
import type { UserRole } from "../../auth/types";
import {
  accountKindLabel,
  canAccessPageByKey,
  isCompanyLevelAdmin,
  isFarmOpsLead,
  isOfficeFarmDesktopRole,
} from "../../auth/permissions";
import { canEditFlockScheduleRole } from "../../farm/scheduleAccess";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useAuth } from "../../auth/AuthContext";
import { isLaborerLocaleUser, useLaborerT } from "../../i18n/laborerI18n";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { BrandLogo } from "../BrandLogo";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { stripTenantPrefix } from "../../lib/tenancy";
import { UserMenuChip } from "./UserMenuChip";
import { usePageChrome } from "./PageChromeContext";
import { IconButton } from "../ui/IconButton";

const ROLE_LABEL_EN: Record<UserRole, string> = {
  superuser: "Superuser",
  company_admin: "Company admin",
  manager: "Manager",
  vet: "Vet",
  vet_manager: "Vet Manager",
  laborer: "Laborer",
  procurement_officer: "Procurement officer",
  sales_coordinator: "Sales coordinator",
  sales_officer: "Sales officer",
  buyer: "Buyer",
  investor: "Investor",
  dispatcher: "Dispatcher",
};

type AppTopBarProps = {
  /** Logo, app name, and the green chrome line. Desk shell only. */
  showBrand?: boolean;
  showDesktopSidebarToggle?: boolean;
  onToggleDesktopSidebar?: () => void;
  showMobileSidebarToggle?: boolean;
  onToggleMobileSidebar?: () => void;
  onOpenCommandPalette?: () => void;
};

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

/**
 * Full-width brand bar.
 * The menu button stays at the left edge (hamburger, never a chevron).
 * Tabs render separately via AppChromeTabs so they sit over the page, not the sidebar.
 */
export function AppTopBar({
  showBrand = false,
  showDesktopSidebarToggle = false,
  onToggleDesktopSidebar,
  showMobileSidebarToggle = false,
  onToggleMobileSidebar,
  onOpenCommandPalette,
}: AppTopBarProps) {
  const { user, logout } = useAuth();
  const { companyHref } = useCompanyNav();
  const { erpnextAccess } = useFarmCapabilities();
  const settingsLinks = user && isOfficeFarmDesktopRole(user)
    ? [
        isFarmOpsLead(user) && canAccessPageByKey(user, "admin_system_config")
          ? { href: companyHref("/admin/system-config"), label: "Lists & types" }
          : null,
        isFarmOpsLead(user) && canAccessPageByKey(user, "farm_schedule_settings") && canEditFlockScheduleRole(user.role)
          ? { href: companyHref("/farm/schedule-settings"), label: "Schedule settings" }
          : null,
        erpnextAccess && isCompanyLevelAdmin(user)
          ? { href: companyHref("/farm/erpnext-setup"), label: "ERPNext" }
          : null,
        erpnextAccess && isCompanyLevelAdmin(user)
          ? { href: companyHref("/farm/erpnext"), label: "ERPNext desk" }
          : null,
        (user.role === "vet" || isFarmOpsLead(user)) && canAccessPageByKey(user, "farm_reports")
          ? { href: companyHref("/farm/reports"), label: "Reports" }
          : null,
        user.role === "superuser" ? { href: companyHref("/admin/super"), label: "Super admin" } : null,
      ].filter(Boolean) as { href: string; label: string }[]
    : [];
  const location = useLocation();
  const chrome = usePageChrome();
  const roleBadge = useLaborerT(user ? (accountKindLabel(user) ?? ROLE_LABEL_EN[user.role]) : "");
  const appName = useLaborerT("Clevafarm");
  const linkEarnings = useLaborerT("My earnings");
  const batchCta = useLaborerT("Round schedule");

  if (!user) return null;

  const showLang = isLaborerLocaleUser(user);
  const appPath = stripTenantPrefix(location.pathname);
  const showVetHubActions = user.role === "vet_manager" && appPath === "/dashboard/vet";
  const hasTabs = chrome.tabs != null;
  const showMenuButton = Boolean(
    (showDesktopSidebarToggle && onToggleDesktopSidebar) ||
      (showMobileSidebarToggle && onToggleMobileSidebar),
  );

  return (
    <header
      className={`z-30 shrink-0 border-b border-[var(--border-color)] bg-[var(--farm-header)] backdrop-blur ${
        showBrand ? "mgr-brand-bar" : ""
      }`}
    >
      <div className="flex h-12 items-center gap-2 pl-2 pr-3 pt-[max(0px,env(safe-area-inset-top))] sm:pr-shell-x md:gap-3">
        {showMenuButton ? (
          <IconButton
            size="md"
            label="Menu"
            onClick={() => {
              const mobile = window.matchMedia("(max-width: 767px)").matches;
              if (mobile && onToggleMobileSidebar) onToggleMobileSidebar();
              else onToggleDesktopSidebar?.();
            }}
          >
            <MenuIcon />
          </IconButton>
        ) : null}

        {showBrand ? (
          <Link
            to={user.companySlug ? companyHref("") : "/"}
            className="flex min-w-0 shrink-0 items-center gap-2"
            aria-label={appName}
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-[var(--primary-color-soft)]">
              <BrandLogo size={22} />
            </span>
            <span className="hidden truncate font-[var(--font-display)] text-[15px] font-bold tracking-tight text-[var(--text-primary)] sm:inline">
              {appName}
            </span>
          </Link>
        ) : (
          <Link
            to={user.companySlug ? companyHref("") : "/"}
            className="flex shrink-0 items-center md:hidden"
            aria-label={appName}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-[var(--primary-color-soft)]">
              <BrandLogo size={24} />
            </span>
          </Link>
        )}

        {showBrand ? (
          <span className="hidden h-5 w-px shrink-0 bg-[var(--border-color)] sm:block" aria-hidden />
        ) : null}

        <div className="min-w-0 flex-1">
          {chrome.title != null ? (
            <h1 className="truncate text-base font-semibold leading-tight text-[var(--text-primary)]">
              {chrome.title}
            </h1>
          ) : null}
        </div>

        {showLang ? <LaborerLanguageToggle /> : null}

        {showVetHubActions ? (
          <div className="hidden items-center gap-2 border-r border-[var(--border-color)] pr-2 md:flex">
            <Link
              to={companyHref("laborer/earnings")}
              className="inline-flex h-control-md items-center rounded-control border border-[var(--border-color)] bg-[var(--surface-color)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            >
              {linkEarnings}
            </Link>
            <Link
              to={companyHref("farm/batch-schedule")}
              className="inline-flex h-control-md items-center rounded-control border border-[var(--border-color)] bg-[var(--surface-color)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            >
              {batchCta}
            </Link>
          </div>
        ) : null}

        {chrome.actions != null && !hasTabs ? (
          <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex">{chrome.actions}</div>
        ) : null}

        {onOpenCommandPalette ? (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden h-control-md items-center gap-1.5 rounded-control border border-[var(--border-color)] bg-[var(--surface-color)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] md:inline-flex"
            aria-label="Search"
          >
            Search
            <kbd className="rounded border border-[var(--border-color)] px-1 font-sans text-[10px]">⌘K</kbd>
          </button>
        ) : null}

        <UserMenuChip
          user={user}
          roleBadge={roleBadge}
          onLogout={logout}
          compactOnMobile
          includeThemeToggle
          includeDensityToggle
          showRolePill={false}
          menuLinks={settingsLinks}
          showLegalFooter={!showBrand}
        />
      </div>

      {/* Mobile: actions under title when no tabs */}
      {chrome.actions != null && !hasTabs ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-color)]/50 bg-[var(--surface-subtle)]/60 px-shell-x py-1.5 sm:hidden">
          {chrome.actions}
        </div>
      ) : null}
    </header>
  );
}

/** Tab row over the page column, not the sidebar. */
export function AppChromeTabs() {
  const chrome = usePageChrome();
  if (chrome.tabs == null) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border-color)] bg-[var(--surface-subtle)]/60 px-shell-x">
      <div className="min-w-0 flex-1 overflow-x-auto">{chrome.tabs}</div>
      {(chrome.tabsActions ?? chrome.actions) != null ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {chrome.tabsActions ?? chrome.actions}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use AppTopBar */
export { AppTopBar as GlobalHeader };
