import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  capabilitiesForFarm,
  erpnextAccessForFarm,
  farmForSlug,
  todayForFarm,
  type FarmBootstrap,
  type FarmBootstrapFarm,
  type FarmCapabilities,
  type FarmTodayPayload,
  type FieldReportingMode,
  normalizeFieldReportingMode,
} from "../auth/farmBootstrap";

export type FarmBootstrapContextValue = {
  bootstrap: FarmBootstrap | null;
  farm: FarmBootstrapFarm | null;
  capabilities: FarmCapabilities | null;
  erpnextAccess: boolean;
  today: FarmTodayPayload | null;
  erpAppRole: string | null;
  hasBootstrap: boolean;
  fieldReportingMode: FieldReportingMode;
};

const FarmBootstrapContext = createContext<FarmBootstrapContextValue | null>(null);

export function FarmBootstrapProvider({ children }: { children: ReactNode }) {
  const { farmBootstrap, user } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const slugKey = slug ?? user?.companySlug ?? "";

  const value = useMemo<FarmBootstrapContextValue>(() => {
    const bootstrap = farmBootstrap;
    const farm = farmForSlug(bootstrap, slugKey);
    return {
      bootstrap,
      farm,
      capabilities: capabilitiesForFarm(bootstrap, slugKey),
      erpnextAccess: erpnextAccessForFarm(bootstrap, slugKey),
      today: todayForFarm(bootstrap, slugKey),
      erpAppRole: bootstrap?.role ?? user?.erpAppRole ?? null,
      hasBootstrap: Boolean(bootstrap),
      fieldReportingMode: normalizeFieldReportingMode(
        farm?.field_reporting_mode ?? bootstrap?.field_reporting_mode
      ),
    };
  }, [farmBootstrap, slugKey, user?.erpAppRole]);

  return (
    <FarmBootstrapContext.Provider value={value}>{children}</FarmBootstrapContext.Provider>
  );
}

export function useFarmBootstrapContext(): FarmBootstrapContextValue {
  const ctx = useContext(FarmBootstrapContext);
  if (!ctx) {
    return {
      bootstrap: null,
      farm: null,
      capabilities: null,
      erpnextAccess: true,
      today: null,
      erpAppRole: null,
      hasBootstrap: false,
      fieldReportingMode: "vet_only",
    };
  }
  return ctx;
}
