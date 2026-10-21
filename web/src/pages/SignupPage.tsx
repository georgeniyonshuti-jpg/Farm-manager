import { useState, type FormEvent, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../api/config";
import { claimFarmProfile } from "../api/pipeline.api";
import { fetchClaimPreview, type ClaimPreview } from "../api/publicMarket.api";
import { BrandLogo } from "../components/BrandLogo";
import { DistrictSelect } from "../components/DistrictSelect";
import { PasswordInput } from "../components/PasswordInput";
import { ContinueWithCleva } from "../components/ContinueWithCleva";
import { useAuth } from "../auth/AuthContext";
import { fetchClevaSsoStatus } from "../auth/ClevaOAuth";
import { useBillingPlans } from "../hooks/useBillingPlans";
import { formatRwf } from "../lib/formatRwf";
import { readSellerApply } from "../lib/sellerApply";
import { recordMarketReach, signupAttributionPayload } from "../lib/marketReach";
import { isAdOrMarketSignupSearch } from "../lib/signupAttribution";
import { isMarketHostname, isWorkspaceSignupSearch } from "../lib/marketHost";
import { clevaMarketWhatsapp, waMeHref } from "../lib/marketWhatsapp";
import { tenantPath } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import type { SessionUser } from "../auth/types";
import {
  LABORER_UI_LOCALE_KEY,
  usePreLoginRwT,
  type LaborerLocale,
  writePreLoginLocale,
} from "../i18n/laborerI18n";

function Tr({ locale, text }: { locale: LaborerLocale; text: string }) {
  return <>{usePreLoginRwT(text, locale)}</>;
}

type AccountType = "farmer" | "buyer" | "scout";

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
  const host =
    typeof window !== "undefined" ? window.location.hostname : "";
  const onMarketHost = isMarketHostname(host);
  const wantWorkspaceExplicit = isWorkspaceSignupSearch(params.toString());
  // On market.cleva.rw, bare /signup is always seller/buyer/scout (ads often drop query params).
  const fromMarket =
    !wantWorkspaceExplicit &&
    (onMarketHost ||
      isAdOrMarketSignupSearch(params.toString()) ||
      Boolean(params.get("claim")) ||
      Boolean(params.get("t")));
  const claimToken = params.get("claim") || "";
  const crmToken = params.get("t") || "";
  const typeParam = params.get("accountType");
  const wantWorkspace = !fromMarket && typeParam !== "buyer";
  const { user, token, bootstrapped, establishSession } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    typeParam === "buyer" || typeParam === "farmer" || typeParam === "scout" ? 2 : 1
  );
  const [form, setForm] = useState<SignupForm>({
    accountType: typeParam === "buyer" ? "buyer" : typeParam === "scout" ? "scout" : "farmer",
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
  const [claimPreview, setClaimPreview] = useState<ClaimPreview | null>(null);
  const [claimNote, setClaimNote] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [preLocale, setPreLocale] = useState<LaborerLocale>(() => {
    try {
      const v = localStorage.getItem(LABORER_UI_LOCALE_KEY) ?? sessionStorage.getItem(LABORER_UI_LOCALE_KEY);
      return v === "rw" ? "rw" : "en";
    } catch {
      return "en";
    }
  });
  const { plans } = useBillingPlans();

  useEffect(() => {
    void fetchClevaSsoStatus().then(setSsoEnabled);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-locale", preLocale);
  }, [preLocale]);

  useEffect(() => {
    if (!fromMarket) return;
    recordMarketReach("join_started", window.location.search);
  }, [fromMarket]);

  useEffect(() => {
    if (params.get("accountType") === "scout") return;
    const draft = readSellerApply();
    if (!draft) return;
    setForm((f) => ({
      ...f,
      fullName: f.fullName || draft.contactName,
      companyName: f.companyName || draft.contactName,
      phone: f.phone || draft.phone,
      district: f.district || draft.district,
    }));
  }, [params]);

  useEffect(() => {
    if (!crmToken) return;
    let cancelled = false;
    void fetch(`${API_BASE_URL}/api/auth/crm-signup?t=${encodeURIComponent(crmToken)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          accountType?: AccountType;
          fullName?: string;
          phone?: string;
          district?: string;
          companyName?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "This signup link is not valid.");
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          accountType: body.accountType || f.accountType,
          fullName: f.fullName || body.fullName || "",
          companyName: f.companyName || body.companyName || body.fullName || "",
          phone: f.phone || body.phone || "",
          district: f.district || body.district || "",
        }));
        if (body.accountType) setStep(2);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This signup link is not valid.");
      });
    return () => {
      cancelled = true;
    };
  }, [crmToken]);

  useEffect(() => {
    if (!claimToken) return;
    let cancelled = false;
    void fetchClaimPreview(claimToken)
      .then((preview) => {
        if (!cancelled) {
          setClaimPreview(preview);
          setClaimNote(null);
        }
      })
      .catch((err: Error & { preview?: ClaimPreview }) => {
        if (cancelled) return;
        setClaimPreview(err.preview || null);
        setClaimNote(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [claimToken]);

  useEffect(() => {
    if (!user || !token || !claimToken) return;
    let cancelled = false;
    setClaiming(true);
    void claimFarmProfile(token, claimToken)
      .then(() => {
        if (cancelled) return;
        const slug = user.companySlug;
        navigate(slug ? tenantPath(slug, "market/listings") : "/market/listings", { replace: true });
      })
      .catch((err: Error) => {
        if (!cancelled) setClaimNote(err.message);
      })
      .finally(() => {
        if (!cancelled) setClaiming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, token, claimToken, navigate]);

  useEffect(() => {
    if (typeParam === "buyer" || typeParam === "farmer" || typeParam === "scout") {
      setForm((f) => ({ ...f, accountType: typeParam }));
    }
  }, [typeParam]);

  const isBuyer = form.accountType === "buyer";
  const isScout = form.accountType === "scout";
  const heading =
    step === 4
      ? "Account created"
      : step === 3
        ? "Your login"
        : step === 2
          ? isBuyer
            ? "Your business"
            : isScout
              ? "Join as a scout"
              : fromMarket
                ? "Your seller account"
                : "Your farm"
    : fromMarket
      ? claimToken
        ? "Claim your flock"
        : "Create an account"
      : "Full Clevafarm";
  const headingText = usePreLoginRwT(heading, preLocale);
  const whatsappHref = waMeHref(
    clevaMarketWhatsapp(),
    preLocale === "rw"
      ? "Ndashaka kwiyandikisha nk'umucuruzi / umuguzi / scout. Link: https://market.cleva.rw/signup?from=market&utm_source=whatsapp"
      : "I want to register as a seller, buyer, or scout. Link: https://market.cleva.rw/signup?from=market&utm_source=whatsapp"
  );

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] text-[var(--text-secondary)]">
        Loading…
      </div>
    );
  }

  if (user && claimToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background-color)] px-4 text-center text-[var(--text-secondary)]">
        <div className="max-w-md space-y-3">
          <p>{claiming ? "Attaching your flock…" : claimNote || "Opening your listings…"}</p>
          {claimPreview?.farmName ? (
            <p className="text-sm">
              {claimPreview.farmName}
              {claimPreview.birdCount ? ` · ${claimPreview.birdCount} birds` : ""}
            </p>
          ) : null}
        </div>
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
          companyName: (form.companyName || form.fullName).trim(),
          businessName: (form.companyName || form.fullName).trim(),
          fullName: (form.fullName || form.companyName).trim(),
          email: form.email.trim(),
          password: form.password,
          district: form.district.trim() || undefined,
          phone: form.phone.trim() || undefined,
          buyerType: form.buyerType,
          from: fromMarket ? "market" : undefined,
          claim: claimToken || undefined,
          crmToken: crmToken || undefined,
          ...(fromMarket ? signupAttributionPayload(window.location.search) : {}),
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
          : body.user.role === "vet"
            ? slug
              ? tenantPath(slug, "farm/pipeline/home")
              : "/farm/pipeline/home"
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

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-emerald-950/30 to-[var(--background-color)] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex justify-center">
          <BrandLogo size={64} />
        </div>
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">{headingText}</h1>
        {claimToken ? (
          <div className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-input)]/40 p-3 text-sm">
            <p className="font-semibold text-[var(--text-primary)]">
              {claimPreview?.farmName ? `Claim ${claimPreview.farmName}` : "Claim your flock"}
            </p>
            <p className="mt-1 text-[var(--text-secondary)]">
              {claimPreview?.birdCount ? `${claimPreview.birdCount} birds` : "Your flock"}
              {claimPreview?.readyFrom ? ` · selling week of ${String(claimPreview.readyFrom).slice(0, 10)}` : ""}
              {claimPreview?.breedCode ? ` · ${claimPreview.breedCode}` : ""}
            </p>
            {claimNote ? <p className="mt-2 text-red-400">{claimNote}</p> : null}
          </div>
        ) : null}

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
            <p>
              {isBuyer
                ? "Opening the market…"
                : isScout
                  ? "Application sent. A manager approves you before you can find sellers."
                  : claimToken
                    ? "Opening your flock…"
                    : "Opening your flocks. They stay private until a manager approves them."}
            </p>
          </div>
        ) : step === 1 ? (
          <div className="mt-8 space-y-3">
            {fromMarket ? (
              <div className="grid gap-3">
                {(
                  [
                    { id: "farmer" as const, title: "Seller", hint: "List birds" },
                    { id: "buyer" as const, title: "Buyer", hint: "Request birds" },
                    { id: "scout" as const, title: "Scout", hint: "Find sellers near you" },
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
                    <p className="font-semibold text-[var(--text-primary)]">
                      <Tr locale={preLocale} text={opt.title} />
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                      <Tr locale={preLocale} text={opt.hint} />
                    </p>
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
              <Tr locale={preLocale} text="Continue" />
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
                  setError(isBuyer ? "Business name is required." : isScout ? "Your name is required." : "Farm name is required.");
                  return;
                }
                if (isScout && (!form.phone.trim() || !form.district.trim())) {
                  setError("Phone and district are required.");
                  return;
                }
                if (isScout) {
                  setForm((f) => ({ ...f, fullName: f.fullName.trim() || f.companyName.trim() }));
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
                    {isBuyer ? (
                      <Tr locale={preLocale} text="Business name" />
                    ) : isScout ? (
                      <Tr locale={preLocale} text="Your name" />
                    ) : (
                      <Tr locale={preLocale} text="Farm / company name" />
                    )}
                  </label>
                  <input
                    id="companyName"
                    required
                    value={form.companyName}
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                  />
                </div>
                {isBuyer || isScout || fromMarket ? (
                  <>
                    {isBuyer ? (
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
                    ) : null}
                    <DistrictSelect
                      id="district"
                      locale={preLocale}
                      value={form.district}
                      onChange={(district) => setForm((f) => ({ ...f, district }))}
                      className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3"
                    />
                    <div>
                      <label
                        htmlFor="phone"
                        className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
                      >
                        <Tr locale={preLocale} text="Phone" />
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
                    <Tr locale={preLocale} text="Your name" />
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
                    <Tr locale={preLocale} text="Email" />
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
                    <Tr locale={preLocale} text="Password" />
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
                    <Tr locale={preLocale} text="Confirm password" />
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
                <Tr locale={preLocale} text="Back" />
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-[var(--primary-color)] py-3 font-semibold text-white disabled:opacity-60"
              >
                {loading ? (
                  <Tr locale={preLocale} text="Creating…" />
                ) : step === 2 ? (
                  <Tr locale={preLocale} text="Continue" />
                ) : (
                  <Tr locale={preLocale} text="Create account" />
                )}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          <Tr locale={preLocale} text="Already have an account?" />{" "}
          <Link to="/login" className="font-semibold text-[var(--text-primary)] underline">
            <Tr locale={preLocale} text="Sign in" />
          </Link>
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--border-color)] pt-4 text-sm">
          <p className="flex items-center gap-2">
            <button
              type="button"
              className={preLocale === "en" ? "font-semibold text-[var(--primary-color)]" : "text-[var(--text-muted)]"}
              aria-pressed={preLocale === "en"}
              onClick={() => {
                setPreLocale("en");
                writePreLoginLocale("en");
              }}
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
              onClick={() => {
                setPreLocale("rw");
                writePreLoginLocale("rw");
              }}
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
              <Tr locale={preLocale} text="Chat with us" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
