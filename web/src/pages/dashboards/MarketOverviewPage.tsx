/**
 * Market overview — manager glance (native KPIs / packs).
 * Deep dive lives at /dashboard/market/trends.
 */

import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { AnalyticsPanel } from "../market/ops/AnalyticsPanel";

export function MarketOverviewPage() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const allowed = canAccessPipelineDesk(user);

  if (!allowed) {
    return <Navigate to={companyHref("/farm/pipeline")} replace />;
  }

  return (
    <ManagerPage>
      <PageHeader
        title="Market overview"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={companyHref("/dashboard/market/recruitment")}
              className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              Recruitment →
            </Link>
            <Link
              to={companyHref("/dashboard/market/trends")}
              className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              Market trends →
            </Link>
          </div>
        }
      />
      <AnalyticsPanel
        mode="glance"
        trendsHref={companyHref("/dashboard/market/trends")}
        onOpenSignups={() => navigate(companyHref("/admin/signups"))}
      />
    </ManagerPage>
  );
}
