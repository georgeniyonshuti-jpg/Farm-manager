import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Inline note on the title row — not a stacked subtitle. */
  metricNote?: ReactNode;
  /** @deprecated Prefer metricNote. */
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  noPad?: boolean;
};

export function DashboardCard({
  title,
  metricNote,
  subtitle,
  children,
  className = "",
  action,
  noPad = false,
}: Props) {
  const note = metricNote ?? subtitle;
  const header = (
    <div className={`flex items-center justify-between gap-2 ${noPad ? "px-card pb-1 pt-stack" : "mb-2"}`}>
      <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {note ? <span className="truncate text-xs text-[var(--text-muted)]">{note}</span> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );

  return (
    <section
      className={[
        "rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
        noPad ? "" : "p-card",
        className,
      ]
        .join(" ")
        .trim()}
    >
      {header}
      {children}
    </section>
  );
}
