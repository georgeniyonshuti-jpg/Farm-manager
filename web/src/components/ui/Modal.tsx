import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer, wide }: Props) {
  const uid = useId();
  const bodyId = `modal-body-${uid}`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);

  // Save previously focused element when modal opens
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement;
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Initial focus — first focusable element inside body
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const body = dialogRef.current?.querySelector<HTMLElement>("[data-modal-content]");
      const first = body?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const container = dialogRef.current?.querySelector<HTMLElement>("[data-modal-content]");
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Restore focus on close
  useEffect(() => {
    if (open) return;
    const el = previousFocus.current;
    if (el && el instanceof HTMLElement) {
      el.focus();
      previousFocus.current = null;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={bodyId}
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
        <div id={bodyId} data-modal-content className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
