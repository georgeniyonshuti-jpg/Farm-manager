import { Navigate } from "react-router-dom";
import { useCompanyNav } from "../../hooks/useCompanyNav";

/** Legacy holding page — sellers now use listings with a review banner. */
export function MarketPendingPage() {
  const { companyHref } = useCompanyNav();
  return <Navigate to={companyHref("/market/listings")} replace />;
}
