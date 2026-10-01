import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Section heading for field task hub blocks (Recent mortality, Last round, etc.). */
export function FieldSectionTitle({ children }: Props) {
  return <p className="type-h3 text-[var(--text-primary)]">{children}</p>;
}
