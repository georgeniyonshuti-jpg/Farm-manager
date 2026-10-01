import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { API_BASE_URL } from "../api/config";
import { jsonAuthHeaders } from "../lib/authHeaders";
import { lookupRw } from "./rwDictionary";
import { isLaborerLocaleUser, laborerLocaleFromUser } from "./laborerLocaleUser";

export { isLaborerLocaleUser } from "./laborerLocaleUser";

export type LaborerLocale = "rw" | "en";

type Ctx = { locale: LaborerLocale; setLocale: (l: LaborerLocale) => void };

const LaborerI18nContext = createContext<Ctx | null>(null);

export const LABORER_UI_LOCALE_KEY = "laborer_ui_locale";
export const LOCALE_TOAST_RW_KEY = "cleva_locale_toast_rw";

function readLocaleStorage(): string | null {
  try {
    return localStorage.getItem(LABORER_UI_LOCALE_KEY) ?? sessionStorage.getItem(LABORER_UI_LOCALE_KEY);
  } catch {
    return null;
  }
}

function writeLocaleStorage(value: LaborerLocale): void {
  try {
    localStorage.setItem(LABORER_UI_LOCALE_KEY, value);
    sessionStorage.setItem(LABORER_UI_LOCALE_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Pre-login and post-login locale persistence (login page uses this before auth). */
export function writePreLoginLocale(value: LaborerLocale): void {
  writeLocaleStorage(value);
  document.documentElement.setAttribute("data-locale", value);
}

function hasStoredLocaleChoice(): boolean {
  return readLocaleStorage() !== null;
}

function readStoredLocale(): LaborerLocale {
  try {
    const v = readLocaleStorage();
    return v === "rw" ? "rw" : "en";
  } catch {
    return "en";
  }
}
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

export function LaborerI18nProvider({ children }: { children: React.ReactNode }) {
  const { user, bootstrapped } = useAuth();
  const [locale, setLocaleState] = useState<LaborerLocale>(readStoredLocale);

  useEffect(() => {
    if (!bootstrapped) return;
    if (!isLaborerLocaleUser(user)) {
      setLocaleState("en");
      document.documentElement.removeAttribute("data-locale");
      return;
    }
    if (!hasStoredLocaleChoice() && user?.preferredLanguage === "rw") {
      setLocaleState("rw");
      writeLocaleStorage("rw");
      document.documentElement.setAttribute("data-locale", "rw");
      return;
    }
    const stored = readStoredLocale();
    setLocaleState(stored);
    document.documentElement.setAttribute("data-locale", stored);
  }, [bootstrapped, user]);

  const setLocale = useCallback(
    (l: LaborerLocale) => {
      if (!isLaborerLocaleUser(user)) {
        setLocaleState("en");
        return;
      }
      setLocaleState(l);
      writeLocaleStorage(l);
      document.documentElement.setAttribute("data-locale-switching", "1");
      document.documentElement.setAttribute("data-locale", l);
      window.setTimeout(() => {
        document.documentElement.removeAttribute("data-locale-switching");
      }, 130);
      if (l === "rw") {
        try {
          if (localStorage.getItem(LOCALE_TOAST_RW_KEY) !== "1") {
            localStorage.setItem(LOCALE_TOAST_RW_KEY, "1");
            window.dispatchEvent(
              new CustomEvent("cleva-locale-rw", {
                detail: {
                  message:
                    lookupRw("Murakoze — ururimi rwahinduwe mu Kinyarwanda.") ??
                    "Murakoze — ururimi rwahinduwe mu Kinyarwanda.",
                },
              })
            );
          }
        } catch {
          /* ignore */
        }
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
 * Laborers only: when locale is Kinyarwanda, uses static dictionary first,
 * then falls back to Gemini API translation. Cached in sessionStorage.
 * Other roles always see English source text.
 */
export function useLaborerTranslation(english: string): LaborerTranslationState {
  const { user, token } = useAuth();
  const { locale } = useLaborerI18n();
  const [text, setText] = useState(english);
  const [isLoading, setIsLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    if (!laborerLocaleFromUser(user?.role, user?.departmentKeys ?? [], user?.erpAppRole) || locale === "en") {
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

    const dictHit = lookupRw(english);
    if (dictHit) {
      setText(dictHit);
      setIsLoading(false);
      setUsedFallback(false);
      return;
    }

    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing RW dictionary key: "${english}"`);
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
  }, [english, locale, user?.role, user?.departmentKeys, user?.erpAppRole, token]);

  return { text, isLoading, usedFallback };
}

/** Same as {@link useLaborerTranslation} but text only (backward compatible). */
export function useLaborerT(english: string): string {
  return useLaborerTranslation(english).text;
}

/**
 * Sign-in screen copy: when `locale === "rw"`, uses static dictionary first,
 * then falls back to the public translate endpoint (no auth).
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

    const dictHit = lookupRw(english);
    if (dictHit) {
      setOut(dictHit);
      return;
    }

    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing RW dictionary key (pre-login): "${english}"`);
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
