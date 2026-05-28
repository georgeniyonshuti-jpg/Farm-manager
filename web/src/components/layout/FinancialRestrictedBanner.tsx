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
  /** Mobile: collapsed by default so header stack does not steal vertical space. */
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const message = useLaborerT("Financial access restricted. Contact your admin.");
  const dismissLabel = useLaborerT("Dismiss notice");
  const expandLabel = useLaborerT("Show notice");
  const collapseLabel = useLaborerT("Hide notice");
  const shortLabel = useLaborerT("Financial notice");

  if (dismissed) return null;

  return (
    <>
      {/* Mobile: one compact row until expanded */}
      <div
        className="border-b border-amber-500/30 bg-amber-500/10 md:hidden"
        role="status"
      >
        {!mobileExpanded ? (
          <button
            type="button"
            onClick={() => setMobileExpanded(true)}
            className="flex w-full items-center justify-center gap-2 px-2 py-1 text-[11px] font-medium text-amber-400"
            aria-expanded={false}
            aria-label={expandLabel}
          >
            <span className="truncate">{shortLabel}</span>
            <span className="shrink-0 text-amber-300" aria-hidden>
              ▾
            </span>
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3 px-3 py-2 text-xs leading-snug text-amber-400">
            <p className="min-w-0 flex-1">{message}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setMobileExpanded(false)}
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15"
                aria-label={collapseLabel}
              >
                ▴
              </button>
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
                className="bounce-tap rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-300 underline decoration-amber-500/60 underline-offset-2 hover:bg-amber-500/10"
                aria-label={dismissLabel}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: full banner */}
      <div
        className="hidden items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-400 sm:px-4 md:flex"
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
          className="bounce-tap shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-300 underline decoration-amber-500/60 underline-offset-2 hover:bg-amber-500/10"
          aria-label={dismissLabel}
        >
          ×
        </button>
      </div>
    </>
  );
}
