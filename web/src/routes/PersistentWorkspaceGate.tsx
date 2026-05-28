import { useAuth } from "../auth/AuthContext";
import { canAccessWorkspace, isSuperuser } from "../auth/permissions";
import type { ActiveWorkspace } from "../auth/types";

/**
 * Workspace check for persistently mounted pages — returns null when denied
 * (does not redirect; avoids hijacking navigation from hidden slots).
 */
export function PersistentWorkspaceGate({
  workspace,
  children,
}: {
  workspace: ActiveWorkspace;
  children: React.ReactNode;
}) {
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped || !user) return null;
  if (!canAccessWorkspace(user, workspace) && !isSuperuser(user)) return null;

  return <>{children}</>;
}
