import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../api/config";
import { useAuth } from "../auth/AuthContext";
import { PLANS } from "../lib/plans";
import { formatRwf } from "../lib/formatRwf";

export function PricingPage() {
  const { token } = useAuth();
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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Pricing</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          14 days free, no card required. After trial, choose a plan to continue.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-6">
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
            <button
              type="button"
              disabled={loadingPlan === plan.id}
              onClick={() => void startCheckout(plan.id)}
              className="mt-6 w-full rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loadingPlan === plan.id ? "Starting…" : "Start free trial"}
            </button>
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
