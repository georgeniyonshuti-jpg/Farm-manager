export type SuperAdminCompany = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trial_ends_at: string | null;
  is_active: boolean;
  payment_overdue: boolean;
  erpnext_company: string | null;
  users: number;
  flocks: number;
};

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
export const ASSIGNABLE_PLANS = ["starter", "pro", "enterprise"] as const;
