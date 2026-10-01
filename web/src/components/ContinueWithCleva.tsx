import { useEffect, useRef, useState, type ReactNode } from "react";
import { API_BASE_URL } from "../api/config";
import { beginClevaLogin, captureIdpFromLocation } from "../auth/ClevaOAuth";

const LAST_IDP_KEY = "cleva-farm-last-idp";

const COMPANION_FIRST_LABELS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "pos",
  "farm",
  "farmapi",
  "bi",
  "meta",
  "insights",
  "crm",
  "helpdesk",
  "builder",
  "studio",
  "portal",
  "billing",
  "login",
  "auth",
  "oauth",
  "sso",
  "signup",
]);

type Props = {
  disabled?: boolean;
  /** Login-form email is display-only. It must not pick a tenant IdP. */
  email?: string;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
  extraOptions?: ReactNode;
};

function isCompanionOrInvalidIdp(idp: string | undefined | null): boolean {
  if (!idp) return true;
  try {
    const url = new URL(idp);
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length < 3) return true;
    const first = labels[0]!;
    if (COMPANION_FIRST_LABELS.has(first)) return true;
    if (labels.length >= 4 && (labels[1] === "pos" || labels[1] === "farm")) return true;
    return false;
  } catch {
    return true;
  }
}

function slugFromIdp(idp: string | undefined): string {
  if (!idp) return "";
  try {
    const host = new URL(idp).hostname.toLowerCase();
    const first = host.split(".").filter(Boolean)[0] || "";
    if (!first || COMPANION_FIRST_LABELS.has(first) || first === "erp") return "";
    return first;
  } catch {
    return "";
  }
}

function readUrlIdp(): string | undefined {
  const idp = new URLSearchParams(window.location.search).get("idp")?.trim();
  if (!idp || isCompanionOrInvalidIdp(idp)) return undefined;
  return idp;
}

function readSessionIdp(): string | undefined {
  const value = captureIdpFromLocation()?.trim();
  if (!value || isCompanionOrInvalidIdp(value)) return undefined;
  return value;
}

function readLastIdp(): string | undefined {
  try {
    const value = localStorage.getItem(LAST_IDP_KEY)?.trim();
    if (!value || isCompanionOrInvalidIdp(value)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Known tenant only: ?idp= / session from that landing.
 * Never guess from login-form email or last-used IdP.
 */
export function ContinueWithCleva({
  disabled,
  label = "Continue with Cleva",
  onBusyChange,
  onError,
  extraOptions,
}: Props) {
  const [showSite, setShowSite] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [siteHint, setSiteHint] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const setBusyState = (next: boolean) => {
    setBusy(next);
    onBusyChange?.(next);
  };

  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const openSubdomainPanel = (hint?: string) => {
    setSiteHint(hint ?? "");
    setShowSite(true);
    setShowMore(false);
    setBusyState(false);
  };

  const startOAuth = async (idp?: string) => {
    setBusyState(true);
    setError(null);
    try {
      if (idp && isCompanionOrInvalidIdp(idp)) {
        throw new Error("That site is not a valid company desk URL.");
      }
      if (idp) {
        try {
          localStorage.setItem(LAST_IDP_KEY, idp);
        } catch {
          /* ignore */
        }
      }
      await beginClevaLogin(idp);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Cleva login could not start");
      setBusyState(false);
    }
  };

  useEffect(() => {
    if (autoStarted.current || disabled) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("cleva")) {
      const idp = readUrlIdp();
      if (idp) captureIdpFromLocation();
      return;
    }
    const idp = readUrlIdp();
    if (!idp) {
      const invalid = params.get("idp")?.trim();
      if (invalid) {
        openSubdomainPanel("That company link was invalid.");
      }
      return;
    }
    autoStarted.current = true;
    const slug = slugFromIdp(idp);
    if (slug) setSubdomain(slug);
    void startOAuth(idp);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount for ?idp=
  }, [disabled]);

  const onContinue = async () => {
    setBusyState(true);
    setError(null);
    setSiteHint("");
    try {
      const known = readUrlIdp() || readSessionIdp();
      if (known) {
        await startOAuth(known);
        return;
      }
      const lastSlug = slugFromIdp(readLastIdp());
      if (lastSlug && !subdomain) setSubdomain(lastSlug);
      openSubdomainPanel();
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Could not start Cleva login");
      setBusyState(false);
    }
  };

  const onContinueWithSubdomain = async () => {
    setBusyState(true);
    setError(null);
    try {
      const sub = subdomain.trim().toLowerCase();
      if (!sub) {
        reportError("Enter your company.");
        setBusyState(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/auth/cleva/resolve-subdomain`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: sub }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        idp?: string;
        error?: string;
      };
      if (!data.found || !data.idp || isCompanionOrInvalidIdp(data.idp)) {
        reportError(data.error ?? "Invalid company subdomain.");
        setBusyState(false);
        return;
      }
      await startOAuth(data.idp);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Could not start Cleva login");
      setBusyState(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void onContinue()}
        className="bounce-tap w-full rounded-xl border border-[var(--primary-color)] bg-transparent py-2.5 text-base font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/5 disabled:opacity-60"
      >
        {busy ? "Continuing…" : label}
      </button>

      {showSite ? (
        <div className="space-y-2 rounded-xl border border-[var(--border-color)] p-3 text-left">
          {siteHint ? <p className="text-xs text-[var(--text-muted)]">{siteHint}</p> : null}
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Company
            <input
              type="text"
              autoComplete="organization"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="yourcompany"
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || !subdomain.trim()}
              onClick={() => void onContinueWithSubdomain()}
              className="bounce-tap w-full rounded-xl bg-[var(--primary-color)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Continuing…" : "Continue"}
            </button>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={busy}
                className="text-xs text-[var(--text-muted)]"
                onClick={() => {
                  setShowSite(false);
                  setSiteHint("");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                onClick={() => void startOAuth()}
              >
                Operators
              </button>
            </div>
          </div>
        </div>
      ) : extraOptions ? (
        <div className="text-center">
          <button
            type="button"
            disabled={busy}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? "Less" : "More"}
          </button>
          {showMore ? (
            <div className="mt-2 space-y-0.5 rounded-xl border border-[var(--border-color)] px-1.5 py-1.5 text-left">
              {extraOptions}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
    </div>
  );
}
