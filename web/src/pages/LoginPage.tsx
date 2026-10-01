import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { captureIdpFromLocation, fetchClevaSsoStatus } from "../auth/ClevaOAuth";
import { ContinueWithCleva } from "../components/ContinueWithCleva";
import { resolveUserCompanySlug } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import { BrandLogo } from "../components/BrandLogo";
import { PasswordInput } from "../components/PasswordInput";
import {
  LABORER_UI_LOCALE_KEY,
  usePreLoginRwT,
  type LaborerLocale,
  writePreLoginLocale,
} from "../i18n/laborerI18n";

const pill =
  "bounce-tap h-7 min-w-[2.1rem] rounded-md px-2 text-[11px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]/40";

function PreLoginLanguageToggle({
  locale,
  onLocaleChange,
  ariaLabel,
}: {
  locale: LaborerLocale;
  onLocaleChange: (l: LaborerLocale) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={`${pill} ${locale === "en" ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
        onClick={() => onLocaleChange("en")}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={`${pill} ${locale === "rw" ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
        onClick={() => onLocaleChange("rw")}
        aria-pressed={locale === "rw"}
      >
        RW
      </button>
    </div>
  );
}

function LoginCreatePaths({ locale }: { locale: LaborerLocale }) {
  const tAccount = usePreLoginRwT("Create account", locale);
  const tAccountWho = usePreLoginRwT("Buyer & seller", locale);
  const tWorkspace = usePreLoginRwT("Create workspace", locale);
  const tWorkspaceWho = usePreLoginRwT("Full Clevafarm", locale);
  const row =
    "flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-[var(--text-secondary)] no-underline hover:bg-[var(--primary-color)]/5 hover:text-[var(--primary-color)]";

  return (
    <>
      <Link to="/signup?from=market" className={row}>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{tAccount}</span>
        <span className="text-xs text-[var(--text-muted)]">{tAccountWho}</span>
      </Link>
      <Link to="/signup?workspace=1" className={row}>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{tWorkspace}</span>
        <span className="text-xs text-[var(--text-muted)]">{tWorkspaceWho}</span>
      </Link>
    </>
  );
}

function LoginMorePaths({ locale }: { locale: LaborerLocale }) {
  const [open, setOpen] = useState(false);
  const tMore = usePreLoginRwT("More", locale);
  const tLess = usePreLoginRwT("Less", locale);

  return (
    <div className="text-center">
      <button
        type="button"
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? tLess : tMore}
      </button>
      {open ? (
        <div className="mt-2 space-y-0.5 rounded-xl border border-[var(--border-color)] px-1.5 py-1.5 text-left">
          <LoginCreatePaths locale={locale} />
        </div>
      ) : null}
    </div>
  );
}

export function LoginPage() {
  const { login, user, bootstrapped } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [preLocale, setPreLocale] = useState<LaborerLocale>(() => {
    try {
      const v = localStorage.getItem(LABORER_UI_LOCALE_KEY) ?? sessionStorage.getItem(LABORER_UI_LOCALE_KEY);
      return v === "rw" ? "rw" : "en";
    } catch {
      return "en";
    }
  });

  const tLanguage = usePreLoginRwT("Language", preLocale);
  const tEmail = usePreLoginRwT("Email", preLocale);
  const tPassword = usePreLoginRwT("Password", preLocale);
  const tSignIn = usePreLoginRwT("Sign in", preLocale);
  const tSigningIn = usePreLoginRwT("Signing in…", preLocale);
  const tForgot = usePreLoginRwT("Forgot password?", preLocale);
  const tOr = usePreLoginRwT("or", preLocale);
  const tLoading = usePreLoginRwT("Loading…", preLocale);
  const tSignInFailed = usePreLoginRwT("Sign-in failed", preLocale);
  const tClevaNoCompanies = usePreLoginRwT(
    "Your Cleva account has no Farm-enabled company on this site. Enable Farm Manager for a company in ERPNext, then try Continue with Cleva again.",
    preLocale
  );
  const tClevaFailed = usePreLoginRwT(
    "Cleva login failed. Please try again or use your Farm password.",
    preLocale
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-locale", preLocale);
  }, [preLocale]);

  useEffect(() => {
    captureIdpFromLocation();
    void fetchClevaSsoStatus().then(setSsoEnabled);

    const result = new URLSearchParams(window.location.search).get("cleva");
    if (!result) return;
    window.history.replaceState({}, "", "/login");
    if (result === "no_companies") {
      setError(tClevaNoCompanies);
    } else if (result === "failed") {
      setError(tClevaFailed);
    }
  }, [tClevaFailed, tClevaNoCompanies]);

  const pickLocale = (l: LaborerLocale) => {
    setPreLocale(l);
    writePreLoginLocale(l);
  };

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] text-[var(--text-secondary)]">
        {tLoading}
      </div>
    );
  }

  if (user) {
    return <Navigate to={defaultHomeForUser(user.role, resolveUserCompanySlug(user), user.pageAccess)} replace />;
  }

  const signIn = async (credEmail: string, credPassword: string) => {
    setError(null);
    setBusy(true);
    try {
      const u = await login({ email: credEmail.trim(), password: credPassword });
      navigate(defaultHomeForUser(u.role, resolveUserCompanySlug(u), u.pageAccess), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : tSignInFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(email, password);
  };

  return (
    <div className="locale-fade flex min-h-screen flex-col justify-center bg-[var(--background-color)] px-4 py-6">
      <div className="relative mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-6 pb-6 pt-5 shadow-[var(--shadow-card)]">
        <div className="absolute right-4 top-4">
          <PreLoginLanguageToggle locale={preLocale} onLocaleChange={pickLocale} ariaLabel={tLanguage} />
        </div>
        <div className="flex justify-center">
          <BrandLogo size={44} className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]" />
        </div>
        <h1 className="mt-2 text-center text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Clevafarm
        </h1>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              {tEmail}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-2.5 text-[var(--text-primary)] shadow-sm focus:border-[var(--primary-color)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/30"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">
                {tPassword}
              </label>
              <Link to="/forgot-password" className="text-xs text-[var(--primary-color)] hover:underline">
                {tForgot}
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="py-2.5"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bounce-tap w-full rounded-xl bg-[var(--primary-color)] py-2.5 text-base font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
          >
            {busy ? tSigningIn : tSignIn}
          </button>
          {ssoEnabled && (
            <>
              <div className="relative py-0.5 text-center text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <span className="relative z-10 bg-[var(--surface-card)] px-3">{tOr}</span>
                <span className="absolute inset-x-0 top-1/2 border-t border-[var(--border-color)]" />
              </div>
              <ContinueWithCleva
                disabled={busy}
                email={email}
                onBusyChange={setBusy}
                onError={setError}
                extraOptions={<LoginCreatePaths locale={preLocale} />}
              />
            </>
          )}
          {!ssoEnabled ? <LoginMorePaths locale={preLocale} /> : null}
        </form>
      </div>
    </div>
  );
}
