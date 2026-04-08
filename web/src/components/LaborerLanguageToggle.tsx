import { useAuth } from "../auth/AuthContext";
import type { LaborerLocale } from "../i18n/laborerI18n";
import { isLaborerLocaleUser, useLaborerI18n, useLaborerT } from "../i18n/laborerI18n";

const seg =
  "bounce-tap rounded-md px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40";

/** Shown only for laborers; app defaults to English until they switch to Kinyarwanda. */
export function LaborerLanguageToggle() {
  const { user } = useAuth();
  const { locale, setLocale } = useLaborerI18n();
  const ariaLang = useLaborerT("Language");
  const labelRw = useLaborerT("Kinyarwanda");
  const labelEn = useLaborerT("English");

  if (!isLaborerLocaleUser(user)) return null;

  const pick = (l: LaborerLocale) =>
    setLocale(l);

  return (
    <>
      <div
        className="flex rounded-lg border border-[var(--primary-color)]/25 bg-[var(--primary-color-soft)] p-0.5 sm:hidden"
        role="group"
        aria-label={ariaLang}
      >
        <button
          type="button"
          className={`bounce-tap h-10 w-10 rounded-full text-lg transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40 ${locale === "rw" ? "bg-[var(--primary-color)] text-white shadow" : "text-[var(--primary-color-dark)] hover:bg-white/80"}`}
          onClick={() => pick("rw")}
          aria-label={labelRw}
          title={labelRw}
        >
          🇷🇼
        </button>
        <button
          type="button"
          className={`bounce-tap h-10 w-10 rounded-full text-lg transition focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]/40 ${locale === "en" ? "bg-[var(--primary-color)] text-white shadow" : "text-[var(--primary-color-dark)] hover:bg-white/80"}`}
          onClick={() => pick("en")}
          aria-label={labelEn}
          title={labelEn}
        >
          🇬🇧
        </button>
      </div>
      <div
        className="hidden rounded-lg border border-[var(--primary-color)]/25 bg-[var(--primary-color-soft)] p-0.5 sm:flex"
        role="group"
        aria-label={ariaLang}
      >
        <button
          type="button"
          className={`${seg} ${locale === "rw" ? "bg-[var(--primary-color)] text-white shadow" : "text-[var(--primary-color-dark)] hover:bg-white/80"}`}
          onClick={() => pick("rw")}
        >
          {labelRw}
        </button>
        <button
          type="button"
          className={`${seg} ${locale === "en" ? "bg-[var(--primary-color)] text-white shadow" : "text-[var(--primary-color-dark)] hover:bg-white/80"}`}
          onClick={() => pick("en")}
        >
          {labelEn}
        </button>
      </div>
    </>
  );
}
