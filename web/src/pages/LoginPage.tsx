import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { captureIdpFromLocation, fetchClevaSsoStatus } from "../auth/ClevaOAuth";
import { ContinueWithCleva } from "../components/ContinueWithCleva";
import { resolveUserCompanySlug } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import { BrandLogo } from "../components/BrandLogo";
import { PasswordInput } from "../components/PasswordInput";
import { clevaMarketWhatsapp, waMeHref } from "../lib/marketWhatsapp";
import { isMarketHostname } from "../lib/marketHost";
import {
  LABORER_UI_LOCALE_KEY,
  usePreLoginRwT,
  type LaborerLocale,
  writePreLoginLocale,
} from "../i18n/laborerI18n";

function LoginCreatePaths({ locale }: { locale: LaborerLocale }) {
  const tAccount = usePreLoginRwT("Create account", locale);
  const tAccountWho = usePreLoginRwT("Seller, buyer & scout", locale);
  const tWorkspace = usePreLoginRwT("Create workspace", locale);
  const tWorkspaceWho = usePreLoginRwT("Full Clevafarm", locale);
  const onMarket =
    typeof window !== "undefined" && isMarketHostname(window.location.hostname);
  const row =
    "flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-[var(--text-secondary)] no-underline hover:bg-[var(--primary-color)]/5 hover:text-[var(--primary-color)]";

  return (
    <>
      <Link to="/signup?from=market" className={row}>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{tAccount}</span>
        <span className="text-xs text-[var(--text-muted)]">{tAccountWho}</span>
      </Link>
      {!onMarket ? (
        <Link to="/signup?workspace=1" className={row}>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{tWorkspace}</span>
          <span className="text-xs text-[var(--text-muted)]">{tWorkspaceWho}</span>
        </Link>
      ) : null}
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
  const tChat = usePreLoginRwT("Chat with us", preLocale);
  const whatsappHref = waMeHref(
    clevaMarketWhatsapp(),
    preLocale === "rw" ? "Ndashaka ubufasha mu kwinjira." : "I need help signing in."
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
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-6 pb-6 pt-5 shadow-[var(--shadow-card)]">
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
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-color)] pt-4 text-sm">
          <p className="flex items-center gap-2">
            <button
              type="button"
              className={preLocale === "en" ? "font-semibold text-[var(--primary-color)]" : "text-[var(--text-muted)]"}
              aria-pressed={preLocale === "en"}
              onClick={() => pickLocale("en")}
            >
              English
            </button>
            <span className="text-[var(--border-color)]" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className={preLocale === "rw" ? "font-semibold text-[var(--primary-color)]" : "text-[var(--text-muted)]"}
              aria-pressed={preLocale === "rw"}
              onClick={() => pickLocale("rw")}
            >
              Ikinyarwanda
            </button>
          </p>
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-[#128C7E]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path
                  fill="currentColor"
                  d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                />
              </svg>
              {tChat}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
