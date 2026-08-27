import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-[1] max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-elevated)] sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
          <h2 className="type-h3 text-[var(--text-primary)]">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            ✕
          </Button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
