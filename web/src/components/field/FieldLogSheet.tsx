import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { FieldNavHeader } from "../layout/FieldPageHeader";
import { Button } from "../ui";

type Props = {
  title: string;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
  submitLabel: string;
  submittingLabel: string;
  busy: boolean;
  onSubmit: () => void;
  submitDisabled?: boolean;
  showAccount?: boolean;
  /** Tab and greeting already name the screen. Keep the back control only. */
  hideTitle?: boolean;
};

/** Full-screen field log form shell (second step after hub). */
export function FieldLogSheet({
  title,
  backLabel,
  onBack,
  children,
  submitLabel,
  submittingLabel,
  busy,
  onSubmit,
  submitDisabled,
  showAccount = true,
  hideTitle = false,
}: Props) {
  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      {hideTitle ? (
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="bounce-tap inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-secondary)]"
            aria-label={backLabel}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="sr-only">{title}</h1>
        </div>
      ) : (
        <FieldNavHeader
          title={title}
          variant="capture"
          onBack={onBack}
          backLabel={backLabel}
          showAccount={showAccount}
        />
      )}

      <div className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
        {children}
      </div>

      <Button
        type="button"
        size="field"
        className="sticky bottom-2 z-10 w-full shadow-[0_-12px_16px_var(--background-color)]"
        disabled={busy || submitDisabled}
        onClick={onSubmit}
      >
        {busy ? submittingLabel : submitLabel}
      </Button>
    </div>
  );
}
