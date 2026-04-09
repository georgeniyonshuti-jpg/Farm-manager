import { useState } from "react";
import { useLaborerT } from "../../i18n/laborerI18n";

const STORAGE_KEY = "clevafarm_dismiss_financial_notice";

export function FinancialRestrictedBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const message = useLaborerT("Financial access restricted. Contact your admin.");
  const dismissLabel = useLaborerT("Dismiss notice");

  if (dismissed) return null;

  return (
    <div
      className="flex items-start justify-between gap-3 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 sm:px-4"
      role="status"
    >
      <p className="min-w-0 flex-1">{message}</p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="bounce-tap shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-900 underline decoration-amber-700/60 underline-offset-2 hover:bg-amber-100/80"
        aria-label={dismissLabel}
      >
        ×
      </button>
    </div>
  );
}
