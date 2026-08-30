import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { OdooConnectionProvider } from "../../context/OdooConnectionContext";
import { GlobalHeader } from "./GlobalHeader";
import { FinancialRestrictedBanner } from "./FinancialRestrictedBanner";
import { FieldShellBottomNav } from "./FieldShellBottomNav";
import { SidebarNav } from "./SidebarNav";
import { AnnouncementBanner } from "../AnnouncementBanner";
import { TrialBanner } from "../TrialBanner";
import { ErpnextAccessBanner } from "../farm/ErpnextAccessBanner";
import { useOnboardingStatus } from "../../hooks/useOnboardingStatus";
import { PersistentAppPages } from "../../routes/PersistentAppPages";
import { isAppShellPersistentPath } from "../../routes/persistentPaths";
import { stripTenantPrefix } from "../../lib/tenancy";

const SIDEBAR_COLLAPSED_KEY = "cleva-farm-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const { company, trialDaysRemaining } = useOnboardingStatus();
  const appPath = stripTenantPrefix(location.pathname);
  const laborerLikeView =
    appPath.startsWith("/dashboard/laborer") ||
    (appPath.startsWith("/dashboard/vet") && user?.role === "vet");
  const fieldVetMode = user?.role === "vet";
  const fieldOpsMode = user?.role === "laborer" || user?.role === "dispatcher";
  const compactFieldView = laborerLikeView || fieldVetMode || fieldOpsMode;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(readSidebarCollapsed);
  const hideOutlet = isAppShellPersistentPath(location.pathname);
  const desktopSidebarWidthClass = desktopSidebarCollapsed ? "md:w-[84px]" : "md:w-[210px]";

  const toggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (compactFieldView) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (window.matchMedia("(max-width: 767px)").matches) return;
      e.preventDefault();
      toggleDesktopSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compactFieldView, toggleDesktopSidebar]);

  const banners = (
    <>
      <AnnouncementBanner />
      <ErpnextAccessBanner />
      {company?.plan === "trial" && trialDaysRemaining != null ? (
        <TrialBanner daysRemaining={trialDaysRemaining} />
      ) : null}
    </>
  );

  const pageBody = (
    <>
      <div style={{ display: hideOutlet ? "none" : "block" }}>
        <Outlet />
      </div>
      <PersistentAppPages />
    </>
  );

  /* Field roles keep the existing mobile-simplified shell (bottom nav, no mgr sidebar). */
  if (compactFieldView) {
    return (
      <OdooConnectionProvider>
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--background-color)]">
          {banners}
          <GlobalHeader variant="field" />
          <div className="app-shell-body flex flex-1 min-h-0 flex-col">
            {user && !user.canViewSensitiveFinancial ? <FinancialRestrictedBanner /> : null}
            <main className="app-page-enter flex-1 overflow-auto px-4 pt-4 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:min-h-0 md:px-8 md:pt-6 md:pb-8 md:ml-0">
              <div className="mx-auto w-full max-w-lg md:max-w-none">{pageBody}</div>
            </main>
            <FieldShellBottomNav />
          </div>
        </div>
      </OdooConnectionProvider>
    );
  }

  /* Desk / manager shell — layout copied from Cleva POS ManagerShell. */
  return (
    <OdooConnectionProvider>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--background-color)]">
        {banners}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
          <aside
            className={`mgr-sidebar hidden shrink-0 flex-col shadow-[1px_0_0_rgba(15,23,42,0.08)] md:flex md:sticky md:top-0 md:h-dvh ${desktopSidebarWidthClass}`}
          >
            <SidebarNav
              collapsed={desktopSidebarCollapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background-color)] md:overflow-hidden">
            <GlobalHeader
              variant="desk"
              showDesktopSidebarToggle
              desktopSidebarCollapsed={desktopSidebarCollapsed}
              onToggleDesktopSidebar={toggleDesktopSidebar}
              showMobileSidebarToggle
              onToggleMobileSidebar={() => setSidebarOpen(true)}
            />
            {user && !user.canViewSensitiveFinancial ? <FinancialRestrictedBanner /> : null}
            <main className="app-page-enter animate-fade-up flex-1 overflow-auto px-4 py-6 pb-24 md:overflow-y-auto md:px-8 md:py-7 lg:px-[32px] md:pb-12">
              <div className="mx-auto w-full max-w-7xl">{pageBody}</div>
            </main>
          </div>
        </div>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-[var(--farm-overlay)] backdrop-blur-[2px]"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="mgr-sidebar absolute inset-y-0 left-0 flex w-[min(16.5rem,88vw)] flex-col shadow-[var(--shadow-elevated)] animate-slide-right">
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </aside>
          </div>
        ) : null}
      </div>
    </OdooConnectionProvider>
  );
}
