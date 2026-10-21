/**
 * Market overview — manager glance (native KPIs / packs).
 * Deep dive lives at /dashboard/market/trends.
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { AnalyticsPanel } from "../market/ops/AnalyticsPanel";
import { INSIGHTS_LANE, LaneNav } from "../../components/layout/LaneNav";

export function MarketOverviewPage() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const allowed = canAccessPipelineDesk(user);

  if (!allowed) {
    return <Navigate to={companyHref("/farm/pipeline")} replace />;
  }

  return (
    <ManagerPage>
      <PageHeader
        title="Insights"
        tabs={<LaneNav chrome label="Insights" items={INSIGHTS_LANE} />}
      />
      <AnalyticsPanel mode="glance" />
    </ManagerPage>
  );
}
