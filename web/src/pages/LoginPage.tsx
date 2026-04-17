import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import { BrandLogo } from "../components/BrandLogo";

export function LoginPage() {
  const { login, user, bootstrapped } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-600">
        Loading…
      </div>
    );
  }

  if (user) {
    return <Navigate to={defaultHomeForUser(user.role)} replace />;
  }

  const signIn = async (credEmail: string, credPassword: string) => {
    setError(null);
    setBusy(true);
    try {
      const u = await login({ email: credEmail.trim(), password: credPassword });
      navigate(defaultHomeForUser(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(email, password);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[var(--background-color)] px-4 py-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--border-color)] bg-white p-8 shadow-sm lg:p-10">
        <div className="mb-2 flex justify-center">
          <BrandLogo size={66} />
        </div>
        <h1 className="text-center text-xl font-semibold tracking-tight text-neutral-900">
          Clevafarm
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-500">Secure sign-in</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-neutral-900 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-neutral-900 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>
          <p className="text-xs text-neutral-500">Credentials are sent over POST only.</p>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bounce-tap w-full rounded-xl bg-[var(--primary-color)] py-3 text-base font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

      </div>
    </div>
  );
}
