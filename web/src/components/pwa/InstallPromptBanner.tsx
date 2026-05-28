import { useEffect, useMemo, useState } from "react";
import {
  dismissInstallPromptForToday,
  subscribeInstallPrompt,
  triggerNativeInstallPrompt,
} from "../../pwa/installPrompt";
import { useLaborerT } from "../../i18n/laborerI18n";

type PromptState = {
  canPromptNatively: boolean;
  isInstalled: boolean;
  shouldShowToday: boolean;
};

const initialState: PromptState = {
  canPromptNatively: false,
  isInstalled: false,
  shouldShowToday: false,
};

function useInstallFallbackText() {
  const tIos = useLaborerT("On iPhone/iPad: tap Share, then Add to Home Screen.");
  const tGeneric = useLaborerT("If the install popup does not open, use your browser menu and choose Install app.");
  const ua = typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase() : "";
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isIos && isSafari ? tIos : tGeneric;
}

export function InstallPromptBanner() {
  const [promptState, setPromptState] = useState<PromptState>(initialState);
  const [showFallbackInstructions, setShowFallbackInstructions] = useState(false);

  useEffect(() => subscribeInstallPrompt(setPromptState), []);

  const visible = useMemo(
    () => !promptState.isInstalled && promptState.shouldShowToday,
    [promptState.isInstalled, promptState.shouldShowToday]
  );

  const tTitle = useLaborerT("Install Clevafarm app");
  const tNativeSubtitle = useLaborerT("Install from this popup for a faster, app-like experience.");
  const tManualSubtitle = useLaborerT("Add to your home screen for a faster, app-like experience.");
  const tInstall = useLaborerT("Install app");
  const tNotNow = useLaborerT("Not now");
  const fallbackText = useInstallFallbackText();

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-3 z-[85] px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border-color)] bg-white/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{tTitle}</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {promptState.canPromptNatively ? tNativeSubtitle : tManualSubtitle}
            </p>
            {showFallbackInstructions ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">{fallbackText}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const result = await triggerNativeInstallPrompt();
                if (result === "unavailable") {
                  setShowFallbackInstructions(true);
                }
              }}
              className="bounce-tap inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[var(--primary-color)] px-3 py-2 text-xs font-semibold text-white"
            >
              {tInstall}
            </button>
            <button
              type="button"
              onClick={() => {
                dismissInstallPromptForToday();
                setShowFallbackInstructions(false);
              }}
              className="bounce-tap inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
            >
              {tNotNow}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
