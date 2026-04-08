import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import { BrandLogo } from "../components/BrandLogo";

const DEMO_ACCOUNTS = [
  {
    id: "superuser",
    label: "Superuser",
    hint: "User admin + full access",
    email: "superuser@demo.com",
    password: "demo",
  },
  {
    id: "management",
    label: "Management",
    hint: "Ops manager — both units, no sensitive $",
    email: "manager@demo.com",
    password: "demo",
  },
  {
    id: "vet",
    label: "Vet",
    hint: "Vet manager — farm",
    email: "vet@demo.com",
    password: "demo",
  },
  {
    id: "laborer",
    label: "Laborer",
    hint: "Coop entry — farm only",
    email: "laborer@demo.com",
    password: "demo",
  },
  {
    id: "investor",
    label: "Investor",
    hint: "Clevafarm finance + memos",
    email: "investor@demo.com",
    password: "demo",
  },
] as const;

function DemoAccountRow({
  account,
  busy,
  onPick,
}: {
  account: (typeof DEMO_ACCOUNTS)[number];
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        className="flex w-full min-h-[52px] flex-col items-stretch rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm transition hover:border-emerald-700 hover:bg-emerald-50/80 disabled:opacity-60"
      >
        <span className="font-semibold text-neutral-900">{account.label}</span>
        <span className="text-xs text-neutral-600">{account.hint}</span>
        <span className="mt-1 font-mono text-xs text-neutral-800">
          <span className="text-neutral-500">Email:</span> {account.email}
        </span>
        <span className="font-mono text-xs text-neutral-800">
          <span className="text-neutral-500">Password:</span> {account.password}
        </span>
      </button>
    </li>
  );
}

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

  const handleDemoClick = async (d: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(d.email);
    setPassword(d.password);
    await signIn(d.email, d.password);
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
          <p className="text-xs text-neutral-500">
            Credentials are sent over POST only; demo server uses in-memory sessions (not for production).
          </p>
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

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Demo — tap to sign in
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((d) => (
              <DemoAccountRow key={d.id} account={d} busy={busy} onPick={() => void handleDemoClick(d)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
