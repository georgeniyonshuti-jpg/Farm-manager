import type { ReactNode } from "react";
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
}: Props) {
  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <FieldNavHeader
        title={title}
        variant="capture"
        onBack={onBack}
        backLabel={backLabel}
        showAccount
      />

      <div className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
        {children}
      </div>

      <Button
        type="button"
        size="field"
        className="w-full"
        disabled={busy || submitDisabled}
        onClick={onSubmit}
      >
        {busy ? submittingLabel : submitLabel}
      </Button>
    </div>
  );
}
