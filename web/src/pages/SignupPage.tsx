import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api/config";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import type { SessionUser } from "../auth/types";

type SignupForm = {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  confirmPw: string;
};

export function SignupPage() {
  const navigate = useNavigate();
  const { user, bootstrapped, establishSession } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<SignupForm>({
    companyName: "",
    fullName: "",
    email: "",
    password: "",
    confirmPw: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to={defaultHomeForUser(user.role)} replace />;
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
          companyName: form.companyName.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      const body = (await res.json()) as { token?: string; user?: SessionUser; error?: string };
      if (!res.ok || !body.token || !body.user) {
        throw new Error(body.error ?? "Failed to create workspace.");
      }
      establishSession(body.token, body.user);
      setStep(3);
      setTimeout(() => navigate("/welcome", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-emerald-950/30 to-[var(--background-color)] px-4 py-8">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex justify-center">
          <BrandLogo size={64} />
        </div>
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">Create your workspace</h1>
        <p className="mt-1 text-center text-sm text-[var(--text-muted)]">14-day free trial · no card required</p>

        <div className="mt-6 flex justify-center gap-2 text-xs text-[var(--text-muted)]">
          <span className={step >= 1 ? "font-semibold text-[var(--primary-color)]" : ""}>1 Company</span>
          <span>→</span>
          <span className={step >= 2 ? "font-semibold text-[var(--primary-color)]" : ""}>2 Account</span>
          <span>→</span>
          <span className={step === 3 ? "font-semibold text-[var(--primary-color)]" : ""}>3 Done</span>
        </div>

        {step === 3 ? (
          <p className="mt-8 text-center text-[var(--text-secondary)]">Your workspace is ready. Redirecting…</p>
        ) : (
          <form
            onSubmit={(e) => {
              if (step === 1) {
                e.preventDefault();
                if (!form.companyName.trim()) {
                  setError("Company name is required.");
                  return;
                }
                setError(null);
                setStep(2);
                return;
              }
              void handleSubmit(e);
            }}
            className="mt-6 space-y-4"
          >
            {step === 1 ? (
              <div>
                <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Farm / company name
                </label>
                <input
                  id="companyName"
                  required
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
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
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
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
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPw" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                    Confirm password
                  </label>
                  <input
                    id="confirmPw"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.confirmPw}
                    onChange={(e) => setForm((f) => ({ ...f, confirmPw: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
              </>
            )}
            {error ? (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              {step === 2 ? (
                <button
                  type="button"
                  className="rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-[var(--primary-color)] py-3 font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Creating…" : step === 1 ? "Continue" : "Create workspace"}
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
