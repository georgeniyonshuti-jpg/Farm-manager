import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { AppLoadingScreen } from "../AppLoadingScreen";
import { resolveUserCompanySlug } from "../../lib/tenancy";
import { defaultHomeForUser } from "../../routes/ProtectedRoute";

type TenantGuardProps = {
  children: ReactNode;
};

export function TenantGuard({ children }: TenantGuardProps) {
  const { bootstrapped, user } = useAuth();
  const { slugLoading, slugError, isCorrectTenant, tenantCompany } = useTenant();
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    if (isCorrectTenant || slugLoading || slugError || !tenantCompany) {
      setWaitedTooLong(false);
      return;
    }
    // Wrong tenant: TenantContext navigates away — don't spin forever if that stalls.
    const t = window.setTimeout(() => setWaitedTooLong(true), 2500);
    return () => window.clearTimeout(t);
  }, [isCorrectTenant, slugLoading, slugError, tenantCompany]);

  if (!bootstrapped || slugLoading) return <AppLoadingScreen />;

  if (slugError || !tenantCompany) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4">
        <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] p-10 text-center shadow-[var(--shadow-elevated)]">
          <p className="font-display text-5xl leading-none" aria-hidden>
            —
          </p>
          <h2 className="mt-4 font-display text-xl font-bold text-[var(--text-primary)]">
            Workspace not found
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            The company workspace you are looking for does not exist or is no longer active.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-semibold text-[var(--primary-color)] hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (!isCorrectTenant) {
    if (!waitedTooLong) return <AppLoadingScreen />;
    const home =
      user != null
        ? defaultHomeForUser(user.role, resolveUserCompanySlug(user), user.pageAccess)
        : "/login";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4">
        <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] p-10 text-center shadow-[var(--shadow-elevated)]">
          <h2 className="font-display text-xl font-bold text-[var(--text-primary)]">
            Wrong workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This company isn&apos;t linked to your account.
          </p>
          <Link
            to={home}
            className="mt-6 inline-block text-sm font-semibold text-[var(--primary-color)] hover:underline"
          >
            Go to your workspace
          </Link>
          <div className="mt-3">
            <Link to="/login" className="text-xs text-[var(--text-muted)] hover:underline">
              Or sign in again
            </Link>
          </div>
          <div className="mt-4">
            <a href="/sw-reset" className="text-xs text-[var(--text-muted)] hover:underline">
              Clear stuck app cache
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
