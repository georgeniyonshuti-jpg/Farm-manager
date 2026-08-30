import { ClipboardCheck, Home, Pill, Skull, Stethoscope, Wheat } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useLaborerT } from "../../i18n/laborerI18n";
import { MobileFieldBottomNav, type MobileFieldNavItem } from "./MobileFieldBottomNav";

const iconCls = "h-5 w-5";

/** Shell-level bottom tabs for field roles on every farm page (not only hubs). */
export function FieldShellBottomNav() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { can, hasBootstrap } = useFarmCapabilities();
  const tHome = useLaborerT("Home");
  const tRounds = useLaborerT("Rounds");
  const tMortality = useLaborerT("Mortality");
  const tFeed = useLaborerT("Feed");

  if (!user) return null;
  const isField =
    user.role === "laborer" || user.role === "dispatcher" || user.role === "vet";
  if (!isField) return null;

  const canSee = (key: string) => canAccessPageByKey(user, key);
  const showCap = (cap: Parameters<typeof can>[0], pageKey: string) =>
    hasBootstrap ? can(cap) : canSee(pageKey);
  const homeTo =
    user.role === "vet" ? companyHref("/dashboard/vet") : companyHref("/dashboard/laborer");

  const items: MobileFieldNavItem[] = [
    {
      to: homeTo,
      label: tHome,
      end: true,
      icon: <Home className={iconCls} aria-hidden />,
    },
  ];
  if (showCap("checkin", "farm_checkin")) {
    items.push({
      to: companyHref("/farm/checkin"),
      label: tRounds,
      icon: <ClipboardCheck className={iconCls} aria-hidden />,
    });
  }
  if (showCap("mortality", "farm_mortality_log") || showCap("mortality", "farm_mortality")) {
    items.push({
      to: companyHref("/farm/mortality-log"),
      label: tMortality,
      icon: <Skull className={iconCls} aria-hidden />,
    });
  }
  if (showCap("feed_log", "farm_feed")) {
    items.push({
      to: companyHref("/farm/feed"),
      label: tFeed,
      icon: <Wheat className={iconCls} aria-hidden />,
    });
  }
  if (user.role === "vet") {
    if (showCap("vet_log_create", "farm_vet_logs")) {
      items.push({
        to: companyHref("/farm/vet-logs"),
        label: "Vet",
        icon: <Stethoscope className={iconCls} aria-hidden />,
      });
    }
    if (showCap("treatment_rounds", "farm_treatments")) {
      items.push({
        to: companyHref("/farm/treatments"),
        label: "Meds",
        icon: <Pill className={iconCls} aria-hidden />,
      });
    }
  }

  if (items.length < 2) return null;
  return <MobileFieldBottomNav items={items} ariaLabel="Field operations" />;
}
