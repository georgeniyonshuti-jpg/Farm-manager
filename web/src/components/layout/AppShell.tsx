import { Outlet } from "react-router-dom";
import { useLocation } from "react-router-dom";
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
  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <GlobalHeader />
      <div className="flex flex-1 flex-col sm:flex-row">
        {!compactFieldView ? <SidebarNav /> : null}
        <main className={`flex-1 overflow-auto p-4 sm:p-6 ${compactFieldView ? "pb-24 sm:pb-6" : ""}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
