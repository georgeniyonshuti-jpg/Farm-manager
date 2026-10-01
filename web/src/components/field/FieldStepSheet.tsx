import type { ReactNode } from "react";
import { FieldNavHeader } from "../layout/FieldPageHeader";
import { Button } from "../ui";

type Props = {
  title: string;
  backLabel: string;
  onBack: () => void;
  step: number;
  totalSteps: number;
  stepLabel?: string;
  children: ReactNode;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  submitLabel: string;
  submittingLabel: string;
  busy: boolean;
  onSubmit: () => void;
  submitDisabled?: boolean;
};

/** Multi-step field capture shell with progress dots and Next/Submit footer. */
export function FieldStepSheet({
  title,
  backLabel,
  onBack,
  step,
  totalSteps,
  stepLabel,
  children,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  submitLabel,
  submittingLabel,
  busy,
  onSubmit,
  submitDisabled,
}: Props) {
  const isLast = step >= totalSteps;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6 sm:max-w-xl sm:space-y-5">
      <header className="space-y-3">
        <FieldNavHeader
          title={title}
          variant="capture"
          onBack={onBack}
          backLabel={backLabel}
          showAccount
        />
        <div className="flex items-center gap-2 px-1" aria-label={`Step ${step} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? "bg-[var(--primary-color)]" : "bg-[var(--border-color)]"
              }`}
            />
          ))}
        </div>
        {stepLabel ? <p className="type-caption text-[var(--text-muted)] px-1">{stepLabel}</p> : null}
      </header>

      <div className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
        {children}
      </div>

      {isLast ? (
        <Button
          type="button"
          size="field"
          className="w-full"
          disabled={busy || submitDisabled}
          onClick={onSubmit}
        >
          {busy ? submittingLabel : submitLabel}
        </Button>
      ) : (
        <Button
          type="button"
          size="field"
          className="w-full"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
