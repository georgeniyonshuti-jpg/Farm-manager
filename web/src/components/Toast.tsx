import React, { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = { id: string; type: ToastType; message: string };

type ToastContextValue = {
  showToast: (type: ToastType, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLES: Record<ToastType, string> = {
  success:
    "pointer-events-auto rounded-xl border border-[var(--status-success)]/30 bg-[var(--status-success-soft)] px-4 py-3 text-sm font-medium text-[var(--status-success)] shadow-lg",
  error:
    "pointer-events-auto rounded-xl border border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--status-danger)] shadow-lg",
  info:
    "pointer-events-auto rounded-xl border border-[var(--status-info)]/30 bg-[var(--status-info-soft)] px-4 py-3 text-sm font-medium text-[var(--status-info)] shadow-lg",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2 sm:bottom-6 sm:right-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} role="status" className={TOAST_STYLES[t.type]}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const c = useContext(ToastContext);
  if (!c) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return c;
}
