import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

export type MobileFieldNavItem = { to: string; label: string; end?: boolean; icon: ReactNode };

type Props = {
  items: MobileFieldNavItem[];
  /** @default "Primary" */
  ariaLabel?: string;
};

/**
 * Bottom tab bar for compact field / laborer / vet hub layouts (sm:hidden).
 * Uses flex so any number of items share width evenly (4 or 7 tabs).
 */
export function MobileFieldBottomNav({ items, ariaLabel = "Primary" }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-14 flex-col justify-end border-t border-[var(--border-color)] bg-[var(--surface-elevated)]/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[var(--shadow-soft)] backdrop-blur-md sm:hidden"
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
                isActive ? "text-[var(--primary-color)]" : "text-[var(--text-muted)]",
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
