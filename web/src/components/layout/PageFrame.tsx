import { useEffect, useId, useLayoutEffect, type ReactNode } from "react";
import { usePageChrome } from "./PageChromeContext";
import { usePageActive } from "./PageActiveContext";

type Props = {
  title: ReactNode;
  /** Right-side actions published to AppTopBar row 1. */
  actions?: ReactNode;
  /** Tabs / filter strip published to AppTopBar row 2. */
  tabs?: ReactNode;
  /** Actions aligned with tabs on row 2. */
  tabsActions?: ReactNode;
  /** Live data chips under the content start (counts, dates) — not prose. */
  meta?: ReactNode;
  /** Settings / forms: constrain width. Record tables: full bleed. */
  variant?: "records" | "settings";
  className?: string;
  children: ReactNode;
};

/**
 * Owns page chrome for the desktop manager shell.
 * Publishes title/actions/tabs to AppTopBar; renders no title band of its own.
 * There is intentionally no `subtitle` prop.
 */
export function PageFrame({
  title,
  actions,
  tabs,
  tabsActions,
  meta,
  variant = "records",
  className = "",
  children,
}: Props) {
  const owner = useId();
  const { setChrome, clearChrome } = usePageChrome();
  const pageActive = usePageActive();

  useLayoutEffect(() => {
    if (!pageActive) return;
    setChrome(
      {
        title,
        actions: actions ?? null,
        tabs: tabs ?? null,
        tabsActions: tabsActions ?? null,
      },
      owner,
    );
  }, [pageActive, title, actions, tabs, tabsActions, setChrome, owner]);

  useEffect(() => {
    if (!pageActive) return;
    return () => clearChrome(owner);
  }, [pageActive, clearChrome, owner]);

  const width = variant === "settings" ? "mx-auto w-full max-w-5xl" : "w-full max-w-none";

  return (
    <div className={`${width} space-y-stack ${className}`.trim()}>
      {meta != null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium tabular-nums text-[var(--text-secondary)]">
          {meta}
        </div>
      ) : null}
      {children}
    </div>
  );
}
