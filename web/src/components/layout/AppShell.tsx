import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { GlobalHeader } from "./GlobalHeader";
import { FinancialRestrictedBanner } from "./FinancialRestrictedBanner";
import { SidebarNav } from "./SidebarNav";

export function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const laborerLikeView = location.pathname.startsWith("/dashboard/laborer");
  const juniorVetMode = user?.role === "vet" || user?.departmentKeys.includes("junior_vet");
  const fieldOpsMode = user?.role === "laborer" || user?.role === "dispatcher";
  // Nuclear removal: keep sidebar fully disabled for junior-vet/field-ops account experiences.
  const compactFieldView = laborerLikeView || juniorVetMode || fieldOpsMode;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background-color)]">
      <GlobalHeader />
      {user && !user.canViewSensitiveFinancial ? <FinancialRestrictedBanner /> : null}
      {!compactFieldView && sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col sm:flex-row">
        {!compactFieldView ? (
          <>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="bounce-tap mx-4 mb-2 mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] sm:hidden"
            >
              ☰ Menu
            </button>
            <div
              className={`fixed inset-y-0 left-0 z-40 w-[19rem] transform border-r border-[var(--border-color)] bg-[var(--surface-elevated)] transition-transform sm:static sm:z-auto sm:w-[18rem] sm:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </>
        ) : null}
            <main className={`app-page-enter flex-1 overflow-auto px-4 py-4 sm:px-8 sm:py-7 ${compactFieldView ? "pb-24 sm:pb-7" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
