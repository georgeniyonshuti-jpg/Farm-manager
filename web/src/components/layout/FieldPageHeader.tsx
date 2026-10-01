import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { FieldAccountCluster } from "./FieldAccountCluster";

export type FieldNavVariant = "hub" | "capture" | "history";

type Props = {
  title: string;
  variant?: FieldNavVariant;
  backTo?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
  showAccount?: boolean;
};

/** Unified mobile nav header for field task pages. */
export function FieldNavHeader({
  title,
  variant = "hub",
  backTo,
  onBack,
  backLabel = "Back",
  action,
  showAccount = false,
}: Props) {
  const titleClass = variant === "hub" ? "type-h3" : "type-h2";

  const backControl = backTo ? (
    <Link
      to={backTo}
      className="bounce-tap inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)]"
      aria-label={backLabel}
    >
      <ChevronLeft className="h-6 w-6" aria-hidden />
    </Link>
  ) : onBack ? (
    <button
      type="button"
      onClick={onBack}
      className="bounce-tap inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)]"
      aria-label={backLabel}
    >
      <ChevronLeft className="h-6 w-6" aria-hidden />
    </button>
  ) : (
    <span className="min-w-[48px] shrink-0" aria-hidden />
  );

  const hasTrailing = action || showAccount;

  return (
    <header className="mb-1">
      <div className="flex items-center gap-1">
        {backControl}
        <div className="min-w-0 flex-1 px-1">
          <h1 data-page-focus className={`${titleClass} truncate text-[var(--text-primary)]`}>{title}</h1>
        </div>
        {hasTrailing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {action}
            {showAccount ? <FieldAccountCluster compact /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** @deprecated Use FieldNavHeader */
export function FieldPageHeader({
  title,
  backTo,
  backLabel = "Back",
  action,
  variant = "hub",
  showAccount = false,
}: Props) {
  return (
    <FieldNavHeader
      title={title}
      variant={variant}
      backTo={backTo}
      backLabel={backLabel}
      action={action}
      showAccount={showAccount}
    />
  );
}
