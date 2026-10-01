import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PageActiveProvider } from "./PageActiveContext";

type Props = {
  active: boolean;
  /** Delay before first mount when prefetching in background (inactive). Active route mounts immediately. */
  mountDelayMs?: number;
  children: ReactNode;
};

function focusPageContent(root: HTMLElement) {
  const target =
    root.querySelector<HTMLElement>("[data-page-focus]") ??
    root.querySelector<HTMLElement>("main h1, [role='heading'][aria-level='1']") ??
    root.querySelector<HTMLElement>("h1");
  if (target) {
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    return;
  }
  if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
  root.focus({ preventScroll: true });
}

/**
 * Keeps a page mounted for the session. Only the active route is visible and receives pointer events.
 * Mounts after the route has been visited once (avoids background API calls).
 */
export function PersistentPageSlot({ active, mountDelayMs = 0, children }: Props) {
  const [visited, setVisited] = useState(active);
  const [childMounted, setChildMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  useEffect(() => {
    if (!visited) return;
    const delay = active ? 0 : mountDelayMs;
    const t = window.setTimeout(() => setChildMounted(true), delay);
    return () => window.clearTimeout(t);
  }, [visited, active, mountDelayMs]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (!active) {
      root.setAttribute("inert", "");
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && root.contains(focused)) {
        focused.blur();
      }
      wasActiveRef.current = false;
      return;
    }

    root.removeAttribute("inert");
    if (!wasActiveRef.current) {
      focusPageContent(root);
    }
    wasActiveRef.current = true;
  }, [active]);

  if (!childMounted) return null;

  return (
    <div
      ref={rootRef}
      className={active ? "relative z-[1] w-full" : "hidden"}
      hidden={!active}
      aria-hidden={!active}
    >
      <PageActiveProvider active={active}>{children}</PageActiveProvider>
    </div>
  );
}
