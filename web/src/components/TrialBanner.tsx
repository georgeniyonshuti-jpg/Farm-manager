import { Link } from "react-router-dom";

export function TrialBanner({
  daysRemaining,
}: {
  daysRemaining: number;
}) {
  if (daysRemaining < 0) return null;
  return (
    <div
      className="bg-amber-500/10 px-shell-x py-2 text-center text-sm text-amber-900 dark:text-amber-100"
      role="status"
    >
      <span>
        {daysRemaining === 0
          ? "Your free trial ends today."
          : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left on your free trial.`}
      </span>{" "}
      <Link
        to="/billing/pricing"
        className="font-semibold text-amber-950 underline underline-offset-2 hover:opacity-80 dark:text-amber-50"
      >
        View plans
      </Link>
    </div>
  );
}
