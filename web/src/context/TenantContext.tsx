import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";
import {
  resolveCompanyBySlug,
  resolveUserCompanySlug,
  userMatchesTenant,
  type ResolvedCompany,
} from "../lib/tenancy";

type TenantContextValue = {
  tenantCompany: ResolvedCompany | null;
  slugLoading: boolean;
  slugError: string | null;
  isCorrectTenant: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [tenantCompany, setTenantCompany] = useState<ResolvedCompany | null>(null);
  const [slugLoading, setSlugLoading] = useState(true);
  const [slugError, setSlugError] = useState<string | null>(null);

  const loadSlug = useCallback(async (s: string) => {
    setSlugLoading(true);
    setSlugError(null);
    const company = await resolveCompanyBySlug(s, token);
    if (!company) {
      setSlugError(`No active company found for "${s}"`);
      setTenantCompany(null);
    } else {
      setTenantCompany(company);
    }
    setSlugLoading(false);
  }, [token]);

  useEffect(() => {
    if (!slug) {
      setSlugError("No company slug in URL");
      setSlugLoading(false);
      return;
    }
    void loadSlug(slug);
  }, [slug, loadSlug]);

  useEffect(() => {
    if (slugLoading || !tenantCompany || !user) return;
    if (userMatchesTenant(user, tenantCompany)) return;
    const userSlug = resolveUserCompanySlug(user);
    navigate(defaultHomeForUser(user.role, userSlug), { replace: true });
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
  if (!ctx) throw new Error("useTenant must be used inside TenantProvider");
  return ctx;
}
