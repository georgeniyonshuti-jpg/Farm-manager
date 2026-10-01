import { Link, useLocation } from "react-router-dom";
import type { UserRole } from "../../auth/types";
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
  buyer: "Buyer",
  investor: "Investor",
  dispatcher: "Dispatcher",
};

type AppTopBarProps = {
  showDesktopSidebarToggle?: boolean;
  desktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  showMobileSidebarToggle?: boolean;
  onToggleMobileSidebar?: () => void;
  onOpenCommandPalette?: () => void;
};

/**
 * Dense desktop top bar.
 * Row 1 (48px): sidebar toggle · page title · actions · search · avatar.
 * Row 2 (36px): tabs + tab actions — only when PageFrame publishes tabs.
 */
export function AppTopBar({
  showDesktopSidebarToggle = false,
  desktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
  showMobileSidebarToggle = false,
  onToggleMobileSidebar,
  onOpenCommandPalette,
}: AppTopBarProps) {
  const { user, logout } = useAuth();
  const { companyHref } = useCompanyNav();
  const location = useLocation();
  const chrome = usePageChrome();
  const roleBadge = useLaborerT(user ? ROLE_LABEL_EN[user.role] : "");
  const appName = useLaborerT("Clevafarm");
  const linkEarnings = useLaborerT("My earnings");
  const batchCta = useLaborerT("Round schedule");

  if (!user) return null;

  const showLang = isLaborerLocaleUser(user);
  const appPath = stripTenantPrefix(location.pathname);
  const showVetHubActions = user.role === "vet_manager" && appPath === "/dashboard/vet";
  const hasTabs = chrome.tabs != null;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--farm-header)] backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-shell-x pt-[max(0px,env(safe-area-inset-top))] md:gap-3">
        <Link
          to={user.companySlug ? companyHref("") : "/"}
          className="flex shrink-0 items-center md:hidden"
          aria-label={appName}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-[var(--primary-color-soft)]">
            <BrandLogo size={24} />
          </span>
        </Link>

        {showMobileSidebarToggle ? (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="inline-flex h-control-md w-control-md items-center justify-center rounded-control border border-[var(--border-color)] bg-[var(--surface-color)] text-[var(--primary-color-dark)] font-bold md:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
        ) : null}

        {showDesktopSidebarToggle ? (
          <IconButton
            size="md"
            label={desktopSidebarCollapsed ? "Show side menu" : "Hide side menu"}
            onClick={onToggleDesktopSidebar}
            className="hidden md:inline-flex"
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
          </IconButton>
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
        />
      </div>

      {hasTabs ? (
        <div className="flex h-9 items-center gap-2 border-t border-[var(--border-color)]/50 bg-[var(--surface-subtle)]/60 px-shell-x">
          <div className="min-w-0 flex-1 overflow-x-auto">{chrome.tabs}</div>
          {(chrome.tabsActions ?? chrome.actions) != null ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {chrome.tabsActions ?? chrome.actions}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Mobile: actions under title when no tabs */}
      {chrome.actions != null && !hasTabs ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-color)]/50 bg-[var(--surface-subtle)]/60 px-shell-x py-1.5 sm:hidden">
          {chrome.actions}
        </div>
      ) : null}
    </header>
  );
}

/** @deprecated Use AppTopBar */
export { AppTopBar as GlobalHeader };
