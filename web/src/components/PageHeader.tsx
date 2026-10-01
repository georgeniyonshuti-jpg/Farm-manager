import { useEffect, useId, useLayoutEffect, type ReactNode } from "react";
import { Button } from "./ui/Button";
import { PageFrame } from "./layout/PageFrame";
import { usePageChrome } from "./layout/PageChromeContext";
import { usePageActive } from "./layout/PageActiveContext";

type ActionDef = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  title: ReactNode;
  /** @deprecated Ignored — subtitles removed from the desktop shell. */
  subtitle?: ReactNode;
  action?: ReactNode;
  primaryAction?: ActionDef;
  secondaryAction?: ActionDef;
  tabs?: ReactNode;
  className?: string;
  /** When set, wraps children in PageFrame (preferred). */
  children?: ReactNode;
  meta?: ReactNode;
  variant?: "records" | "settings";
};

function renderAction(action?: ActionDef) {
  if (!action) return null;
  return (
    <Button variant="primary" size="sm" onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  );
}

function renderSecondary(action?: ActionDef) {
  if (!action) return null;
  return (
    <Button variant="secondary" size="sm" onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  );
}

/** Publishes chrome to AppTopBar without occupying layout space. */
function ChromeOnly({
  title,
  actions,
  tabs,
  tabsActions,
}: {
  title: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  tabsActions?: ReactNode;
}) {
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

  return null;
}

/**
 * Compatibility shim → PageFrame / AppTopBar.
 * Does not render a title band or subtitle.
 */
export function PageHeader({
  title,
  action,
  primaryAction,
  secondaryAction,
  tabs,
  className = "",
  children,
  meta,
  variant = "records",
}: Props) {
  const builtActions = (
    <>
      {renderSecondary(secondaryAction)}
      {renderAction(primaryAction)}
    </>
  );
  const hasBuiltActions = primaryAction != null || secondaryAction != null;
  const titleRowAction = tabs == null ? (hasBuiltActions ? builtActions : action) : null;
  const tabsRowAction = tabs != null ? (hasBuiltActions ? builtActions : action) : null;

  if (children != null) {
    return (
      <PageFrame
        title={title}
        actions={titleRowAction ?? undefined}
        tabs={tabs}
        tabsActions={tabsRowAction ?? undefined}
        meta={meta}
        variant={variant}
        className={className}
      >
        {children}
      </PageFrame>
    );
  }

  return (
    <>
      <ChromeOnly
        title={title}
        actions={titleRowAction ?? undefined}
        tabs={tabs}
        tabsActions={tabsRowAction ?? undefined}
      />
      {meta != null ? (
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium tabular-nums text-[var(--text-secondary)]">
          {meta}
        </div>
      ) : null}
    </>
  );
}
