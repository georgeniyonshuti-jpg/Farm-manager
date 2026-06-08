import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function SubmissionReportModal({ open, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--background-color)]">
      <div className="flex-1 overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-black/40" aria-hidden onClick={onClose} />
    </div>
  );
}
