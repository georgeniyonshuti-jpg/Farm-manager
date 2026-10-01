import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { useAuth } from "../../auth/AuthContext";
import { isBuyerRole } from "../../auth/permissions";
import { fetchMarketMe } from "../../api/pipeline.api";
import { Button } from "../../components/ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";

/** Shown while a farmer account awaits Cleva ops verification. */
export function MarketPendingPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const [status, setStatus] = useState<string>("pending");
  const [accountType, setAccountType] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const me = await fetchMarketMe(token);
      setStatus(me.verificationStatus);
      setAccountType(me.accountType);
    } catch {
      setStatus("pending");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [token]);

  if (isBuyerRole(user)) {
    return <Navigate to={companyHref("/market")} replace />;
  }

  if (!loading && status === "verified") {
    const home = accountType === "buyer" ? companyHref("/market") : companyHref("/market/listings");
    return <Navigate to={home} replace />;
  }

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead title="Your farm account" />
      <div className="store-account-strip">
        <p className="store-account-name">{user?.companyName || user?.displayName || "Seller"}</p>
        {user?.email ? <p className="store-account-meta">{user.email}</p> : null}
        <p className="store-account-status">Status · {status || "pending"}</p>
      </div>
      <div className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-6 text-center">
        <p className="text-lg font-semibold text-[var(--store-ink)]">Cleva is reviewing your farm</p>
        <p className="mt-2 text-sm text-[var(--store-ink-soft)]">
          Once verified, you can list birds, take jobs, and publish a storefront.
        </p>
        <Button type="button" className="mt-6" variant="secondary" onClick={() => void reload()}>
          Check again
        </Button>
      </div>
    </div>
  );
}
