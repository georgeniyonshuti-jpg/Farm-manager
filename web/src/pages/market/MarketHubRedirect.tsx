import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import type { MarketOpsTab } from "./MarketOpsPage";
import { MarketCommissionsPage } from "./MarketCommissionsPage";
import { PipelineWeighPage } from "../farm/PipelineWeighPage";

type Props = {
  tab?: MarketOpsTab;
  panel?: string;
  queue?: string;
};

/** Old desk tabs now land on People or Flocks. */
export function MarketHubRedirect({ tab = "today" }: Props) {
  const { companyHref } = useCompanyNav();
  const to =
    tab === "pricing" || tab === "book" || tab === "scouts"
      ? "/farm/pipeline/flocks"
      : "/farm/pipeline/people";
  return <Navigate to={companyHref(to)} replace />;
}

export function RedirectMarketBuyers() {
  return <MarketHubRedirect tab="buyers" />;
}
export function RedirectMarketPricing() {
  return <MarketHubRedirect tab="pricing" />;
}
export function RedirectMarketJobs() {
  return <MarketHubRedirect tab="today" queue="jobs" />;
}
export function RedirectMarketLeads() {
  return <MarketHubRedirect tab="buyers" panel="leads" />;
}
export function RedirectMarketVerify() {
  return <MarketHubRedirect tab="buyers" panel="verify" />;
}
export function RedirectMarketWeighQueue() {
  const { user } = useAuth();
  if (canAccessPipelineDesk(user)) {
    return <MarketHubRedirect tab="scouts" panel="weigh" />;
  }
  return <PipelineWeighPage />;
}
export function RedirectMarketScoutPay() {
  return <MarketHubRedirect tab="scouts" panel="pay" />;
}

/** Desk ops → Scouts Pay panel; field scouts keep their commissions page. */
export function DeskCommissionsGate() {
  const { user } = useAuth();
  if (canAccessPipelineDesk(user)) {
    return <RedirectMarketScoutPay />;
  }
  return <MarketCommissionsPage />;
}
