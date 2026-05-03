import { useAuth } from "../auth/AuthContext";
import type { LaborerLocale } from "../i18n/laborerI18n";
import { isLaborerLocaleUser, useLaborerI18n, useLaborerT } from "../i18n/laborerI18n";

const pill =
  "bounce-tap min-h-[44px] min-w-[44px] rounded-full px-3 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40 md:min-h-0 md:min-w-0 md:px-3 md:py-1.5";

/** Shown only for laborers; app defaults to English until they switch to Kinyarwanda. */
export function LaborerLanguageToggle() {
  const { user } = useAuth();
  const { locale, setLocale } = useLaborerI18n();
  const ariaLang = useLaborerT("Language");

  if (!isLaborerLocaleUser(user)) return null;

  const pick = (l: LaborerLocale) => setLocale(l);

  return (
    <div
      className="inline-flex rounded-full border border-[var(--primary-color)]/30 bg-[var(--primary-color-soft)] p-0.5"
      role="group"
      aria-label={ariaLang}
    >
      <button
        type="button"
        className={`${pill} ${locale === "en" ? "bg-[var(--primary-color)] text-white shadow-sm" : "text-[var(--primary-color-dark)] hover:bg-white/90"}`}
        onClick={() => pick("en")}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={`${pill} ${locale === "rw" ? "bg-[var(--primary-color)] text-white shadow-sm" : "text-[var(--primary-color-dark)] hover:bg-white/90"}`}
        onClick={() => pick("rw")}
        aria-pressed={locale === "rw"}
      >
        RW
      </button>
    </div>
  );
}
