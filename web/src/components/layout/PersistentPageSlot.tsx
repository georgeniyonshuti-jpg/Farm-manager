import { useEffect, useState, type ReactNode } from "react";

type Props = {
  active: boolean;
  /** Delay before first mount — staggers background data loads across pages. */
  mountDelayMs?: number;
  children: ReactNode;
};

/**
 * Keeps a page mounted for the session; toggles visibility with display only.
 */
export function PersistentPageSlot({ active, mountDelayMs = 0, children }: Props) {
  const [childMounted, setChildMounted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setChildMounted(true), mountDelayMs);
    return () => window.clearTimeout(t);
  }, [mountDelayMs]);

  if (!childMounted) return null;

  return (
    <div style={{ display: active ? "block" : "none" }} aria-hidden={!active}>
      {children}
    </div>
  );
}
