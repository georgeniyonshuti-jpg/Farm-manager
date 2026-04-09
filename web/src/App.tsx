import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LaborerI18nProvider } from "./i18n/laborerI18n";
import { AppShell } from "./components/layout/AppShell";
import { ClevaSection } from "./routes/ClevaSection";
import { FarmSection } from "./routes/FarmSection";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { LaborerHome } from "./pages/dashboards/LaborerHome";
import { VetHome } from "./pages/dashboards/VetHome";
import { ManagementHome } from "./pages/dashboards/ManagementHome";
import { FarmDailyLogPage } from "./pages/farm/FarmDailyLogPage";
import { FarmOpsReportsPage } from "./pages/farm/FarmOpsReportsPage";
import { FarmFeedPage } from "./pages/farm/FarmFeedPage";
import { FarmInventoryPage } from "./pages/farm/FarmInventoryPage";
import { FarmCheckinPage } from "./pages/farm/FarmCheckinPage";
import { FarmMortalityLogPage } from "./pages/farm/FarmMortalityLogPage";
import { FarmMortalityPage } from "./pages/farm/FarmMortalityPage";
import { FlockScheduleSettingsPage } from "./pages/farm/FlockScheduleSettingsPage";
import { FlockListPage } from "./pages/farm/FlockListPage";
import { FlockDetailPage } from "./pages/farm/FlockDetailPage";
import { FlockFcrPage } from "./pages/farm/FlockFcrPage";
import { FarmFcrRedirectPage } from "./pages/farm/FarmFcrRedirectPage";
import { CreditScoringPage } from "./pages/cleva/CreditScoringPage";
import { InvestorMemosPage } from "./pages/cleva/InvestorMemosPage";
import { PortfolioPage } from "./pages/cleva/PortfolioPage";
import { UserManagementPage } from "./pages/admin/UserManagementPage";
import { SystemConfigPage } from "./pages/admin/SystemConfigPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { LogScheduleSettingsPage } from "./pages/farm/LogScheduleSettingsPage";
import { PayrollImpactPage } from "./pages/farm/PayrollImpactPage";
import { LaborerEarningsPage } from "./pages/laborer/LaborerEarningsPage";
import { ToastProvider } from "./components/Toast";
import { VersionBadge } from "./components/VersionBadge";
import { SystemStatus } from "./components/SystemStatus";
import { InstallPromptBanner } from "./components/pwa/InstallPromptBanner";
import { FarmTreatmentPage } from "./pages/farm/FarmTreatmentPage";
import { FarmSlaughterPage } from "./pages/farm/FarmSlaughterPage";
import { FARM_FIELD_OPS_ROLES } from "./auth/permissions";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LaborerI18nProvider>
        <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            {/* FIX: RBAC — dedicated page when role/workspace denies access */}
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRedirect />} />

              <Route
                path="/dashboard/laborer"
                element={
                  <ProtectedRoute roles={["laborer", "dispatcher", "vet"]}>
                    <LaborerHome />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/vet"
                element={
                  <ProtectedRoute roles={["vet", "vet_manager", "superuser"]}>
                    <VetHome />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/management"
                element={
                  <ProtectedRoute
                    roles={[
                      "manager",
                      "superuser",
                      "procurement_officer",
                      "sales_coordinator",
                    ]}
                  >
                    <ManagementHome />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/laborer/earnings"
                element={
                  <ProtectedRoute roles={["laborer", "dispatcher"]}>
                    <LaborerEarningsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="/farm" element={<FarmSection />}>
                <Route
                  path="flocks"
                  element={
                    <ProtectedRoute
                      roles={["manager", "vet_manager", "vet", "superuser", "procurement_officer", "sales_coordinator"]}
                    >
                      <FlockListPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="flocks/:id"
                  element={
                    <ProtectedRoute
                      roles={["manager", "vet_manager", "vet", "superuser", "procurement_officer", "sales_coordinator"]}
                    >
                      <FlockDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="flocks/:id/fcr"
                  element={
                    <ProtectedRoute
                      roles={["manager", "vet_manager", "vet", "superuser", "procurement_officer", "sales_coordinator"]}
                    >
                      <FlockFcrPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="fcr"
                  element={
                    <ProtectedRoute
                      roles={["manager", "vet_manager", "vet", "superuser", "procurement_officer", "sales_coordinator"]}
                    >
                      <FarmFcrRedirectPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="checkin"
                  element={
                    <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
                      <FarmCheckinPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="mortality-log"
                  element={
                    <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
                      <FarmMortalityLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="daily-log"
                  element={
                    <ProtectedRoute roles={["vet_manager", "manager", "superuser"]}>
                      <FarmDailyLogPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="ops-reports"
                  element={
                    <ProtectedRoute roles={["vet_manager", "manager", "superuser"]}>
                      <FarmOpsReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="feed"
                  element={
                    <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
                      <FarmFeedPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="mortality"
                  element={
                    <ProtectedRoute roles={FARM_FIELD_OPS_ROLES}>
                      <FarmMortalityPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="inventory" element={<FarmInventoryPage />} />
                <Route
                  path="treatments"
                  element={
                    <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
                      <FarmTreatmentPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="slaughter"
                  element={
                    <ProtectedRoute roles={["superuser", "manager", "vet_manager", "vet"]}>
                      <FarmSlaughterPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="batch-schedule"
                  element={
                    <ProtectedRoute roles={["superuser", "manager", "vet_manager"]}>
                      <FlockScheduleSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="schedule-settings"
                  element={
                    <ProtectedRoute roles={["manager", "vet_manager", "superuser"]}>
                      <LogScheduleSettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="payroll"
                  element={
                    <ProtectedRoute roles={["manager", "vet_manager", "superuser"]}>
                      <PayrollImpactPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route path="/cleva" element={<ClevaSection />}>
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="investor-memos" element={<InvestorMemosPage />} />
                <Route path="credit-scoring" element={<CreditScoringPage />} />
              </Route>

              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute superuserOnly>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/system-config"
                element={
                  <ProtectedRoute roles={["vet_manager", "manager", "superuser"]}>
                    <SystemConfigPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
        <VersionBadge />
        <SystemStatus />
        <InstallPromptBanner />
        </ToastProvider>
        </LaborerI18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
