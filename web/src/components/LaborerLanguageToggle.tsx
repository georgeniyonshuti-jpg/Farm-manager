import { useAuth } from "../auth/AuthContext";
import type { LaborerLocale } from "../i18n/laborerI18n";
import { useLaborerI18n, useLaborerT } from "../i18n/laborerI18n";

const seg =
  "rounded-md px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600/40";

/**
 * Shown only for laborer accounts. Defaults to Kinyarwanda (Ikinyarwanda).
 */
export function LaborerLanguageToggle() {
  const { user } = useAuth();
  const { locale, setLocale } = useLaborerI18n();
  const ariaLang = useLaborerT("Language");
  const labelRw = useLaborerT("Ikinyarwanda");
  const labelEn = useLaborerT("English");

  if (user?.role !== "laborer" && user?.role !== "dispatcher") return null;

  const pick = (l: LaborerLocale) =>
    setLocale(l);

  return (
    <div
      className="flex rounded-lg border border-emerald-200 bg-emerald-50/80 p-0.5"
      role="group"
      aria-label={ariaLang}
    >
      <button
        type="button"
        className={`${seg} ${locale === "rw" ? "bg-emerald-800 text-white shadow" : "text-emerald-900 hover:bg-emerald-100"}`}
        onClick={() => pick("rw")}
      >
        {labelRw}
      </button>
      <button
        type="button"
        className={`${seg} ${locale === "en" ? "bg-emerald-800 text-white shadow" : "text-emerald-900 hover:bg-emerald-100"}`}
        onClick={() => pick("en")}
      >
        {labelEn}
      </button>
    </div>
  );
}
