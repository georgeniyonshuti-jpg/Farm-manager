import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, UserRole } from "../../auth/types";
import { canAccessWorkspace } from "../../auth/permissions";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { useLaborerT } from "../../i18n/laborerI18n";

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
  const signOutLabel = useLaborerT("Sign out");
  const financialRestricted = useLaborerT("Financial: restricted");
  const farmWorkspace = useLaborerT("Farm / Poultry");
  const clevaWorkspace = useLaborerT("ClevaCredit");
  const businessLabel = useLaborerT("Business");
  const switchWorkspaceAria = useLaborerT("Switch active business unit");
  const roleBadge = useLaborerT(user ? ROLE_LABEL_EN[user.role] : "");

  if (!user) return null;

  const showSwitcher = user.businessUnitAccess === "both";

  const workspaces: { id: ActiveWorkspace; label: string }[] = [
    { id: "farm", label: farmWorkspace },
    { id: "clevacredit", label: clevaWorkspace },
  ];

  return (
    <header className="flex min-h-14 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-3">
        <span className="truncate text-sm font-semibold text-neutral-900">
          {user.displayName}
        </span>
        <span className="text-xs text-neutral-500">
          <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium uppercase tracking-wide text-neutral-700">
            {roleBadge}
          </span>
          {!user.canViewSensitiveFinancial && (
            <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-amber-900">
              {financialRestricted}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
        <LaborerLanguageToggle />

        {showSwitcher && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="hidden sm:inline">{businessLabel}</span>
            <select
              className="max-w-[11rem] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 sm:max-w-none"
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
        )}

        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          {signOutLabel}
        </button>
      </div>
    </header>
  );
}
