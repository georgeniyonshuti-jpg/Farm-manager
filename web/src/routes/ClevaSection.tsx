import { Outlet } from "react-router-dom";
import { WorkspaceGate } from "./ProtectedRoute";

export function ClevaSection() {
  return (
    <WorkspaceGate workspace="clevacredit">
      <Outlet />
    </WorkspaceGate>
  );
}
