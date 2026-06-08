export function SubmissionStatusBadge({ status }: { status: string }) {
  const s = status || "approved";
  if (s === "approved") {
    return (
      <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
        Approved
      </span>
    );
  }
  if (s === "pending_review") {
    return (
      <span className="inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
      Rejected
    </span>
  );
}
