import { Link } from "react-router-dom";
import { ClipboardCheck, Skull, Wheat } from "lucide-react";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey } from "../../auth/permissions";
import { useLaborerT } from "../../i18n/laborerI18n";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";

const iconCls = "h-5 w-5";

type QuickItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
};

/** Secondary icon-row navigation — does not compete with the home hero CTA. */
export function FieldQuickActions() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { activeFlockId } = useActiveFlock();
  const { can, hasBootstrap } = useFarmCapabilities();
  const tRounds = useLaborerT("Rounds");
  const tMortality = useLaborerT("Mortality");
  const tFeed = useLaborerT("Feed");

  if (!user) return null;

  const flockPath = (path: string) => companyHref(fieldRoute(path, activeFlockId || null));

  const canSee = (key: string) => canAccessPageByKey(user, key);
  const showCap = (cap: Parameters<typeof can>[0], pageKey: string) =>
    hasBootstrap ? can(cap) : canSee(pageKey);

  const items: QuickItem[] = [];
  if (showCap("checkin", "farm_checkin")) {
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

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="navigation" aria-label="Quick actions">
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
