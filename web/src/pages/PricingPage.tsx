import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../api/config";
import { useAuth } from "../auth/AuthContext";
import { useBillingPlans } from "../hooks/useBillingPlans";
import { formatRwf } from "../lib/formatRwf";
import { Button } from "../components/ui/Button";

export function PricingPage() {
  const { token } = useAuth();
  const { plans, loading, error: plansError } = useBillingPlans();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: string): Promise<void> {
    setError(null);
    setLoadingPlan(planId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ planId }),
      });
      const body = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !body.checkoutUrl) throw new Error(body.error ?? "Could not start checkout.");
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-stack p-card">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Pricing</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          30 days free, no card required. After trial, choose a plan to continue.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      {plansError ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{plansError}</p>
      ) : null}
      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading plans…</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] p-card">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
              ${plan.price}
              <span className="text-base font-normal text-[var(--text-muted)]">/mo</span>
            </p>
            <p className="text-sm text-[var(--text-secondary)]">{formatRwf(plan.priceRWF)} / month</p>
            <ul className="mt-4 space-y-1 text-sm text-[var(--text-secondary)]">
              {plan.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            {token ? (
              <Button
                type="button"
                className="mt-4 w-full"
                size="lg"
                disabled={loadingPlan === plan.id}
                loading={loadingPlan === plan.id}
                onClick={() => void startCheckout(plan.id)}
              >
                Upgrade to this plan
              </Button>
            ) : (
              <Link
                to="/signup"
                className="mt-4 block w-full rounded-control bg-[var(--primary-color)] px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Start free trial
              </Link>
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-[var(--text-muted)]">
        <Link to="/login" className="underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
