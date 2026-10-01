import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { FARM_FIELD_OPS_ROLES } from "../auth/permissions";
import { PersistentPageSlot } from "../components/layout/PersistentPageSlot";
import { PersistentRouteGuard } from "./PersistentRouteGuard";
import { PersistentWorkspaceGate } from "./PersistentWorkspaceGate";
import { pathExact } from "./persistentPaths";
import { stripTenantPrefix } from "../lib/tenancy";
import { ErpnextAccessGate } from "../components/guards/ErpnextAccessGate";
import { LaborerHome } from "../pages/dashboards/LaborerHome";
import { VetHome } from "../pages/dashboards/VetHome";
import { FarmCheckinPage } from "../pages/farm/FarmCheckinPage";
import { FarmMortalityLogPage } from "../pages/farm/FarmMortalityLogPage";
import { FarmFeedPage } from "../pages/farm/FarmFeedPage";
import { FarmVetLogsPage } from "../pages/farm/FarmVetLogsPage";
import { FarmTreatmentPage } from "../pages/farm/FarmTreatmentPage";

const FLOCK_ROLES = [
  "manager",
  "vet_manager",
  "vet",
  "superuser",
  "procurement_officer",
] as const;

const MANAGEMENT_ROLES = ["manager", "superuser", "procurement_officer"] as const;

function lazyNamed<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  exportName: keyof T
): ComponentType {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as ComponentType };
  });
}

const ManagementHome = lazyNamed(() => import("../pages/dashboards/ManagementHome"), "ManagementHome");
const LaborerEarningsPage = lazyNamed(() => import("../pages/laborer/LaborerEarningsPage"), "LaborerEarningsPage");
const FlockListPage = lazyNamed(() => import("../pages/farm/FlockListPage"), "FlockListPage");
const FarmDailyLogPage = lazyNamed(() => import("../pages/farm/FarmDailyLogPage"), "FarmDailyLogPage");
const FarmMortalityPage = lazyNamed(() => import("../pages/farm/FarmMortalityPage"), "FarmMortalityPage");
const FarmInventoryPage = lazyNamed(() => import("../pages/farm/FarmInventoryPage"), "FarmInventoryPage");
const FarmSlaughterPage = lazyNamed(() => import("../pages/farm/FarmSlaughterPage"), "FarmSlaughterPage");
const MarketOpsPage = lazyNamed(() => import("../pages/market/MarketOpsPage"), "MarketOpsPage");
const RedirectMarketBuyers = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "RedirectMarketBuyers");
const RedirectMarketPricing = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "RedirectMarketPricing");
const RedirectMarketJobs = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "RedirectMarketJobs");
const RedirectMarketLeads = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "RedirectMarketLeads");
const RedirectMarketVerify = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "RedirectMarketVerify");
const RedirectMarketWeighQueue = lazyNamed(
  () => import("../pages/market/MarketHubRedirect"),
  "RedirectMarketWeighQueue"
);
const DeskCommissionsGate = lazyNamed(() => import("../pages/market/MarketHubRedirect"), "DeskCommissionsGate");
const PipelineScoutPage = lazyNamed(() => import("../pages/farm/PipelineScoutPage"), "PipelineScoutPage");
const PipelineWeighPage = lazyNamed(() => import("../pages/farm/PipelineWeighPage"), "PipelineWeighPage");
const MarketHomePage = lazyNamed(() => import("../pages/market/MarketHomePage"), "MarketHomePage");
const MarketOrdersPage = lazyNamed(() => import("../pages/market/MarketOrdersPage"), "MarketOrdersPage");
const MarketListingsPage = lazyNamed(() => import("../pages/market/MarketListingsPage"), "MarketListingsPage");
const MarketPendingPage = lazyNamed(() => import("../pages/market/MarketPendingPage"), "MarketPendingPage");
const FlockScheduleSettingsPage = lazyNamed(
  () => import("../pages/farm/FlockScheduleSettingsPage"),
  "FlockScheduleSettingsPage"
);
const LogScheduleSettingsPage = lazyNamed(
  () => import("../pages/farm/LogScheduleSettingsPage"),
  "LogScheduleSettingsPage"
);
const FarmCheckinReviewPage = lazyNamed(
  () => import("../pages/farm/FarmCheckinReviewPage"),
  "FarmCheckinReviewPage"
);
const PayrollImpactPage = lazyNamed(() => import("../pages/farm/PayrollImpactPage"), "PayrollImpactPage");
const ERPNextSetupPage = lazyNamed(() => import("../pages/farm/ERPNextSetupPage"), "ERPNextSetupPage");
const ERPNextEmbedPage = lazyNamed(() => import("../pages/farm/ERPNextEmbedPage"), "ERPNextEmbedPage");
const ReportsCenterPage = lazyNamed(() => import("../pages/farm/ReportsCenterPage"), "ReportsCenterPage");
const PortfolioPage = lazyNamed(() => import("../pages/cleva/PortfolioPage"), "PortfolioPage");
const BusinessModelAnalyticsPage = lazyNamed(
  () => import("../pages/cleva/BusinessModelAnalyticsPage"),
  "BusinessModelAnalyticsPage"
);
const GeneralLendingPage = lazyNamed(() => import("../pages/cleva/GeneralLendingPage"), "GeneralLendingPage");
const InvestorMemosPage = lazyNamed(() => import("../pages/cleva/InvestorMemosPage"), "InvestorMemosPage");
const CreditScoringPage = lazyNamed(() => import("../pages/cleva/CreditScoringPage"), "CreditScoringPage");
const UserManagementPage = lazyNamed(() => import("../pages/admin/UserManagementPage"), "UserManagementPage");
const SystemConfigPage = lazyNamed(() => import("../pages/admin/SystemConfigPage"), "SystemConfigPage");
const SuperAdminPanelPage = lazyNamed(() => import("../pages/admin/SuperAdminPanelPage"), "SuperAdminPanelPage");
const SuperAdminCompanyDetailPage = lazyNamed(
  () => import("../pages/admin/SuperAdminCompanyDetailPage"),
  "SuperAdminCompanyDetailPage"
);
const SuperAdminPlansPage = lazyNamed(() => import("../pages/admin/SuperAdminPlansPage"), "SuperAdminPlansPage");
const SuperAdminAnnouncePage = lazyNamed(
  () => import("../pages/admin/SuperAdminAnnouncePage"),
  "SuperAdminAnnouncePage"
);
const SuperAdminRepairPage = lazyNamed(() => import("../pages/admin/SuperAdminRepairPage"), "SuperAdminRepairPage");
function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-[960px] animate-pulse space-y-3 p-4" aria-busy="true">
      <div className="h-8 w-1/3 rounded bg-black/10" />
      <div className="h-24 rounded bg-black/5" />
      <div className="h-24 rounded bg-black/5" />
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

/**
 * Authenticated app pages kept mounted after first visit; chunks load on demand.
 */
export function PersistentAppPages() {
  const { pathname } = useLocation();
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped || !user) return null;

  const p = pathname;

  return (
    <div className="relative isolate w-full min-h-0">
      <PersistentPageSlot active={pathExact(p, "/dashboard/laborer")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard roles={["laborer", "dispatcher"]}>
            <LaborerHome />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/vet")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard roles={["vet", "vet_manager", "superuser"]}>
            <VetHome />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/management")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard roles={[...MANAGEMENT_ROLES]}>
            <ManagementHome />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/laborer/earnings")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard roles={["laborer", "dispatcher", "vet"]}>
            <LaborerEarningsPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentWorkspaceGate workspace="farm">
        <PersistentPageSlot active={pathExact(p, "/farm/flocks")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={[...FLOCK_ROLES]}>
              <FlockListPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
              <FarmCheckinPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality-log")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
              <FarmMortalityLogPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/daily-log")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
              <FarmDailyLogPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/feed")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
              <FarmFeedPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
              <FarmMortalityPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/vet-logs")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
              <FarmVetLogsPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/inventory")} mountDelayMs={0}>
          <LazyPage>
            <FarmInventoryPage />
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/treatments")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
              <FarmTreatmentPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/slaughter")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
              <FarmSlaughterPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/pipeline")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <MarketOpsPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/pipeline/buyers")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <RedirectMarketBuyers />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/pipeline/scout")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard
              roles={["superuser", "sales_coordinator", "vet", "vet_manager", "manager", "company_admin"]}
            >
              <PipelineScoutPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/pipeline/weigh")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard
              roles={["superuser", "sales_coordinator", "vet", "vet_manager", "manager", "company_admin"]}
            >
              <RedirectMarketWeighQueue />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot
          active={(() => {
            const inner = stripTenantPrefix(p);
            return inner.startsWith("/farm/pipeline/weigh/");
          })()}
          mountDelayMs={0}
        >
          <LazyPage>
            <PersistentRouteGuard
              roles={["superuser", "sales_coordinator", "vet", "vet_manager", "manager", "company_admin"]}
            >
              <PipelineWeighPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["buyer", "superuser", "sales_coordinator"]}>
              <MarketHomePage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/orders")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["buyer", "superuser", "sales_coordinator"]}>
              <MarketOrdersPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/listings")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["company_admin", "manager", "superuser"]}>
              <MarketListingsPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/pending")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["buyer", "company_admin", "manager", "superuser"]}>
              <MarketPendingPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/verify")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <RedirectMarketVerify />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/leads")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <RedirectMarketLeads />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/rates")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <RedirectMarketPricing />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/jobs")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "sales_coordinator"]}>
              <RedirectMarketJobs />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/market/commissions")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard
              roles={["superuser", "sales_coordinator", "vet", "vet_manager", "manager", "company_admin"]}
            >
              <DeskCommissionsGate />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/batch-schedule")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
              <FlockScheduleSettingsPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/schedule-settings")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["manager", "vet_manager", "superuser"]}>
              <LogScheduleSettingsPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin-review")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["vet", "manager", "vet_manager", "superuser"]}>
              <FarmCheckinReviewPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/payroll")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["manager", "vet_manager", "superuser"]}>
              <PayrollImpactPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/erpnext-setup")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["manager", "superuser"]}>
              <ErpnextAccessGate>
                <ERPNextSetupPage />
              </ErpnextAccessGate>
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/erpnext")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["manager", "superuser"]}>
              <ErpnextAccessGate>
                <ERPNextEmbedPage />
              </ErpnextAccessGate>
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/reports")} mountDelayMs={0}>
          <LazyPage>
            <PersistentRouteGuard roles={["vet", "vet_manager", "manager", "superuser"]}>
              <ReportsCenterPage />
            </PersistentRouteGuard>
          </LazyPage>
        </PersistentPageSlot>
      </PersistentWorkspaceGate>

      <PersistentWorkspaceGate workspace="clevacredit">
        <PersistentPageSlot active={pathExact(p, "/cleva/portfolio")} mountDelayMs={0}>
          <LazyPage>
            <PortfolioPage />
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/business-model")} mountDelayMs={0}>
          <LazyPage>
            <BusinessModelAnalyticsPage />
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/general-lending")} mountDelayMs={0}>
          <LazyPage>
            <GeneralLendingPage />
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/investor-memos")} mountDelayMs={0}>
          <LazyPage>
            <InvestorMemosPage />
          </LazyPage>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/credit-scoring")} mountDelayMs={0}>
          <LazyPage>
            <CreditScoringPage />
          </LazyPage>
        </PersistentPageSlot>
      </PersistentWorkspaceGate>

      <PersistentPageSlot active={pathExact(p, "/admin/users")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard userManagementAccess>
            <UserManagementPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/system-config")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard roles={["vet_manager", "manager", "company_admin", "superuser"]}>
            <SystemConfigPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/super")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard superuserOnly>
            <SuperAdminPanelPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot
        active={/^\/admin\/super\/companies\/[^/]+$/.test(stripTenantPrefix(p))}
        mountDelayMs={0}
      >
        <LazyPage>
          <PersistentRouteGuard superuserOnly>
            <SuperAdminCompanyDetailPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/super/plans")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard superuserOnly>
            <SuperAdminPlansPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/super/announce")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard superuserOnly>
            <SuperAdminAnnouncePage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/super/repair")} mountDelayMs={0}>
        <LazyPage>
          <PersistentRouteGuard superuserOnly>
            <SuperAdminRepairPage />
          </PersistentRouteGuard>
        </LazyPage>
      </PersistentPageSlot>
    </div>
  );
}
