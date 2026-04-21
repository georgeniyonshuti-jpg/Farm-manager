import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  noPad?: boolean;
};

export function DashboardCard({ title, subtitle, children, className = "", action, noPad = false }: Props) {
  return (
    <section
      className={[
        "rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
        noPad ? "" : "p-4",
        className,
      ].join(" ").trim()}
    >
      {!noPad ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {noPad ? (
        <>
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
              {subtitle ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
          {children}
        </>
      ) : children}
    </section>
  );
}
