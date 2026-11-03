import { Outlet, useLocation } from "react-router-dom";
import { WorkspaceGate } from "./ProtectedRoute";
import { isMarketDeskPath } from "../auth/permissions";
import { stripTenantPrefix } from "../lib/tenancy";

export function FarmSection() {
  const location = useLocation();
  const workspace = isMarketDeskPath(stripTenantPrefix(location.pathname)) ? "market" : "farm";
  return (
    <WorkspaceGate workspace={workspace}>
      <Outlet />
    </WorkspaceGate>
  );
}
