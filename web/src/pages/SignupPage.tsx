import { useState, type FormEvent, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../api/config";
import { BrandLogo } from "../components/BrandLogo";
import { DistrictSelect } from "../components/DistrictSelect";
import { PasswordInput } from "../components/PasswordInput";
import { ContinueWithCleva } from "../components/ContinueWithCleva";
import { useAuth } from "../auth/AuthContext";
import { fetchClevaSsoStatus } from "../auth/ClevaOAuth";
import { useBillingPlans } from "../hooks/useBillingPlans";
import { formatRwf } from "../lib/formatRwf";
import { tenantPath } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import type { SessionUser } from "../auth/types";

type AccountType = "farmer" | "buyer";

type SignupForm = {
  accountType: AccountType;
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  confirmPw: string;
  district: string;
  phone: string;
  buyerType: string;
};

export function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromMarket = params.get("from") === "market";
  const typeParam = params.get("accountType");
  const wantWorkspace = !fromMarket && typeParam !== "buyer";
  const { user, bootstrapped, establishSession } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    typeParam === "buyer" || typeParam === "farmer" ? 2 : 1
  );
  const [form, setForm] = useState<SignupForm>({
    accountType: typeParam === "buyer" ? "buyer" : "farmer",
    companyName: params.get("business") || "",
    fullName: params.get("name") || "",
    email: "",
    password: "",
    confirmPw: "",
    district: params.get("district") || "",
    phone: params.get("phone") || "",
    buyerType: "butcher",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const { plans } = useBillingPlans();

  useEffect(() => {
    void fetchClevaSsoStatus().then(setSsoEnabled);
  }, []);

  useEffect(() => {
    if (typeParam === "buyer" || typeParam === "farmer") {
      setForm((f) => ({ ...f, accountType: typeParam }));
    }
  }, [typeParam]);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }

  if (user) {
    return (
      <Navigate
        to={user.companySlug ? defaultHomeForUser(user.role, user.companySlug, user.pageAccess) : "/"}
        replace
      />
    );
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPw) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: form.accountType,
          companyName: form.companyName.trim(),
          businessName: form.companyName.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          district: form.district.trim() || undefined,
          phone: form.phone.trim() || undefined,
          buyerType: form.buyerType,
          from: fromMarket ? "market" : undefined,
        }),
      });
      const body = (await res.json()) as {
        token?: string;
        user?: SessionUser;
        error?: string;
        accountType?: string;
      };
      if (!res.ok || !body.token || !body.user) {
        throw new Error(body.error ?? "Failed to create account.");
      }
      establishSession(body.token, body.user);
      setStep(4);
      const slug = body.user.companySlug;
      const claim = new URLSearchParams(window.location.search).get("claim");
      const claimQ = claim ? `?claim=${encodeURIComponent(claim)}` : "";
      const home =
        body.user.role === "buyer"
          ? slug
            ? tenantPath(slug, "market")
            : "/market"
          : slug
            ? tenantPath(slug, claim ? `market/listings${claimQ}` : "market/pending")
            : "/welcome";
      setTimeout(() => navigate(home, { replace: true }), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const isBuyer = form.accountType === "buyer";
  const heading =
    step === 4
      ? "Account created"
      : step === 3
        ? "Your login"
        : step === 2
          ? isBuyer
            ? "Your business"
            : "Your farm"
          : fromMarket
            ? "Create an account"
            : "Full Clevafarm";

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-emerald-950/30 to-[var(--background-color)] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex justify-center">
          <BrandLogo size={64} />
        </div>
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">{heading}</h1>

        {step < 4 ? (
          <div className="mt-5 flex justify-center gap-1.5" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1 w-8 rounded-full ${step >= n ? "bg-[var(--primary-color)]" : "bg-[var(--border-color)]"}`}
              />
            ))}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-8 space-y-2 text-center text-sm text-[var(--text-secondary)]">
            <p>{isBuyer ? "Opening the market…" : "Cleva will verify you before you can list."}</p>
          </div>
        ) : step === 1 ? (
          <div className="mt-8 space-y-3">
            {fromMarket ? (
              <div className="grid gap-3">
                {(
                  [
                    { id: "farmer" as const, title: "Seller", hint: "List birds" },
                    { id: "buyer" as const, title: "Buyer", hint: "Request birds" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, accountType: opt.id }))}
                    className={`rounded-xl border px-4 py-3.5 text-left transition ${
                      form.accountType === opt.id
                        ? "border-[var(--primary-color)] bg-[var(--primary-color)]/10"
                        : "border-[var(--border-color)] bg-[var(--surface-input)]/40"
                    }`}
                  >
                    <p className="font-semibold text-[var(--text-primary)]">{opt.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{opt.hint}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {wantWorkspace ? (
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Farm plans (30-day trial)
                </p>
                {plans.slice(0, 2).map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-input)]/40 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{plan.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        ${plan.price}/mo ({formatRwf(plan.priceRWF)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <p
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className="w-full rounded-xl bg-[var(--primary-color)] py-3 font-semibold text-white"
            >
              Continue
            </button>
            {!isBuyer && !fromMarket && ssoEnabled ? (
              <>
                <div className="relative py-2 text-center text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <span className="relative z-10 bg-[var(--surface-card)] px-3">or</span>
                  <span className="absolute inset-x-0 top-1/2 border-t border-[var(--border-color)]" />
                </div>
                <ContinueWithCleva
                  disabled={loading}
                  email={form.email}
                  onBusyChange={setLoading}
                  onError={setError}
                />
              </>
            ) : null}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              if (step === 2) {
                e.preventDefault();
                if (!form.companyName.trim()) {
                  setError(isBuyer ? "Business name is required." : "Farm name is required.");
                  return;
                }
                setError(null);
                setStep(3);
                return;
              }
              void handleSubmit(e);
            }}
            className="mt-6 space-y-4"
          >
            {step === 2 ? (
              <>
                <div>
                  <label
                    htmlFor="companyName"
                    className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    {isBuyer ? "Business name" : "Farm / company name"}
                  </label>
                  <input
                    id="companyName"
                    required
                    value={form.companyName}
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
                {isBuyer ? (
                  <>
                    <div>
                      <label
                        htmlFor="buyerType"
                        className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                      >
                        Buyer type
                      </label>
                      <select
                        id="buyerType"
                        value={form.buyerType}
                        onChange={(e) => setForm((f) => ({ ...f, buyerType: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                      >
                        <option value="butcher">Butcher</option>
                        <option value="restaurant">Restaurant</option>
                        <option value="hotel">Hotel</option>
                        <option value="trader">Trader</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <DistrictSelect
                      id="district"
                      value={form.district}
                      onChange={(district) => setForm((f) => ({ ...f, district }))}
                      className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                    />
                    <div>
                      <label
                        htmlFor="phone"
                        className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                      >
                        Phone
                      </label>
                      <input
                        id="phone"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Your name
                  </label>
                  <input
                    id="fullName"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Password
                  </label>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirmPw"
                    className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Confirm password
                  </label>
                  <PasswordInput
                    id="confirmPw"
                    autoComplete="new-password"
                    required
                    value={form.confirmPw}
                    onChange={(e) => setForm((f) => ({ ...f, confirmPw: e.target.value }))}
                  />
                </div>
              </>
            )}
            {error ? (
              <p
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm"
                onClick={() => setStep(step === 3 ? 2 : 1)}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-[var(--primary-color)] py-3 font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Creating…" : step === 2 ? "Continue" : "Create account"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
