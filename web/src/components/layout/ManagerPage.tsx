import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Settings / forms: constrain width. Record tables: full bleed. */
  variant?: "records" | "settings";
  className?: string;
};

/** @deprecated Prefer PageFrame — kept as a thin width/stack wrapper during migration. */
export function ManagerPage({ children, variant = "records", className = "" }: Props) {
  const width = variant === "settings" ? "mx-auto w-full max-w-5xl" : "w-full max-w-none";
  return <div className={`${width} space-y-stack ${className}`.trim()}>{children}</div>;
}
