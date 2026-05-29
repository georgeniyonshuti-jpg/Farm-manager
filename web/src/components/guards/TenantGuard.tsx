import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { AppLoadingScreen } from "../AppLoadingScreen";

type TenantGuardProps = {
  children: ReactNode;
};

export function TenantGuard({ children }: TenantGuardProps) {
  const { bootstrapped } = useAuth();
  const { slugLoading, slugError, isCorrectTenant, tenantCompany } = useTenant();

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

  if (!isCorrectTenant) return null;

  return <>{children}</>;
}
