import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { GlobalHeader } from "./GlobalHeader";
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
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <GlobalHeader />
      {!compactFieldView && sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="flex flex-1 flex-col sm:flex-row">
        {!compactFieldView ? (
          <>
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="mx-4 mb-2 mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 sm:hidden"
            >
              ☰ Menu
            </button>
            <div
              className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-neutral-50 transition-transform sm:static sm:z-auto sm:w-56 sm:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </>
        ) : null}
            <main className={`app-page-enter flex-1 overflow-auto p-4 sm:p-6 ${compactFieldView ? "pb-24 sm:pb-6" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
