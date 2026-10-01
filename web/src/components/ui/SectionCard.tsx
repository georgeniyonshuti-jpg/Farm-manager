import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  /** @deprecated Ignored — use field help or Notice instead of card descriptions. */
  description?: ReactNode;
  /** Right-aligned control cluster (segmented control, filter pills, action). */
  controls?: ReactNode;
  children: ReactNode;
  /** Remove inner body padding, e.g. when the child is a full-bleed table. */
  flushBody?: boolean;
  className?: string;
};

/**
 * Section card — title + optional controls on one row, content below.
 * Description prop is accepted but not rendered (density redesign).
 */
export function SectionCard({ title, controls, children, flushBody = false, className = "" }: Props) {
  const hasHeader = title != null || controls != null;
  return (
    <section
      className={[
        "rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] px-card py-stack">
          <div className="min-w-0">
            {title != null ? (
              <h2 className="text-sm font-semibold leading-5 text-[var(--text-primary)]">{title}</h2>
            ) : null}
          </div>
          {controls != null ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{controls}</div>
          ) : null}
        </div>
      ) : null}
      <div className={flushBody ? "" : "p-card"}>{children}</div>
    </section>
  );
}
