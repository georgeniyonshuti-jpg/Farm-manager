import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LaborerI18nProvider } from "./i18n/laborerI18n";
import { AppShell } from "./components/layout/AppShell";
import { ClevaSection } from "./routes/ClevaSection";
import { FarmSection } from "./routes/FarmSection";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/ForgotPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { WelcomePage } from "./pages/WelcomePage";
import { PricingPage } from "./pages/PricingPage";
import { TrialExpiredPage } from "./pages/TrialExpiredPage";
import { BillingCancelledPage, BillingSuccessPage } from "./pages/BillingResultPages";
import { SuperAdminRoute } from "./routes/SuperAdminRoute";
import { FlockDetailPage } from "./pages/farm/FlockDetailPage";
import { AccessDeniedRedirect } from "./routes/AccessDeniedRedirect";
import { ToastProvider } from "./components/Toast";
import { LocaleToastBridge } from "./components/LocaleToastBridge";
import { VersionBadge } from "./components/VersionBadge";
import { SystemStatus } from "./components/SystemStatus";
import { InstallPromptBanner } from "./components/pwa/InstallPromptBanner";
import { useAuth } from "./auth/AuthContext";
import { AppLoadingScreen } from "./components/AppLoadingScreen";
import { PublicLayout } from "./components/public/PublicLayout";
import { PublicMarketPage } from "./pages/public/PublicMarketPage";
import { PublicLotDetailPage } from "./pages/public/PublicLotDetailPage";
import { PublicFarmPage } from "./pages/public/PublicFarmPage";
import { PublicFarmsPage } from "./pages/public/PublicFarmsPage";
import { HowItWorksPage } from "./pages/public/HowItWorksPage";
import { SellYourBirdsPage } from "./pages/public/SellYourBirdsPage";

function FlockFcrLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  const q = id ? `?flockId=${encodeURIComponent(id)}` : "";
  return <Navigate to={`../../../vet-logs${q}`} replace />;
}
import { ThemeProvider } from "./context/ThemeContext";
import { useApiHealthStatus } from "./hooks/useApiHealthStatus";
import { TenantProvider } from "./context/TenantContext";
import { TenantGuard } from "./components/guards/TenantGuard";
import { LegacyTenantRedirect } from "./routes/LegacyTenantRedirect";
import { ERPNextOAuthCallbackPage } from "./pages/auth/ERPNextOAuthCallbackPage";
import { ClevaOAuthCallbackPage } from "./pages/auth/ClevaOAuthCallbackPage";
import { RootRedirect } from "./routes/RootRedirect";
import { FarmBootstrapProvider } from "./context/FarmBootstrapContext";
import { ActiveFlockProvider } from "./context/ActiveFlockContext";
import { contractRouteAliasRoutes } from "./routes/ContractRouteAliases";

function AppRoutes() {
  const { bootstrapped } = useAuth();
  const { pathname } = useLocation();
  const isPublicStore = pathname.startsWith("/market");
  const apiStatus = useApiHealthStatus(!bootstrapped && !isPublicStore);
  if (!bootstrapped && !isPublicStore) return <AppLoadingScreen apiStatus={apiStatus} />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/erpnext/callback" element={<ERPNextOAuthCallbackPage />} />
      <Route path="/auth/cleva/callback" element={<ClevaOAuthCallbackPage />} />
      <Route path="/billing/pricing" element={<PricingPage />} />
      <Route path="/billing/success" element={<BillingSuccessPage />} />
      <Route path="/billing/cancelled" element={<BillingCancelledPage />} />
      <Route path="/billing/trial-expired" element={<TrialExpiredPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/market" element={<PublicMarketPage />} />
        <Route path="/market/lot/:publicRef" element={<PublicLotDetailPage />} />
        <Route path="/market/farms" element={<PublicFarmsPage />} />
        <Route path="/market/farm/:slug" element={<PublicFarmPage />} />
        <Route path="/market/how-it-works" element={<HowItWorksPage />} />
        <Route path="/market/sell" element={<SellYourBirdsPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/unauthorized" element={<AccessDeniedRedirect />} />

        <Route path="/dashboard/*" element={<LegacyTenantRedirect />} />
        <Route path="/farm/*" element={<LegacyTenantRedirect />} />
        <Route path="/cleva/*" element={<LegacyTenantRedirect />} />
        <Route path="/laborer/*" element={<LegacyTenantRedirect />} />
        <Route path="/admin/*" element={<LegacyTenantRedirect />} />
        <Route path="/welcome" element={<LegacyTenantRedirect />} />

        <Route
          path="/app/:slug"
          element={
            <TenantProvider>
              <TenantGuard>
                <FarmBootstrapProvider>
                  <ActiveFlockProvider>
                    <AppShell />
                  </ActiveFlockProvider>
                </FarmBootstrapProvider>
              </TenantGuard>
            </TenantProvider>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="welcome" element={<WelcomePage />} />

          <Route path="dashboard/laborer" element={null} />
          <Route path="dashboard/vet" element={null} />
          <Route path="dashboard/management" element={null} />
          <Route path="laborer/earnings" element={null} />

          <Route path="farm" element={<FarmSection />}>
            <Route path="flocks" element={null} />
            <Route
              path="flocks/:id"
              element={
                <ProtectedRoute
                  roles={["manager", "vet_manager", "vet", "superuser", "procurement_officer"]}
                >
                  <FlockDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="flocks/:id/fcr" element={<FlockFcrLegacyRedirect />} />
            <Route path="fcr" element={<Navigate to="../vet-logs" replace />} />
            <Route path="checkin" element={null} />
            <Route path="mortality-log" element={null} />
            <Route path="daily-log" element={null} />
            <Route path="feed" element={null} />
            <Route path="mortality" element={null} />
            <Route path="vet-logs" element={null} />
            <Route path="inventory" element={null} />
            <Route path="treatments" element={null} />
            <Route path="slaughter" element={null} />
            <Route path="pipeline" element={null} />
            <Route path="pipeline/buyers" element={null} />
            <Route path="pipeline/scout" element={null} />
            <Route path="pipeline/weigh" element={null} />
            <Route path="pipeline/weigh/:lotId" element={null} />
            <Route path="batch-schedule" element={null} />
            <Route path="schedule-settings" element={null} />
            <Route path="checkin-review" element={null} />
            <Route path="payroll" element={null} />
            <Route path="erpnext-setup" element={null} />
            <Route path="erpnext" element={null} />
            <Route path="reports" element={null} />
          </Route>

          <Route path="market" element={null} />
          <Route path="market/orders" element={null} />
          <Route path="market/listings" element={null} />
          <Route path="market/pending" element={null} />
          <Route path="market/verify" element={null} />
          <Route path="market/leads" element={null} />
          <Route path="market/rates" element={null} />
          <Route path="market/jobs" element={null} />
          <Route path="market/commissions" element={null} />

          <Route path="cleva" element={<ClevaSection />}>
            <Route path="portfolio" element={null} />
            <Route path="business-model" element={null} />
            <Route path="general-lending" element={null} />
            <Route path="investor-memos" element={null} />
            <Route path="credit-scoring" element={null} />
          </Route>

          <Route path="admin/users" element={null} />
          <Route path="admin/system-config" element={null} />

          <Route element={<SuperAdminRoute />}>
            <Route path="admin/super" element={null} />
            <Route path="admin/super/companies/:companyId" element={null} />
            <Route path="admin/super/plans" element={null} />
            <Route path="admin/super/announce" element={null} />
            <Route path="admin/super/repair" element={null} />
          </Route>

          {contractRouteAliasRoutes()}

          <Route path="*" element={<HomeRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <LaborerI18nProvider>
            <ToastProvider>
              <LocaleToastBridge />
              <AppRoutes />
              <VersionBadge />
              <SystemStatus />
              <InstallPromptBanner />
            </ToastProvider>
          </LaborerI18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
