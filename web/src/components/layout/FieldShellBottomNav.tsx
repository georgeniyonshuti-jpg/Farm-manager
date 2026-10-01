import {
  BadgeCheck,
  ClipboardCheck,
  Home,
  Inbox,
  Package,
  Store,
  Pill,
  Search,
  ShoppingBag,
  Skull,
  Stethoscope,
  Tag,
  Truck,
  Wallet,
  Wheat,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  canAccessPageByKey,
  canAccessPipelineDesk,
  canListFarmerMarketLots,
  canScoutPipeline,
  isBuyerRole,
  isMarketOnlySeller,
  isPipelineSalesRole,
  shouldShowRoundCheckin,
} from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useLaborerT } from "../../i18n/laborerI18n";
import { MobileFieldBottomNav, type MobileFieldNavItem } from "./MobileFieldBottomNav";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";
import { useLocation } from "react-router-dom";
import { stripTenantPrefix } from "../../lib/tenancy";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT } from "../../lib/publicStoreCopy";

const iconCls = "h-5 w-5";

/** Shell-level bottom tabs for field roles on every farm page (not only hubs). */
export function FieldShellBottomNav() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { activeFlockId } = useActiveFlock();
  const { can, hasBootstrap, fieldReportingMode } = useFarmCapabilities();
  const location = useLocation();
  const appPath = stripTenantPrefix(location.pathname);
  const marketLocale = useOptionalMarketLocale()?.locale || "en";
  const tHome = useLaborerT("Home");
  const tRounds = useLaborerT("Rounds");
  const tMortality = useLaborerT("Mortality");
  const tFeed = useLaborerT("Feed");
  const tVet = useLaborerT("Vet");
  const tMeds = useLaborerT("Meds");

  if (!user) return null;

  if (isBuyerRole(user)) {
    return (
      <MobileFieldBottomNav
        ariaLabel="Buyer market"
        items={[
          {
            to: companyHref("/market"),
            label: "Market",
            end: true,
            icon: <ShoppingBag className={iconCls} aria-hidden />,
          },
          {
            to: companyHref("/market/orders"),
            label: "Orders",
            icon: <Package className={iconCls} aria-hidden />,
          },
        ]}
      />
    );
  }

  if (canAccessPipelineDesk(user) && (appPath.startsWith("/market") || appPath.startsWith("/farm/pipeline"))) {
    const deskItems: MobileFieldNavItem[] = [
      {
        to: companyHref("/farm/pipeline"),
        label: "Today",
        end: true,
        icon: <Truck className={iconCls} aria-hidden />,
        active: appPath.startsWith("/farm/pipeline") && !location.search.includes("tab="),
      },
      {
        to: companyHref("/farm/pipeline?tab=book"),
        label: "Book",
        icon: <Package className={iconCls} aria-hidden />,
        active: location.search.includes("tab=book"),
      },
      {
        to: companyHref("/farm/pipeline?tab=buyers"),
        label: "Buyers",
        icon: <Inbox className={iconCls} aria-hidden />,
        active: location.search.includes("tab=buyers"),
      },
      {
        to: companyHref("/farm/pipeline?tab=pricing"),
        label: "Pricing",
        icon: <Tag className={iconCls} aria-hidden />,
        active: location.search.includes("tab=pricing"),
      },
      {
        to: companyHref("/farm/pipeline?tab=scouts"),
        label: "Scouts",
        icon: <Wallet className={iconCls} aria-hidden />,
        active: location.search.includes("tab=scouts"),
      },
    ];
    return <MobileFieldBottomNav className="md:hidden" items={deskItems} ariaLabel="Market ops" />;
  }

  if (isPipelineSalesRole(user)) {
    const salesItems: MobileFieldNavItem[] = [
      {
        to: companyHref("/farm/pipeline"),
        label: "Market",
        end: true,
        icon: <Truck className={iconCls} aria-hidden />,
      },
      {
        to: companyHref("/market"),
        label: "Board",
        icon: <ShoppingBag className={iconCls} aria-hidden />,
      },
      {
        to: companyHref("/farm/pipeline?tab=buyers&panel=leads"),
        label: "Leads",
        icon: <Inbox className={iconCls} aria-hidden />,
      },
      {
        to: companyHref("/farm/pipeline?tab=scouts"),
        label: "Scouts",
        icon: <BadgeCheck className={iconCls} aria-hidden />,
      },
      {
        to: companyHref("/farm/pipeline?tab=scouts&panel=pay"),
        label: "Pay",
        icon: <Wallet className={iconCls} aria-hidden />,
      },
    ];
    return <MobileFieldBottomNav items={salesItems} ariaLabel="Market ops" />;
  }

  // Farmer listing shell on market routes — phone only; desktop uses PageTabs.
  if (canListFarmerMarketLots(user) && appPath.startsWith("/market")) {
    const listingsTab = new URLSearchParams(location.search).get("tab");
    const onListings = appPath.startsWith("/market/listings");
    const tNav = (key: "farmerNavListings" | "farmerNavOrders" | "farmerNavFarmPage") =>
      storeT(marketLocale, key);
    const sellerItems: MobileFieldNavItem[] = [
      {
        to: companyHref("/market/listings"),
        label: tNav("farmerNavListings"),
        icon: <Package className={iconCls} aria-hidden />,
        active: onListings && listingsTab !== "jobs" && listingsTab !== "storefront",
      },
      {
        to: companyHref("/market/listings?tab=jobs"),
        label: tNav("farmerNavOrders"),
        icon: <ClipboardCheck className={iconCls} aria-hidden />,
        active: onListings && listingsTab === "jobs",
      },
      {
        to: companyHref("/market/listings?tab=storefront"),
        label: tNav("farmerNavFarmPage"),
        icon: <Store className={iconCls} aria-hidden />,
        active: onListings && listingsTab === "storefront",
      },
    ];
    if (!isMarketOnlySeller(user)) {
      sellerItems.push({
        to: companyHref("/dashboard/management"),
        label: "Farm",
        icon: <Home className={iconCls} aria-hidden />,
      });
    }
    return (
      <MobileFieldBottomNav className="md:hidden" ariaLabel="Farmer market" items={sellerItems} />
    );
  }

  if (user.role === "vet" && canScoutPipeline(user) && appPath.startsWith("/market/commissions")) {
    return (
      <MobileFieldBottomNav
        ariaLabel="Scout commissions"
        items={[
          {
            to: companyHref("/dashboard/vet"),
            label: tHome,
            end: true,
            icon: <Home className={iconCls} aria-hidden />,
          },
          {
            to: companyHref("/market/commissions"),
            label: "Earnings",
            icon: <Wallet className={iconCls} aria-hidden />,
          },
          {
            to: companyHref("/farm/pipeline/scout"),
            label: "Scout",
            icon: <Search className={iconCls} aria-hidden />,
          },
        ]}
      />
    );
  }

  const isField =
    user.role === "laborer" || user.role === "dispatcher" || user.role === "vet";
  if (!isField) return null;

  const flockPath = (path: string) => companyHref(fieldRoute(path, activeFlockId || null));

  const canSee = (key: string) => canAccessPageByKey(user, key);
  const showCap = (cap: Parameters<typeof can>[0], pageKey: string) => {
    if (cap === "checkin" && !shouldShowRoundCheckin(user, fieldReportingMode)) return false;
    return hasBootstrap ? can(cap) : canSee(pageKey);
  };
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
  if (shouldShowRoundCheckin(user, fieldReportingMode) && showCap("checkin", "farm_checkin")) {
    items.push({
      to: flockPath("/farm/checkin"),
      label: tRounds,
      icon: <ClipboardCheck className={iconCls} aria-hidden />,
    });
  }
  if (showCap("mortality", "farm_mortality_log") || showCap("mortality", "farm_mortality")) {
    items.push({
      to: flockPath("/farm/mortality-log"),
      label: tMortality,
      icon: <Skull className={iconCls} aria-hidden />,
    });
  }
  if (showCap("feed_log", "farm_feed")) {
    items.push({
      to: flockPath("/farm/feed"),
      label: tFeed,
      icon: <Wheat className={iconCls} aria-hidden />,
    });
  }
  if (user.role === "vet") {
    if (showCap("vet_log_create", "farm_vet_logs")) {
      items.push({
        to: flockPath("/farm/vet-logs"),
        label: tVet,
        icon: <Stethoscope className={iconCls} aria-hidden />,
      });
    }
    if (showCap("treatment_rounds", "farm_treatments")) {
      items.push({
        to: flockPath("/farm/treatments"),
        label: tMeds,
        icon: <Pill className={iconCls} aria-hidden />,
      });
    }
    items.push({
      to: companyHref("/market/commissions"),
      label: "Pay",
      icon: <Wallet className={iconCls} aria-hidden />,
    });
  }

  if (items.length < 2) return null;
  return <MobileFieldBottomNav items={items} ariaLabel="Field operations" />;
}
