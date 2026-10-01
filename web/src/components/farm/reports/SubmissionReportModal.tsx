import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Full-viewport report sheet. Portaled to document.body so it is not clipped by
 * the manager shell's scrollable <main overflow-auto>.
 */
export function SubmissionReportModal({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[var(--background-color)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>,
    document.body
  );
}
