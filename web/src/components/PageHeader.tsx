import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Consistent page title row (PART 4): title, optional subtitle & action. */
export function PageHeader({ title, subtitle, action, className = "" }: Props) {
  return (
    <header
      className={["mb-6 flex max-w-[100vw] flex-col gap-2 border-b border-[var(--border-color)] pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">{title}</h1>
        {subtitle != null && subtitle !== "" ? (
          <div className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</div>
        ) : null}
      </div>
      {action != null ? <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div> : null}
    </header>
  );
}
