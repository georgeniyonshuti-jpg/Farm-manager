type Props = {
  stage: "submitting" | "success";
  successText?: string;
};

export function SubmissionStageScreen({ stage, successText = "Submitted successfully." }: Props) {
  const isSubmitting = stage === "submitting";
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4">
      <div className="w-full rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          {isSubmitting ? (
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden />
          ) : (
            <span className="text-2xl font-bold text-emerald-700" aria-hidden>
              ✓
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold text-neutral-900">
          {isSubmitting ? "Submitting..." : successText}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          {isSubmitting
            ? "Please wait while we save your submission."
            : "Your update has been saved."}
        </p>
      </div>
    </div>
  );
}
