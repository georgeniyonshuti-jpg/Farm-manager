import type { HTMLAttributes, ReactNode } from "react";

type Level = "default" | "subtle" | "elevated";

type Props = HTMLAttributes<HTMLDivElement> & {
  level?: Level;
  children: ReactNode;
};

const LEVEL: Record<Level, string> = {
  default: "border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
  subtle: "border border-[var(--border-color)] bg-[var(--surface-subtle)] shadow-none",
  elevated: "border border-[var(--border-color)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]",
};

export function Card({ level = "default", className = "", children, ...rest }: Props) {
  return (
    <div className={`rounded-lg p-card ${LEVEL[level]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
