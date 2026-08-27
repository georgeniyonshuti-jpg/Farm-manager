import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

type Props = {
  title: string;
  backTo?: string;
  backLabel?: string;
  context?: ReactNode;
  action?: ReactNode;
};

/** Slim mobile header for field pages; desktop keeps fuller PageHeader via callers. */
export function FieldPageHeader({ title, backTo, backLabel = "Back", context, action }: Props) {
  return (
    <header className="mb-4 md:hidden">
      <div className="flex items-center gap-2">
        {backTo ? (
          <Link
            to={backTo}
            className="bounce-tap inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--text-secondary)]"
            aria-label={backLabel}
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="type-h2 truncate text-[var(--text-primary)]">{title}</h1>
          {context ? <div className="mt-0.5 type-caption truncate">{context}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
