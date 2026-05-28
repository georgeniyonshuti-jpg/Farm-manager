import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { FARM_FIELD_OPS_ROLES } from "../auth/permissions";
import { PersistentPageSlot } from "../components/layout/PersistentPageSlot";
import { UserManagementPage } from "../pages/admin/UserManagementPage";
import { SystemConfigPage } from "../pages/admin/SystemConfigPage";
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
import { FarmFcrRedirectPage } from "../pages/farm/FarmFcrRedirectPage";
import { FarmInventoryPage } from "../pages/farm/FarmInventoryPage";
import { FarmMortalityLogPage } from "../pages/farm/FarmMortalityLogPage";
import { FarmMortalityPage } from "../pages/farm/FarmMortalityPage";
import { FarmSlaughterPage } from "../pages/farm/FarmSlaughterPage";
import { FarmTreatmentPage } from "../pages/farm/FarmTreatmentPage";
import { FarmVetLogsPage } from "../pages/farm/FarmVetLogsPage";
import { FlockListPage } from "../pages/farm/FlockListPage";
import { FlockScheduleSettingsPage } from "../pages/farm/FlockScheduleSettingsPage";
import { LogScheduleSettingsPage } from "../pages/farm/LogScheduleSettingsPage";
import { OdooSetupPage } from "../pages/farm/OdooSetupPage";
import { PayrollImpactPage } from "../pages/farm/PayrollImpactPage";
import { ReportsCenterPage } from "../pages/farm/ReportsCenterPage";
import { LaborerEarningsPage } from "../pages/laborer/LaborerEarningsPage";
import { ProtectedRoute, WorkspaceGate } from "./ProtectedRoute";
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
    <>
      <PersistentPageSlot active={pathExact(p, "/dashboard/laborer")} mountDelayMs={0}>
        <ProtectedRoute roles={["laborer", "dispatcher", "vet"]}>
          <LaborerHome />
        </ProtectedRoute>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/vet")} mountDelayMs={100}>
        <ProtectedRoute roles={["vet", "vet_manager", "superuser"]}>
          <VetHome />
        </ProtectedRoute>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/dashboard/management")} mountDelayMs={200}>
        <ProtectedRoute roles={[...MANAGEMENT_ROLES]}>
          <ManagementHome />
        </ProtectedRoute>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/laborer/earnings")} mountDelayMs={300}>
        <ProtectedRoute roles={["laborer", "dispatcher", "vet"]}>
          <LaborerEarningsPage />
        </ProtectedRoute>
      </PersistentPageSlot>

      <WorkspaceGate workspace="farm">
        <PersistentPageSlot active={pathExact(p, "/farm/flocks")} mountDelayMs={0}>
          <ProtectedRoute roles={[...FLOCK_ROLES]}>
            <FlockListPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/fcr")} mountDelayMs={500}>
          <ProtectedRoute roles={[...FLOCK_ROLES]}>
            <FarmFcrRedirectPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin")} mountDelayMs={0}>
          <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
            <FarmCheckinPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality-log")} mountDelayMs={600}>
          <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
            <FarmMortalityLogPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/daily-log")} mountDelayMs={700}>
          <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
            <FarmDailyLogPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/feed")} mountDelayMs={100}>
          <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
            <FarmFeedPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/mortality")} mountDelayMs={800}>
          <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
            <FarmMortalityPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/vet-logs")} mountDelayMs={1200}>
          <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmVetLogsPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/inventory")} mountDelayMs={900}>
          <FarmInventoryPage />
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/treatments")} mountDelayMs={1600}>
          <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmTreatmentPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/slaughter")} mountDelayMs={1400}>
          <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FarmSlaughterPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/batch-schedule")} mountDelayMs={1500}>
          <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
            <FlockScheduleSettingsPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/schedule-settings")} mountDelayMs={1700}>
          <ProtectedRoute roles={["manager", "vet_manager", "superuser"]}>
            <LogScheduleSettingsPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/checkin-review")} mountDelayMs={1100}>
          <ProtectedRoute roles={["vet", "manager", "vet_manager", "superuser"]}>
            <FarmCheckinReviewPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/payroll")} mountDelayMs={1800}>
          <ProtectedRoute roles={["manager", "vet_manager", "superuser"]}>
            <PayrollImpactPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/accounting-approvals")} mountDelayMs={1900}>
          <ProtectedRoute roles={["manager", "superuser"]}>
            <AccountingApprovalsPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/odoo-setup")} mountDelayMs={2000}>
          <ProtectedRoute roles={["manager", "superuser"]}>
            <OdooSetupPage />
          </ProtectedRoute>
        </PersistentPageSlot>

        <PersistentPageSlot active={pathExact(p, "/farm/reports")} mountDelayMs={1300}>
          <ProtectedRoute roles={["vet", "vet_manager", "manager", "superuser"]}>
            <ReportsCenterPage />
          </ProtectedRoute>
        </PersistentPageSlot>
      </WorkspaceGate>

      <WorkspaceGate workspace="clevacredit">
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
      </WorkspaceGate>

      <PersistentPageSlot active={pathExact(p, "/admin/users")} mountDelayMs={2600}>
        <ProtectedRoute superuserOnly>
          <UserManagementPage />
        </ProtectedRoute>
      </PersistentPageSlot>

      <PersistentPageSlot active={pathExact(p, "/admin/system-config")} mountDelayMs={2700}>
        <ProtectedRoute roles={["vet_manager", "manager", "superuser"]}>
          <SystemConfigPage />
        </ProtectedRoute>
      </PersistentPageSlot>
    </>
  );
}
