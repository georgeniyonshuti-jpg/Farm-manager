import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import type { SessionUser, UserRole } from "../auth/types";
import { API_BASE_URL } from "../api/config";
import { jsonAuthHeaders } from "../lib/authHeaders";

export type LaborerLocale = "rw" | "en";

type Ctx = { locale: LaborerLocale; setLocale: (l: LaborerLocale) => void };

const LaborerI18nContext = createContext<Ctx | null>(null);

export const LABORER_UI_LOCALE_KEY = "laborer_ui_locale";

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function txCacheKey(lang: LaborerLocale, text: string): string {
  return `laborer_tx_${lang}_${simpleHash(text)}`;
}

function readStoredLocale(): LaborerLocale {
  try {
    const v = sessionStorage.getItem(LABORER_UI_LOCALE_KEY);
    return v === "rw" ? "rw" : "en";
  } catch {
    return "en";
  }
}

/** True for coop laborers and junior vets (same field UI as laborers). */
export function isLaborerLocaleUser(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "laborer") return true;
  if (user.role === "vet" && user.departmentKeys.includes("junior_vet")) return true;
  return false;
}

function laborerLocaleFromRole(role: UserRole | undefined, departmentKeys: string[]): boolean {
  if (role === "laborer") return true;
  if (role === "vet" && departmentKeys.includes("junior_vet")) return true;
  return false;
}

export function LaborerI18nProvider({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuth();
  const [locale, setLocaleState] = useState<LaborerLocale>(readStoredLocale);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!isLaborerLocaleUser(user)) {
      setLocaleState("en");
      return;
    }
    setLocaleState(readStoredLocale());
  }, [bootstrapped, user]);

  const setLocale = useCallback(
    (l: LaborerLocale) => {
      if (!isLaborerLocaleUser(user)) {
        setLocaleState("en");
        return;
      }
      setLocaleState(l);
      try {
        sessionStorage.setItem(LABORER_UI_LOCALE_KEY, l);
      } catch {
        /* ignore */
      }
    },
    [user]
  );

  const v = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LaborerI18nContext.Provider value={v}>{children}</LaborerI18nContext.Provider>;
}

export function useLaborerI18n(): Ctx {
  const c = useContext(LaborerI18nContext);
  if (!c) throw new Error("LaborerI18nProvider missing");
  return c;
}

export type LaborerTranslationState = {
  text: string;
  isLoading: boolean;
  usedFallback: boolean;
};

/**
 * Laborers only: when locale is Kinyarwanda, translates via Gemini (server). Cached in sessionStorage.
 * Other roles always see English source text.
 */
export function useLaborerTranslation(english: string): LaborerTranslationState {
  const { user, token } = useAuth();
  const { locale } = useLaborerI18n();
  const [text, setText] = useState(english);
  const [isLoading, setIsLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    if (!laborerLocaleFromRole(user?.role, user?.departmentKeys ?? []) || locale === "en") {
      setText(english);
      setIsLoading(false);
      setUsedFallback(false);
      return;
    }
    if (!english) {
      setText("");
      setIsLoading(false);
      setUsedFallback(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setUsedFallback(false);
      try {
        const key = txCacheKey("rw", english);
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            if (!cancelled) {
              setText(cached);
              setIsLoading(false);
            }
            return;
          }
        } catch {
          /* ignore */
        }

        // ENV: moved to environment variable
        const res = await fetch(`${API_BASE_URL}/api/laborer/translate`, {
          method: "POST",
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ text: english, targetLang: "rw" }),
        });
        if (!res.ok) {
          if (!cancelled) {
            setText(english);
            setUsedFallback(true);
            setIsLoading(false);
          }
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { translation?: string };
        const t =
          typeof data.translation === "string" && data.translation.length > 0 ? data.translation : english;
        if (!cancelled) {
          try {
            sessionStorage.setItem(key, t);
          } catch {
            /* quota */
          }
          setText(t);
          setUsedFallback(false);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setText(english);
          setUsedFallback(true);
          setIsLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [english, locale, user?.role, user?.departmentKeys, token]);

  return { text, isLoading, usedFallback };
}

/** Same as {@link useLaborerTranslation} but text only (backward compatible). */
export function useLaborerT(english: string): string {
  return useLaborerTranslation(english).text;
}

/**
 * Sign-in screen copy: when `locale === "rw"`, translate via the public endpoint (no auth).
 * Same sessionStorage cache keys as useLaborerT so laborer sees consistent strings after login.
 */
export function usePreLoginRwT(english: string, locale: LaborerLocale): string {
  const [out, setOut] = useState(english);

  useEffect(() => {
    if (!english) {
      setOut("");
      return;
    }
    if (locale !== "rw") {
      setOut(english);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const key = txCacheKey("rw", english);
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            if (!cancelled) setOut(cached);
            return;
          }
        } catch {
          /* ignore */
        }

        // ENV: moved to environment variable
        const res = await fetch(`${API_BASE_URL}/api/i18n/translate-public`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: english, targetLang: "rw" }),
        });
        const data = (await res.json().catch(() => ({}))) as { translation?: string };
        const t =
          typeof data.translation === "string" && data.translation.length > 0 ? data.translation : english;
        if (!cancelled) {
          try {
            sessionStorage.setItem(key, t);
          } catch {
            /* quota */
          }
          setOut(t);
        }
      } catch {
        if (!cancelled) setOut(english);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [english, locale]);

  return out;
}

/** Authenticated laborer in-app copy (Gemini + cache); others see English. */
export function TranslatedText({ text }: { text: string }) {
  const { text: t, isLoading, usedFallback } = useLaborerTranslation(text);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {isLoading ? (
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent"
          aria-label="Loading translation"
        />
      ) : null}
      <span>{t}</span>
      {usedFallback && !isLoading ? (
        <span
          className="rounded bg-amber-100 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-900"
          title="Translation unavailable — showing English"
        >
          EN
        </span>
      ) : null}
    </span>
  );
}

/** Login or error lines before session exists. */
export function TranslatedPublicText({ text, locale }: { text: string; locale: LaborerLocale }) {
  const t = usePreLoginRwT(text, locale);
  return <>{t}</>;
}
