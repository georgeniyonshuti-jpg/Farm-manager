import { Link } from "react-router-dom";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";

export function TrialExpiredPage() {
  const { company } = useOnboardingStatus();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Your trial has ended</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {company?.name ? `${company.name}'s ` : ""}
          14-day trial is over. Upgrade to keep using Clevafarm.
        </p>
        <Link
          to="/billing/pricing"
          className="mt-6 inline-block rounded-lg bg-[var(--primary-color)] px-6 py-3 text-sm font-semibold text-white"
        >
          Upgrade now
        </Link>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Questions?{" "}
          <a href="mailto:support@clevacredit.com" className="underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
