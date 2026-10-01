import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

export type MobileFieldNavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
  /** When set, overrides NavLink pathname matching (needed for ?tab= routes). */
  active?: boolean;
};

type Props = {
  items: MobileFieldNavItem[];
  /** @default "Primary" */
  ariaLabel?: string;
  className?: string;
};

/**
 * Bottom tab bar for compact field / laborer / junior vet shell.
 * In-flow at the bottom of the phone column (visible on all breakpoints unless className hides it).
 */
export function MobileFieldBottomNav({ items, ariaLabel = "Primary", className = "" }: Props) {
  return (
    <nav
      className={`z-40 flex min-h-14 shrink-0 flex-col justify-end border-t border-[var(--border-color)] bg-[var(--surface-elevated)]/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[var(--shadow-soft)] backdrop-blur-md ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <div className="flex h-14 w-full items-stretch px-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                "bounce-tap flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center",
                (item.active !== undefined ? item.active : isActive)
                  ? "text-[var(--primary-color)]"
                  : "text-[var(--text-muted)]",
              ].join(" ")
            }
          >
            <>
              <span className="shrink-0 text-current [&_svg]:stroke-current">{item.icon}</span>
              <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
            </>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
