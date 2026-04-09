type PromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: PromptOutcome; platform: string }>;
};

type InstallPromptSnapshot = {
  canPromptNatively: boolean;
  isInstalled: boolean;
  shouldShowToday: boolean;
};

type Listener = (snapshot: InstallPromptSnapshot) => void;

const DISMISS_STORAGE_KEY = "fm_pwa_install_dismissed_at";
const DAY_MS = 24 * 60 * 60 * 1000;

let initialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners = new Set<Listener>();

function isStandaloneDisplayMode() {
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || navigatorStandalone;
}

function getDismissedAt(): number {
  const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldShowToday() {
  const dismissedAt = getDismissedAt();
  if (!dismissedAt) return true;
  return Date.now() - dismissedAt >= DAY_MS;
}

function currentSnapshot(): InstallPromptSnapshot {
  return {
    canPromptNatively: Boolean(deferredPrompt),
    isInstalled: isStandaloneDisplayMode(),
    shouldShowToday: shouldShowToday(),
  };
}

function emit() {
  const snapshot = currentSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function initInstallPromptController() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    emit();
  });
}

export function subscribeInstallPrompt(listener: Listener) {
  listeners.add(listener);
  listener(currentSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export async function triggerNativeInstallPrompt(): Promise<PromptOutcome | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (choice.outcome !== "accepted") {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  }
  emit();
  return choice.outcome;
}

export function dismissInstallPromptForToday() {
  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  emit();
}
