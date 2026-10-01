import { Link } from "react-router-dom";
import { ClipboardCheck, Pill, Stethoscope, Truck } from "lucide-react";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { shouldShowRoundCheckin } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey, canScoutPipeline } from "../../auth/permissions";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";

const iconCls = "h-5 w-5";

type QuickItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
};

/** Vet home secondary navigation — Rounds, Vet logs, Meds, Scout. */
export function VetFieldQuickActions() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { activeFlockId } = useActiveFlock();
  const { can, hasBootstrap, fieldReportingMode } = useFarmCapabilities();
  const tRounds = useLaborerT("Rounds");
  const tVet = useLaborerT("Vet");
  const tMeds = useLaborerT("Meds");

  if (!user) return null;

  const flockPath = (path: string) => companyHref(fieldRoute(path, activeFlockId || null));

  const canSee = (key: string) => canAccessPageByKey(user, key);
  const showCap = (cap: Parameters<typeof can>[0], pageKey: string) => {
    if (cap === "checkin" && !shouldShowRoundCheckin(user, fieldReportingMode)) return false;
    return hasBootstrap ? can(cap) : canSee(pageKey);
  };

  const items: QuickItem[] = [];
  if (shouldShowRoundCheckin(user, fieldReportingMode) && showCap("checkin", "farm_checkin")) {
    items.push({
      to: flockPath("/farm/checkin"),
      label: tRounds,
      icon: <ClipboardCheck className={iconCls} aria-hidden />,
    });
  }
  if (showCap("vet_log_create", "farm_vet_logs") || canSee("farm_vet_logs")) {
    items.push({
      to: flockPath("/farm/vet-logs"),
      label: tVet,
      icon: <Stethoscope className={iconCls} aria-hidden />,
    });
  }
  if (showCap("treatment_rounds", "farm_treatments") || canSee("farm_treatments")) {
    items.push({
      to: flockPath("/farm/treatments"),
      label: tMeds,
      icon: <Pill className={iconCls} aria-hidden />,
    });
  }
  if (canScoutPipeline(user)) {
    items.push({
      to: companyHref(
        activeFlockId
          ? `/farm/pipeline/scout?flockId=${encodeURIComponent(activeFlockId)}`
          : "/farm/pipeline/scout?mode=offplatform"
      ),
      label: "Scout",
      icon: <Truck className={iconCls} aria-hidden />,
    });
    items.push({
      to: companyHref("/farm/pipeline/weigh"),
      label: "Weigh",
      icon: <ClipboardCheck className={iconCls} aria-hidden />,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="navigation" aria-label="Vet quick actions">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          className="inline-flex min-h-[48px] flex-1 min-w-[5.5rem] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--primary-color)]/40 hover:text-[var(--text-primary)]"
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
