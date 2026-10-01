import { useAuth } from "../../auth/AuthContext";
import type { ActiveWorkspace, UserRole } from "../../auth/types";
import { canAccessWorkspace } from "../../auth/permissions";
import { isLaborerLocaleUser, useLaborerT } from "../../i18n/laborerI18n";
import { LaborerLanguageToggle } from "../LaborerLanguageToggle";
import { UserMenuChip } from "./UserMenuChip";

const ROLE_LABEL_EN: Record<UserRole, string> = {
  superuser: "Superuser",
  company_admin: "Company admin",
  manager: "Manager",
  vet: "Vet",
  vet_manager: "Vet Manager",
  laborer: "Laborer",
  procurement_officer: "Procurement officer",
  sales_coordinator: "Sales coordinator",
  buyer: "Buyer",
  investor: "Investor",
  dispatcher: "Dispatcher",
};

type Props = {
  /** Compact avatar-only chip on narrow screens. */
  compact?: boolean;
};

/** Trailing account controls shared by FieldGlobalHeader and FieldNavHeader. */
export function FieldAccountCluster({ compact = false }: Props) {
  const { user, logout, activeWorkspace, setActiveWorkspace } = useAuth();
  const farmWorkspace = useLaborerT("Farm / Poultry");
  const clevaWorkspace = useLaborerT("Clevafarm Finance");
  const switchWorkspaceAria = useLaborerT("Switch active business unit");
  const roleBadge = useLaborerT(user ? ROLE_LABEL_EN[user.role] : "");

  if (!user) return null;

  const showSwitcher = user.businessUnitAccess === "both";
  const showLang = isLaborerLocaleUser(user);

  const workspaces: { id: ActiveWorkspace; label: string }[] = [
    { id: "farm", label: farmWorkspace },
    { id: "clevacredit", label: clevaWorkspace },
  ];

  const workspaceSelect =
    showSwitcher ? (
      <select
        className="bounce-tap max-w-[9rem] shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] shadow-sm"
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
    ) : null;

  return (
    <>
      {workspaceSelect}
      {showLang ? <LaborerLanguageToggle /> : null}
      <UserMenuChip
        user={user}
        roleBadge={roleBadge}
        onLogout={logout}
        compactOnMobile={compact}
        showRolePill={false}
        showChevron
        includeThemeToggle
      />
    </>
  );
}
