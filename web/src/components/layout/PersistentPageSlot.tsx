import { useEffect, useState, type ReactNode } from "react";

type Props = {
  active: boolean;
  /** Delay before first mount when prefetching in background (inactive). Active route mounts immediately. */
  mountDelayMs?: number;
  children: ReactNode;
};

/**
 * Keeps a page mounted for the session. Only the active route is visible and receives pointer events.
 * Mounts after the route has been visited once (avoids background API calls).
 */
export function PersistentPageSlot({ active, mountDelayMs = 0, children }: Props) {
  const [visited, setVisited] = useState(active);
  const [childMounted, setChildMounted] = useState(false);

  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);

  useEffect(() => {
    if (!visited) return;
    const delay = active ? 0 : mountDelayMs;
    const t = window.setTimeout(() => setChildMounted(true), delay);
    return () => window.clearTimeout(t);
  }, [visited, active, mountDelayMs]);

  if (!childMounted) return null;

  if (!active) {
    return (
      <div hidden aria-hidden className="hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="relative z-[1] w-full" aria-hidden={false}>
      {children}
    </div>
  );
}
