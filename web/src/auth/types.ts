/** Application roles — extend as org grows */
export type UserRole =
  | "superuser"
  | "company_admin"
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
  /** Multi-tenant workspace */
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  /** local password vs Login with Cleva */
  authSource?: "local" | "cleva";
  /** From ERP farm_bootstrap when Cleva SSO is used. */
  erpnextAccess?: boolean;
  /** ERP app role from farm_bootstrap (laborer, junior_vet, vet_manager, admin). */
  erpAppRole?: string;
};

export type AuthState = {
  user: SessionUser | null;
  token: string | null;
  activeWorkspace: ActiveWorkspace | null;
  bootstrapped: boolean;
};
