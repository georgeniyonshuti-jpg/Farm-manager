import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { resolveUserCompanySlug, tenantPath } from "../lib/tenancy";

export function useCompanyNav() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const slug = user ? resolveUserCompanySlug(user) : "";

  const navTo = useCallback(
    (path: string, options?: { replace?: boolean }): void => {
      if (!slug) {
        console.error("useCompanyNav: no company slug on session user");
        return;
      }
      navigate(tenantPath(slug, path), options);
    },
    [navigate, slug]
  );

  const companyHref = useCallback(
    (path: string): string => {
      if (!slug) return path.startsWith("/") ? path : `/${path}`;
      return tenantPath(slug, path);
    },
    [slug]
  );

  return { navTo, companyHref, slug };
}
