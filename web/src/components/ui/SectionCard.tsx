import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned control cluster (segmented control, filter pills, action). */
  controls?: ReactNode;
  children: ReactNode;
  /** Remove inner body padding, e.g. when the child is a full-bleed table. */
  flushBody?: boolean;
  className?: string;
};

/**
 * KulaSell "Procurement Cohort Breakdown" card pattern (v2 spec §2.3):
 * title + description on the left of the header, controls on the right,
 * content below with a consistent 24px card padding.
 */
export function SectionCard({ title, description, controls, children, flushBody = false, className = "" }: Props) {
  const hasHeader = title != null || description != null || controls != null;
  return (
    <section
      className={[
        "rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasHeader ? (
        <div className="flex flex-col gap-3 border-b border-[var(--border-color)] px-[var(--space-6)] py-[var(--space-4)] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title != null ? (
              <h2 className="text-base font-semibold leading-[22px] text-[var(--text-primary)]">{title}</h2>
            ) : null}
            {description != null ? (
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          {controls != null ? <div className="flex shrink-0 flex-wrap items-center gap-2">{controls}</div> : null}
        </div>
      ) : null}
      <div className={flushBody ? "" : "p-[var(--space-6)]"}>{children}</div>
    </section>
  );
}
