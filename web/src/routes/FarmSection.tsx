import { Outlet } from "react-router-dom";
import { WorkspaceGate } from "./ProtectedRoute";

export function FarmSection() {
  return (
    <WorkspaceGate workspace="farm">
      <Outlet />
    </WorkspaceGate>
  );
}
