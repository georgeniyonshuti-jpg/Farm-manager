import { useAuth } from "../auth/AuthContext";
import { hasCapability, type FarmCapabilities } from "../auth/farmBootstrap";
import { canAccessPageByKey } from "../auth/permissions";
import { useFarmBootstrapContext } from "../context/FarmBootstrapContext";

const CAPABILITY_PAGE_FALLBACK: Partial<Record<keyof FarmCapabilities, string>> = {
  checkin: "farm_checkin",
  feed_log: "farm_feed",
  mortality: "farm_mortality_log",
  vet_log_create: "farm_vet_logs",
  treatment_rounds: "farm_treatments",
  medicine_stock: "farm_inventory",
  slaughter: "farm_slaughter",
  review_queue: "farm_checkin_review",
  payroll_visible: "laborer_earnings",
};

export function useFarmCapabilities() {
  const { user } = useAuth();
  const ctx = useFarmBootstrapContext();

  function can(cap: keyof FarmCapabilities): boolean {
    if (ctx.hasBootstrap && ctx.capabilities) {
      return hasCapability(ctx.capabilities, cap);
    }
    const pageKey = CAPABILITY_PAGE_FALLBACK[cap];
    if (pageKey && user) return canAccessPageByKey(user, pageKey);
    return true;
  }

  return {
    ...ctx,
    can,
  };
}

export const ERPNEXT_ACCESS_MESSAGE = "ERPNext access is not offered for this company";
