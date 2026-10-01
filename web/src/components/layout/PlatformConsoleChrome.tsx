import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { platformConsoleSection } from "../../lib/platformConsole";
import { AppTopBar } from "./AppTopBar";

const SECTIONS: { id: string; label: string; to: string }[] = [
  { id: "companies", label: "Companies", to: "/admin/super" },
  { id: "plans", label: "Plans", to: "/admin/super/plans" },
  { id: "announce", label: "Announce", to: "/admin/super/announce" },
  { id: "repair", label: "Repair", to: "/admin/super/repair" },
];

type Props = {
  children: ReactNode;
};

/**
 * Operator-plane chrome: privilege banner + console nav, no farm sidebar.
 * Page titles/actions still flow through PageChromeProvider → AppTopBar.
 */
export function PlatformConsoleChrome({ children }: Props) {
  const { companyHref } = useCompanyNav();
  const location = useLocation();
  const section = platformConsoleSection(location.pathname);
  const farmHome = companyHref("/dashboard/management");

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--background-color)]">
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--status-warning)]/40 bg-[var(--status-warning-soft)] px-shell-x py-2"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Platform console — cross-tenant operator tools
        </p>
        <Link
          to={farmHome}
          className="text-sm font-semibold text-[var(--primary-color)] underline-offset-2 hover:underline"
        >
          Back to farm
        </Link>
      </div>

      <div className="flex shrink-0 items-center border-b border-[var(--border-color)] bg-[var(--farm-header)] px-shell-x">
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2" aria-label="Platform sections">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <NavLink
                key={s.id}
                to={companyHref(s.to)}
                end={s.id === "companies"}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary-color-soft)] text-[var(--primary-color)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <AppTopBar />

      <main className="app-page-enter animate-fade-up flex-1 overflow-auto px-shell-x pt-stack pb-section">
        <div className="w-full max-w-none">{children}</div>
      </main>
    </div>
  );
}
