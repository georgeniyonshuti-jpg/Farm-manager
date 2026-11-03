import { useAuth } from "../auth/AuthContext";
import { canAccessWorkspace, isSuperuser } from "../auth/permissions";
import type { ActiveWorkspace } from "../auth/types";

/**
 * Workspace check for persistently mounted pages — returns null when denied
 * (does not redirect; avoids hijacking navigation from hidden slots).
 */
export function PersistentWorkspaceGate({
  workspace,
  workspaces,
  children,
}: {
  workspace?: ActiveWorkspace;
  workspaces?: ActiveWorkspace[];
  children: React.ReactNode;
}) {
  const { user, bootstrapped } = useAuth();
  const allowed = workspaces ?? (workspace ? [workspace] : []);

  if (!bootstrapped || !user) return null;
  if (isSuperuser(user) || allowed.some((item) => canAccessWorkspace(user, item))) {
    return <>{children}</>;
  }

  return null;
}
