import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
};

const actionClass =
  "bounce-tap inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color-soft)]";

/** Trailing nav action (History, etc.) with field tap target — no underline. */
export function FieldHeaderAction({ children, onClick, to }: Props) {
  if (to) {
    return (
      <Link to={to} className={actionClass}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={actionClass}>
      {children}
    </button>
  );
}
