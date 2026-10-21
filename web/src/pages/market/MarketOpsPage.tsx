import { Navigate, useSearchParams } from "react-router-dom";
import { useCompanyNav } from "../../hooks/useCompanyNav";

export type MarketOpsTab = "today" | "book" | "buyers" | "pricing" | "scouts";

export function MarketOpsPage() {
  const { companyHref } = useCompanyNav();
  const [params] = useSearchParams();
  const tab = params.get("tab");
  const tool = params.get("tool");
  if (tab === "analytics") {
    return <Navigate to={companyHref("/dashboard/market")} replace />;
  }
  if (tool === "price" || tab === "pricing" || tab === "book" || tab === "scouts") {
    return <Navigate to={companyHref("/farm/pipeline/flocks")} replace />;
  }
  return <Navigate to={companyHref("/farm/pipeline/people")} replace />;
}
