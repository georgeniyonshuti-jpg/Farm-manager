/** Application roles — extend as org grows */
export type UserRole =
  | "superuser"
  | "manager"
  | "vet"
  | "vet_manager"
  | "laborer"
  | "procurement_officer"
  | "sales_coordinator"
  | "investor"
  | "dispatcher";

/** Which business units this identity may access */
export type BusinessUnitAccess = "clevacredit" | "farm" | "both";

/** Currently focused workspace in the UI (Slack-style switcher) */
export type ActiveWorkspace = "clevacredit" | "farm";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  businessUnitAccess: BusinessUnitAccess;
  /** Clevafarm finance investor / bank-level data; false even for some Managers */
  canViewSensitiveFinancial: boolean;
  /** Optional scoping (e.g. hide Investor Memo department) */
  departmentKeys: string[];
  /** Superuser-controlled page visibility keys (empty/missing means role defaults). */
  pageAccess?: string[];
};

export type AuthState = {
  user: SessionUser | null;
  token: string | null;
  activeWorkspace: ActiveWorkspace | null;
  bootstrapped: boolean;
};
