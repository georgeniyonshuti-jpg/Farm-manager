import { Outlet } from "react-router-dom";
import { GlobalHeader } from "./GlobalHeader";
import { SidebarNav } from "./SidebarNav";

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <GlobalHeader />
      <div className="flex flex-1 flex-col sm:flex-row">
        <SidebarNav />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
