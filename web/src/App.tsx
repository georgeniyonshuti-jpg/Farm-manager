import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LaborerI18nProvider } from "./i18n/laborerI18n";
import { AppShell } from "./components/layout/AppShell";
import { ClevaSection } from "./routes/ClevaSection";
import { FarmSection } from "./routes/FarmSection";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { HomeRedirect } from "./pages/HomeRedirect";
import { LoginPage } from "./pages/LoginPage";
import { FlockDetailPage } from "./pages/farm/FlockDetailPage";
import { FlockFcrPage } from "./pages/farm/FlockFcrPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { ToastProvider } from "./components/Toast";
import { VersionBadge } from "./components/VersionBadge";
import { SystemStatus } from "./components/SystemStatus";
import { InstallPromptBanner } from "./components/pwa/InstallPromptBanner";
import { useAuth } from "./auth/AuthContext";
import { AppLoadingScreen } from "./components/AppLoadingScreen";
import { ThemeProvider } from "./context/ThemeContext";
import { useApiHealthStatus } from "./hooks/useApiHealthStatus";

function AppRoutes() {
  const { bootstrapped } = useAuth();
  const apiStatus = useApiHealthStatus(!bootstrapped);
  if (!bootstrapped) return <AppLoadingScreen apiStatus={apiStatus} />;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        {/* FIX: RBAC — dedicated page when role/workspace denies access */}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/dashboard/laborer" element={null} />
          <Route path="/dashboard/vet" element={null} />
          <Route path="/dashboard/management" element={null} />
          <Route path="/laborer/earnings" element={null} />

          <Route path="/farm" element={<FarmSection />}>
            <Route path="flocks" element={null} />
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
            <Route path="fcr" element={null} />
            <Route path="checkin" element={null} />
            <Route path="mortality-log" element={null} />
            <Route path="daily-log" element={null} />
            <Route path="feed" element={null} />
            <Route path="mortality" element={null} />
            <Route path="vet-logs" element={null} />
            <Route path="inventory" element={null} />
            <Route path="treatments" element={null} />
            <Route path="slaughter" element={null} />
            <Route path="batch-schedule" element={null} />
            <Route path="schedule-settings" element={null} />
            <Route path="checkin-review" element={null} />
            <Route path="payroll" element={null} />
            <Route path="accounting-approvals" element={null} />
            <Route path="odoo-setup" element={null} />
            <Route path="reports" element={null} />
          </Route>

          <Route path="/cleva" element={<ClevaSection />}>
            <Route path="portfolio" element={null} />
            <Route path="business-model" element={null} />
            <Route path="general-lending" element={null} />
            <Route path="investor-memos" element={null} />
            <Route path="credit-scoring" element={null} />
          </Route>

          <Route path="/admin/users" element={null} />
          <Route path="/admin/system-config" element={null} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
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
