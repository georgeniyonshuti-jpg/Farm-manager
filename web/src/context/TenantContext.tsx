import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import {
  resolveCompanyBySlug,
  resolveUserCompanySlug,
  userMatchesTenant,
  type ResolvedCompany,
} from "../lib/tenancy";

const TENANT_QUERY_KEY = "tenant-company";

type TenantContextValue = {
  tenantCompany: ResolvedCompany | null;
  slugLoading: boolean;
  slugError: string | null;
  isCorrectTenant: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

function tenantFromSession(
  slug: string,
  user: { companyId?: string; companySlug?: string; companyName?: string }
): ResolvedCompany | null {
  if (resolveUserCompanySlug(user) !== slug || !user.companyId) return null;
  return {
    id: user.companyId,
    name: user.companyName ?? slug,
    slug,
    plan: "session",
    is_active: true,
  };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const sessionTenant = useMemo(
    () => (slug && user ? tenantFromSession(slug, user) : null),
    [slug, user]
  );

  const tenantQuery = useQuery({
    queryKey: [TENANT_QUERY_KEY, slug, token],
    queryFn: () => resolveCompanyBySlug(slug!, token),
    enabled: Boolean(slug && token && !sessionTenant),
    staleTime: 5 * 60_000,
  });

  const tenantCompany = sessionTenant ?? tenantQuery.data ?? null;
  const slugLoading = Boolean(slug && !sessionTenant && tenantQuery.isLoading && !tenantQuery.data);
  const slugError = !slug
    ? "No company slug in URL"
    : sessionTenant
      ? null
      : tenantQuery.isError
        ? `No active company found for "${slug}"`
        : !slugLoading && !tenantCompany
          ? `No active company found for "${slug}"`
          : null;

  useEffect(() => {
    if (slugLoading || !tenantCompany || !user) return;
    if (userMatchesTenant(user, tenantCompany)) return;
    const userSlug = resolveUserCompanySlug(user);
    navigate(defaultHomeForUser(user.role, userSlug, user.pageAccess), { replace: true });
  }, [tenantCompany, user, slugLoading, navigate]);

  const isCorrectTenant = Boolean(
    tenantCompany && user && userMatchesTenant(user, tenantCompany)
  );

  const value = useMemo(
    () => ({ tenantCompany, slugLoading, slugError, isCorrectTenant }),
    [tenantCompany, slugLoading, slugError, isCorrectTenant]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
