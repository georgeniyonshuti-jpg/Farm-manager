import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Groups related actions. Primary should be last (Primer).
 * Dev-warns when more than one primary appears in the group.
 */
export function ButtonGroup({ children, className = "" }: Props) {
  if (import.meta.env.DEV) {
    let primaryCount = 0;
    Children.forEach(children, (child) => {
      if (!isValidElement(child)) return;
      const el = child as ReactElement<{ variant?: string }>;
      if (el.props.variant === "primary" || el.props.variant === "success") primaryCount += 1;
    });
    if (primaryCount > 1) {
      console.warn("[ButtonGroup] More than one primary button in a group — keep one principal CTA.");
    }
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`.trim()} role="group">
      {children}
    </div>
  );
}
