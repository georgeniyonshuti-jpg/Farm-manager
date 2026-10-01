import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

export type ToolbarOverflowItem = {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  download?: boolean | string;
  disabled?: boolean;
};

type Props = {
  items: ToolbarOverflowItem[];
  /** Button label when closed. */
  label?: string;
  className?: string;
  children?: ReactNode;
};

/**
 * Tertiary actions menu for TableToolbar / page chrome.
 * Use for Adjust, Compare, Reports — keep Export/Refresh as surfaced buttons when needed.
 */
export function ToolbarOverflow({ items, label = "More", className = "", children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length && children == null) return null;

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-lg border border-[var(--border-color)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-md)]"
        >
          {items.map((item) => {
            if (item.href) {
              return (
                <a
                  key={item.key}
                  role="menuitem"
                  href={item.href}
                  download={item.download}
                  className="block rounded-control px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="flex w-full rounded-control px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.label}
              </button>
            );
          })}
          {children}
        </div>
      ) : null}
    </div>
  );
}
