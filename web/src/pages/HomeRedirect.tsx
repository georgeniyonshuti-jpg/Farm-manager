import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isBuyerRole, isMarketOnlySeller } from "../auth/permissions";
import { fetchMarketMe } from "../api/pipeline.api";
import { useOnboardingStatus } from "../hooks/useOnboardingStatus";
import { resolveUserCompanySlug, tenantPath } from "../lib/tenancy";
import { defaultHomeForUser } from "../routes/ProtectedRoute";

export function HomeRedirect() {
  const { user, token } = useAuth();
  const { flockCount, teamCount, trialExpired, loading } = useOnboardingStatus();
  const [marketGate, setMarketGate] = useState<"loading" | "pending" | "ok">("loading");

  useEffect(() => {
    if (!user) {
      setMarketGate("ok");
      return;
    }
    const needsGate = user.role === "company_admin" || user.role === "manager";
    if (!needsGate) {
      setMarketGate("ok");
      return;
    }
    let cancelled = false;
    void fetchMarketMe(token)
      .then((me) => {
        if (cancelled) return;
        if (
          (me.accountType === "buyer" || me.accountType === "farmer") &&
          me.verificationStatus !== "verified"
        ) {
          setMarketGate("pending");
        } else {
          setMarketGate("ok");
        }
      })
      .catch(() => {
        if (!cancelled) setMarketGate("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  if (!user) return <Navigate to="/login" replace />;
  const slug = resolveUserCompanySlug(user);
  if (loading || marketGate === "loading") return null;
  if (trialExpired && !isBuyerRole(user)) return <Navigate to="/billing/trial-expired" replace />;
  if (marketGate === "pending") {
    return <Navigate to={tenantPath(slug, "market/pending")} replace />;
  }
  const isFirstLogin =
    flockCount === 0 &&
    teamCount <= 1 &&
    (user.role === "manager" || user.role === "company_admin" || user.role === "superuser");
  if (isFirstLogin && !isBuyerRole(user) && !isMarketOnlySeller(user)) {
    return <Navigate to={tenantPath(slug, "welcome")} replace />;
  }
  return <Navigate to={defaultHomeForUser(user.role, slug, user.pageAccess)} replace />;
}
