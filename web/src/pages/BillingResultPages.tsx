import { Link } from "react-router-dom";

export function BillingSuccessPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-card text-center">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Subscription updated</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Thank you — your plan is active. You can return to your workspace.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export function BillingCancelledPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-card text-center">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Checkout cancelled</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        No charges were made. You can upgrade anytime from pricing.
      </p>
      <Link
        to="/billing/pricing"
        className="mt-6 inline-block rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white"
      >
        View plans
      </Link>
    </div>
  );
}
