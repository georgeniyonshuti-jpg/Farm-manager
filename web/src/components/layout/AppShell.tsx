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
    <div className={`flex min-h-screen flex-col bg-[var(--background-color)] ${!compactFieldView && sidebarOpen ? "h-screen overflow-hidden md:h-auto md:overflow-visible" : ""}`}>
      <GlobalHeader />
      {user && !user.canViewSensitiveFinancial ? <FinancialRestrictedBanner /> : null}
      {!compactFieldView && sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="flex w-full flex-1 flex-col md:flex-row">
        {!compactFieldView ? (
          <>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="bounce-tap mx-4 mb-2 mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)] md:hidden"
            >
              ☰ Menu
            </button>
            <div
              className={`fixed left-0 top-0 z-50 h-[100vh] w-[19rem] transform overflow-y-auto border-r border-[var(--border-color)] bg-[var(--surface-elevated)] pb-20 transition-transform [-webkit-overflow-scrolling:touch] md:static md:z-auto md:h-auto md:w-[240px] md:translate-x-0 md:overflow-visible md:pb-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
            >
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setSidebarOpen(false)}
                className="bounce-tap sticky top-0 ml-auto flex h-11 w-11 items-center justify-center bg-[var(--surface-elevated)] text-lg font-semibold text-neutral-700 md:hidden"
              >
                ×
              </button>
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </>
        ) : null}
        <main
          className={`app-page-enter flex-1 overflow-auto px-4 pt-4 md:px-10 md:pt-8 ${
            compactFieldView ? "pb-24 md:pb-8" : "pb-[72px] md:pb-8"
          }`}
        >
          <div className="mx-auto w-full max-w-[1100px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
