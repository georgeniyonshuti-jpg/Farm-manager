import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { FARM_FIELD_OPS_ROLES } from "../auth/permissions";
import { PersistentPageSlot } from "../components/layout/PersistentPageSlot";
import { UserManagementPage } from "../pages/admin/UserManagementPage";
import { SystemConfigPage } from "../pages/admin/SystemConfigPage";
import { SuperAdminPanelPage } from "../pages/admin/SuperAdminPanelPage";
import { BusinessModelAnalyticsPage } from "../pages/cleva/BusinessModelAnalyticsPage";
import { CreditScoringPage } from "../pages/cleva/CreditScoringPage";
import { GeneralLendingPage } from "../pages/cleva/GeneralLendingPage";
import { InvestorMemosPage } from "../pages/cleva/InvestorMemosPage";
import { PortfolioPage } from "../pages/cleva/PortfolioPage";
import { LaborerHome } from "../pages/dashboards/LaborerHome";
import { ManagementHome } from "../pages/dashboards/ManagementHome";
import { VetHome } from "../pages/dashboards/VetHome";
import { AccountingApprovalsPage } from "../pages/farm/AccountingApprovalsPage";
import { FarmCheckinPage } from "../pages/farm/FarmCheckinPage";
import { FarmCheckinReviewPage } from "../pages/farm/FarmCheckinReviewPage";
import { FarmDailyLogPage } from "../pages/farm/FarmDailyLogPage";
import { FarmFeedPage } from "../pages/farm/FarmFeedPage";
import { FarmInventoryPage } from "../pages/farm/FarmInventoryPage";
import { FarmMortalityLogPage } from "../pages/farm/FarmMortalityLogPage";
import { FarmMortalityPage } from "../pages/farm/FarmMortalityPage";
import { FarmSlaughterPage } from "../pages/farm/FarmSlaughterPage";
import { FarmTreatmentPage } from "../pages/farm/FarmTreatmentPage";
import { FarmVetLogsPage } from "../pages/farm/FarmVetLogsPage";
import { FlockListPage } from "../pages/farm/FlockListPage";
import { FlockScheduleSettingsPage } from "../pages/farm/FlockScheduleSettingsPage";
import { LogScheduleSettingsPage } from "../pages/farm/LogScheduleSettingsPage";
import { ERPNextSetupPage } from "../pages/farm/ERPNextSetupPage";
import { ERPNextEmbedPage } from "../pages/farm/ERPNextEmbedPage";
import { PayrollImpactPage } from "../pages/farm/PayrollImpactPage";
import { ReportsCenterPage } from "../pages/farm/ReportsCenterPage";
import { LaborerEarningsPage } from "../pages/laborer/LaborerEarningsPage";
import { PersistentRouteGuard } from "./PersistentRouteGuard";
import { PersistentWorkspaceGate } from "./PersistentWorkspaceGate";
import { pathExact } from "./persistentPaths";

const FLOCK_ROLES = [
  "manager",
  "vet_manager",
  "vet",
  "superuser",
  "procurement_officer",
  "sales_coordinator",
] as const;

const MANAGEMENT_ROLES = ["manager", "superuser", "procurement_officer", "sales_coordinator"] as const;

/**
 * All authenticated app pages kept mounted; visibility follows the current URL.
 */
export function PersistentAppPages() {
  const { pathname } = useLocation();
  const { user, bootstrapped } = useAuth();

  if (!bootstrapped || !user) return null;

  const p = pathname;

  return (
    <div className="relative isolate w-full min-h-0">
      <PersistentPageSlot active={pathExact(p, "/dashboard/laborer")} mountDelayMs={0}>
        <PersistentRouteGuard roles={["laborer", "dispatcher"]}>
          <LaborerHome />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/vet")} mountDelayMs={100}>
        <PersistentRouteGuard roles={["vet", "vet_manager", "superuser"]}>
          <VetHome />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/management")} mountDelayMs={200}>
        <PersistentRouteGuard roles={[...MANAGEMENT_ROLES]}>
          <ManagementHome />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/laborer/earnings")} mountDelayMs={300}>
        <PersistentRouteGuard roles={["laborer", "dispatcher", "vet"]}>
          <LaborerEarningsPage />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentWorkspaceGate workspace="farm">
        <PersistentPageSlot active={pathExact(p, "/farm/flocks")} mountDelayMs={0}>
          <PersistentRouteGuard roles={[...FLOCK_ROLES]}>
            <FlockListPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin")} mountDelayMs={0}>
          <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
            <FarmCheckinPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality-log")} mountDelayMs={600}>
          <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
            <FarmMortalityLogPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/daily-log")} mountDelayMs={700}>
          <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
            <FarmDailyLogPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/feed")} mountDelayMs={100}>
          <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
            <FarmFeedPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality")} mountDelayMs={800}>
          <PersistentRouteGuard roles={FARM_FIELD_OPS_ROLES}>
            <FarmMortalityPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/vet-logs")} mountDelayMs={1200}>
          <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmVetLogsPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/inventory")} mountDelayMs={900}>
          <FarmInventoryPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/treatments")} mountDelayMs={1600}>
          <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmTreatmentPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/slaughter")} mountDelayMs={1400}>
          <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmSlaughterPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/batch-schedule")} mountDelayMs={1500}>
          <PersistentRouteGuard roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FlockScheduleSettingsPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/schedule-settings")} mountDelayMs={1700}>
          <PersistentRouteGuard roles={["manager", "vet_manager", "superuser"]}>
            <LogScheduleSettingsPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin-review")} mountDelayMs={1100}>
          <PersistentRouteGuard roles={["vet", "manager", "vet_manager", "superuser"]}>
            <FarmCheckinReviewPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/payroll")} mountDelayMs={1800}>
          <PersistentRouteGuard roles={["manager", "vet_manager", "superuser"]}>
            <PayrollImpactPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/accounting-approvals")} mountDelayMs={1900}>
          <PersistentRouteGuard roles={["manager", "superuser"]}>
            <AccountingApprovalsPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/odoo-setup") || pathExact(p, "/farm/erpnext-setup")} mountDelayMs={2000}>
          <PersistentRouteGuard roles={["manager", "superuser"]}>
            <ERPNextSetupPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/erpnext")} mountDelayMs={2050}>
          <PersistentRouteGuard roles={["manager", "superuser"]}>
            <ERPNextEmbedPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/reports")} mountDelayMs={1300}>
          <PersistentRouteGuard roles={["vet", "vet_manager", "manager", "superuser"]}>
            <ReportsCenterPage />
          </PersistentRouteGuard>
        </PersistentPageSlot>
      </PersistentWorkspaceGate>

      <PersistentWorkspaceGate workspace="clevacredit">
        <PersistentPageSlot active={pathExact(p, "/cleva/portfolio")} mountDelayMs={2100}>
          <PortfolioPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/business-model")} mountDelayMs={2200}>
          <BusinessModelAnalyticsPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/general-lending")} mountDelayMs={2300}>
          <GeneralLendingPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/investor-memos")} mountDelayMs={2400}>
          <InvestorMemosPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/cleva/credit-scoring")} mountDelayMs={2500}>
          <CreditScoringPage />
        </PersistentPageSlot>
      </PersistentWorkspaceGate>

      <PersistentPageSlot active={pathExact(p, "/admin/users")} mountDelayMs={2600}>
        <PersistentRouteGuard superuserOnly>
          <UserManagementPage />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/system-config")} mountDelayMs={2700}>
        <PersistentRouteGuard roles={["vet_manager", "manager", "superuser"]}>
          <SystemConfigPage />
        </PersistentRouteGuard>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/super")} mountDelayMs={2800}>
        <PersistentRouteGuard superuserOnly>
          <SuperAdminPanelPage />
        </PersistentRouteGuard>
      </PersistentPageSlot>
    </div>
  );
}
