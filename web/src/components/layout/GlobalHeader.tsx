import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, UserRole } from "../../auth/types";
import { canAccessWorkspace } from "../../auth/permissions";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { useLaborerT } from "../../i18n/laborerI18n";
import { Link } from "react-router-dom";
import { BrandLogo } from "../BrandLogo";

const ROLE_LABEL_EN: Record<UserRole, string> = {
  superuser: "Superuser",
  manager: "Manager",
  vet: "Vet",
  vet_manager: "Vet manager",
  laborer: "Laborer",
  procurement_officer: "Procurement officer",
  sales_coordinator: "Sales coordinator",
  investor: "Investor",
  dispatcher: "Dispatcher",
};

export function GlobalHeader() {
  const { user, logout, activeWorkspace, setActiveWorkspace } = useAuth();
  const financialRestricted = useLaborerT("Financial: restricted");
  const farmWorkspace = useLaborerT("Farm / Poultry");
  const clevaWorkspace = useLaborerT("Clevafarm Finance");
  const businessLabel = useLaborerT("Business");
  const switchWorkspaceAria = useLaborerT("Switch active business unit");
  const roleBadge = useLaborerT(user ? ROLE_LABEL_EN[user.role] : "");
  const homeLabel = useLaborerT("Action center");
  const appName = useLaborerT("Clevafarm");

  if (!user) return null;

  const showSwitcher = user.businessUnitAccess === "both";
  const showFieldHome =
    user.role === "vet" || user.role === "laborer" || user.role === "dispatcher";

  const workspaces: { id: ActiveWorkspace; label: string }[] = [
    { id: "farm", label: farmWorkspace },
    { id: "clevacredit", label: clevaWorkspace },
  ];

  return (
    <header className="border-b border-[var(--border-color)] bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-color-soft)]">
              <BrandLogo size={22} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{appName}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{user.displayName}</p>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--secondary-soft)] px-2 py-0.5 font-semibold uppercase tracking-wide text-[var(--secondary-color)]">
              {roleBadge}
            </span>
            {!user.canViewSensitiveFinancial ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">{financialRestricted}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {showSwitcher ? (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="hidden md:inline">{businessLabel}</span>
              <select
                className="bounce-tap max-w-[11rem] rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm sm:max-w-none"
                value={activeWorkspace ?? "farm"}
                onChange={(e) => setActiveWorkspace(e.target.value as ActiveWorkspace)}
                aria-label={switchWorkspaceAria}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id} disabled={!canAccessWorkspace(user, w.id)}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <LaborerLanguageToggle />
          {showFieldHome ? (
            <Link
              to="/dashboard/laborer"
              className="bounce-tap inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            >
              {homeLabel}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void logout()}
            className="bounce-tap rounded-xl border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--primary-color-soft)]"
            aria-label="Sign out"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
