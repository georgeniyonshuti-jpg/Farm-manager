import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Optional left cluster (filters / search). */
  start?: ReactNode;
};

/** Dense action row for tables and list toolbars — prefer ghost/secondary buttons. */
export function Toolbar({ children, start, className = "" }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}
      role="toolbar"
    >
      {start != null ? <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div> : null}
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
