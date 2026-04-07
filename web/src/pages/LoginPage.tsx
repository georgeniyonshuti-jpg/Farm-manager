import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { LaborerLocale } from "../i18n/laborerI18n";
import {
  LABORER_UI_LOCALE_KEY,
  TranslatedPublicText,
  usePreLoginRwT,
} from "../i18n/laborerI18n";

function readLoginLocale(): LaborerLocale {
  try {
    const v = sessionStorage.getItem(LABORER_UI_LOCALE_KEY);
    return v === "en" ? "en" : "rw";
  } catch {
    return "rw";
  }
}

function persistLoginLocale(l: LaborerLocale) {
  try {
    sessionStorage.setItem(LABORER_UI_LOCALE_KEY, l);
  } catch {
    /* ignore */
  }
}

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
    hint: "ClevaCredit + memos",
    email: "investor@demo.com",
    password: "demo",
  },
] as const;

function DemoAccountRow({
  account,
  locale,
  busy,
  onPick,
}: {
  account: (typeof DEMO_ACCOUNTS)[number];
  locale: LaborerLocale;
  busy: boolean;
  onPick: () => void;
}) {
  const label = usePreLoginRwT(account.label, locale);
  const hint = usePreLoginRwT(account.hint, locale);
  const emailLbl = usePreLoginRwT("Email:", locale);
  const passLbl = usePreLoginRwT("Password:", locale);
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        className="flex w-full min-h-[52px] flex-col items-stretch rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm transition hover:border-emerald-700 hover:bg-emerald-50/80 disabled:opacity-60"
      >
        <span className="font-semibold text-neutral-900">{label}</span>
        <span className="text-xs text-neutral-600">{hint}</span>
        <span className="mt-1 font-mono text-xs text-neutral-800">
          <span className="text-neutral-500">{emailLbl}</span> {account.email}
        </span>
        <span className="font-mono text-xs text-neutral-800">
          <span className="text-neutral-500">{passLbl}</span> {account.password}
        </span>
      </button>
    </li>
  );
}

export function LoginPage() {
  const { login, user, bootstrapped } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? "/";

  const [loginLocale, setLoginLocale] = useState<LaborerLocale>(readLoginLocale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadingLbl = usePreLoginRwT("Loading…", loginLocale);
  const brandTitle = usePreLoginRwT("Precision Poultry & ClevaCredit", loginLocale);
  const secureSignIn = usePreLoginRwT("Secure sign-in", loginLocale);
  const lblEmail = usePreLoginRwT("Email", loginLocale);
  const lblPassword = usePreLoginRwT("Password", loginLocale);
  const credNote = usePreLoginRwT(
    "Credentials are sent over POST only; demo server uses in-memory sessions (not for production).",
    loginLocale
  );
  const btnSigningIn = usePreLoginRwT("Signing in…", loginLocale);
  const btnSignIn = usePreLoginRwT("Sign in", loginLocale);
  const demoHeader = usePreLoginRwT("Demo — tap to sign in", loginLocale);
  const lblRw = usePreLoginRwT("Ikinyarwanda", loginLocale);
  const lblEn = usePreLoginRwT("English", loginLocale);
  const ariaLang = usePreLoginRwT("Screen language", loginLocale);

  const pickLocale = (l: LaborerLocale) => {
    setLoginLocale(l);
    persistLoginLocale(l);
  };

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-600">
        {loadingLbl}
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const signIn = async (credEmail: string, credPassword: string) => {
    setError(null);
    setBusy(true);
    try {
      await login({ email: credEmail.trim(), password: credPassword });
      navigate(from, { replace: true });
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
    <div className="flex min-h-screen flex-col justify-center bg-neutral-100 px-4 py-8">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div
          className="mb-6 flex justify-center"
          role="group"
          aria-label={ariaLang}
        >
          <div className="flex rounded-lg border border-emerald-200 bg-emerald-50/80 p-0.5 text-xs font-semibold">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${loginLocale === "rw" ? "bg-emerald-800 text-white shadow" : "text-emerald-900"}`}
              onClick={() => pickLocale("rw")}
            >
              {lblRw}
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 ${loginLocale === "en" ? "bg-emerald-800 text-white shadow" : "text-emerald-900"}`}
              onClick={() => pickLocale("en")}
            >
              {lblEn}
            </button>
          </div>
        </div>

        <h1 className="text-center text-xl font-semibold tracking-tight text-neutral-900">
          {brandTitle}
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-500">{secureSignIn}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
              {lblEmail}
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
              {lblPassword}
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
          <p className="text-xs text-neutral-500">{credNote}</p>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              <TranslatedPublicText text={error} locale={loginLocale} />
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-800 py-3 text-base font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
          >
            {busy ? btnSigningIn : btnSignIn}
          </button>
        </form>

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {demoHeader}
          </p>
          <ul className="mt-3 space-y-2">
            {DEMO_ACCOUNTS.map((d) => (
              <DemoAccountRow
                key={d.id}
                account={d}
                locale={loginLocale}
                busy={busy}
                onPick={() => void handleDemoClick(d)}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
