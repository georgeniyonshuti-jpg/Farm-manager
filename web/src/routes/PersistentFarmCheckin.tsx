import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  canAccessPathByPageVisibility,
  FARM_FIELD_OPS_ROLES,
  isSuperuser,
} from "../auth/permissions";
import { FarmCheckinPage } from "../pages/farm/FarmCheckinPage";
import { WorkspaceGate } from "./ProtectedRoute";

/**
 * Round check-in kept mounted for the session; visibility toggled via CSS only.
 */
export function PersistentFarmCheckin() {
  const location = useLocation();
  const { user, bootstrapped } = useAuth();
  const active = location.pathname === "/farm/checkin";

  if (!bootstrapped || !user) return null;

  const allowed =
    isSuperuser(user) ||
    (FARM_FIELD_OPS_ROLES.includes(user.role) &&
      canAccessPathByPageVisibility(user, "/farm/checkin"));
  if (!allowed) return null;

  return (
    <div style={{ display: active ? "block" : "none" }} aria-hidden={!active}>
      <WorkspaceGate workspace="farm">
        <FarmCheckinPage />
      </WorkspaceGate>
    </div>
  );
}
