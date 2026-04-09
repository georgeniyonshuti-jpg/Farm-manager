import { useCallback, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { HubCheckinBanner, type HubCheckinBannerVariant } from "../../components/farm/HubCheckinBanner";
import { ChartPanel } from "../../components/dashboard/ChartPanel";
import { SimpleCategoryBars } from "../../components/dashboard/charts/OpsCharts";
import { API_BASE_URL } from "../../api/config";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { canAccessPathByPageVisibility } from "../../auth/permissions";
import { useHubAggregatePoll } from "../../hooks/useHubAggregatePoll";
import type { ReactNode } from "react";

type TabItem = { to: string; label: string; end?: boolean; icon: ReactNode };

function tabIconClass(isActive: boolean): string {
  return isActive ? "text-[var(--primary-color)]" : "text-neutral-500";
}

export function LaborerHome() {
  const { token, user } = useAuth();
  const isJuniorVet = user?.role === "vet" || user?.departmentKeys.includes("junior_vet");

  const hTitleJunior = useLaborerT("Junior vet hub");
  const hTitleLaborer = useLaborerT("Field operations hub");
  const hSubJunior = useLaborerT("Track rounds, flock health, and urgent work.");
  const hSubLaborer = useLaborerT("Daily tasks optimized for your phone.");
  const linkCheckin = useLaborerT("Round check-in");
  const linkMort = useLaborerT("Log mortality");
  const linkDaily = useLaborerT("Daily log");
  const linkFeed = useLaborerT("Feed log");
  const linkTable = useLaborerT("Mortality table");
  const linkInv = useLaborerT("Feed inventory");
  const linkEarnings = useLaborerT("My earnings");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
  const tLoadingBanner = useLaborerT("Preparing round check-in status…");
  const tErrBanner = useLaborerT("Could not load round check-in. Try again.");
  const tNoScheduleBanner = useLaborerT("No round schedule available right now.");
  const tOverduePrefix = useLaborerT("Round check-in is overdue by");
  const tOverdueSuffix = useLaborerT("minutes. Inspect the flock now.");
  const tOnTrack = useLaborerT("You are on track.");
  const tAbout = useLaborerT("About");
  const tUntilNext = useLaborerT("minutes until the next round.");
  const tMultiFlockBanner = useLaborerT("flocks need check-in — details below for the most overdue.");
  const tRetry = useLaborerT("Try again");
  const tabHome = useLaborerT("Home");
  const tabRounds = useLaborerT("Rounds");
  const tabMort = useLaborerT("Mortality");
  const tabFeed = useLaborerT("Feed");
  const tabLog = useLaborerT("Log");
  const tabHistory = useLaborerT("History");
  const tabStock = useLaborerT("Stock");

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [bannerSummary, setBannerSummary] = useState<{
    anyOverdue: boolean;
    overdueCount: number;
    maxOverdueMinutes: number;
    overdueLabels: string[];
    minutesUntilSoonestNext: number | null;
    soonestFlockLabel: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const ar = await fetch(`${API_BASE_URL}/api/me/aggregate-checkin-status`, { headers: readAuthHeaders(token) });
      const ad = await ar.json();
      if (!ar.ok) throw new Error(ad.error ?? "Status failed");
      const primary = ad.primaryStatus as CheckinStatus | null | undefined;
      setStatus(primary ?? null);
      const s = ad.summary;
      if (s) {
        let overdueCount = Number(s.overdueCount);
        if (!Number.isFinite(overdueCount)) {
          overdueCount = s.anyOverdue ? Math.max(1, Array.isArray(s.overdueLabels) ? s.overdueLabels.length : 1) : 0;
        }
        setBannerSummary({
          anyOverdue: Boolean(s.anyOverdue),
          overdueCount,
          maxOverdueMinutes: Number(s.maxOverdueMinutes) || 0,
          overdueLabels: Array.isArray(s.overdueLabels) ? s.overdueLabels.map(String) : [],
          minutesUntilSoonestNext: s.minutesUntilSoonestNext != null ? Number(s.minutesUntilSoonestNext) : null,
          soonestFlockLabel: s.soonestFlockLabel != null ? String(s.soonestFlockLabel) : null,
        });
      } else {
        setBannerSummary(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useHubAggregatePoll(load);

  const roundBanner = useMemo((): { variant: HubCheckinBannerVariant; text: string } | null => {
    if (loading) return { variant: "loading", text: tLoadingBanner };
    if (loadError) return { variant: "error", text: tErrBanner };
    if (!status && !bannerSummary) return { variant: "warn", text: tNoScheduleBanner };
    if (bannerSummary?.anyOverdue && status) {
      if (bannerSummary.overdueCount > 1) {
        return {
          variant: "warn",
          text: `${bannerSummary.overdueCount} ${tMultiFlockBanner}`,
        };
      }
      return null;
    }
    if (bannerSummary?.anyOverdue && !status) {
      const mins = Math.max(1, bannerSummary.maxOverdueMinutes);
      const extra =
        bannerSummary.overdueLabels.length > 0
          ? ` (${bannerSummary.overdueLabels.slice(0, 3).join(", ")})`
          : "";
      return {
        variant: "error",
        text: `${tOverduePrefix} ${mins} ${tOverdueSuffix}${extra}`,
      };
    }
    if (
      bannerSummary &&
      !bannerSummary.anyOverdue &&
      bannerSummary.minutesUntilSoonestNext != null &&
      bannerSummary.soonestFlockLabel
    ) {
      const minsLeft = Math.max(1, bannerSummary.minutesUntilSoonestNext);
      return {
        variant: "ok",
        text: `${tOnTrack} ${tAbout} ${minsLeft} ${tUntilNext} (${bannerSummary.soonestFlockLabel})`,
      };
    }
    if (!status) return { variant: "warn", text: tNoScheduleBanner };
    const now = Date.now();
    const next = new Date(status.nextDueAt).getTime();
    if (now > next) {
      const mins = Math.floor((now - next) / 60000);
      return {
        variant: "error",
        text: `${tOverduePrefix} ${Math.max(1, mins)} ${tOverdueSuffix}`,
      };
    }
    const minsLeft = Math.floor((next - now) / 60000);
    return {
      variant: "ok",
      text: `${tOnTrack} ${tAbout} ${Math.max(1, minsLeft)} ${tUntilNext}`,
    };
  }, [
    loading,
    loadError,
    status,
    bannerSummary,
    tLoadingBanner,
    tErrBanner,
    tNoScheduleBanner,
    tOverduePrefix,
    tOverdueSuffix,
    tOnTrack,
    tAbout,
    tUntilNext,
    tMultiFlockBanner,
  ]);

  const otherOverdueCount =
    status && bannerSummary?.anyOverdue ? Math.max(0, bannerSummary.overdueCount - 1) : 0;
  const quickStatusData = [
    { label: tabRounds, value: status ? 1 : 0 },
    { label: tabMort, value: bannerSummary?.anyOverdue ? Math.max(1, bannerSummary.overdueCount) : 0 },
    { label: tabFeed, value: status ? 1 : 0 },
  ];
  const cycleData = [
    { stage: "Check-in", value: status ? 100 : 45 },
    {
      stage: "Feed",
      value: bannerSummary?.minutesUntilSoonestNext != null
        ? Math.max(35, Math.min(100, 100 - Math.round(bannerSummary.minutesUntilSoonestNext / 2)))
        : 40,
    },
    {
      stage: "Schedule",
      value:
        bannerSummary?.minutesUntilSoonestNext != null
          ? Math.max(0, Math.min(100, 100 - bannerSummary.minutesUntilSoonestNext))
          : 50,
    },
  ];

  const bottomNav = useMemo(() => {
    const items: TabItem[] = [
      {
        to: "/dashboard/laborer",
        label: tabHome,
        end: true,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
      {
        to: "/farm/checkin",
        label: tabRounds,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        to: "/farm/mortality-log",
        label: tabMort,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        to: "/farm/feed",
        label: tabFeed,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        to: "/farm/daily-log",
        label: tabLog,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        to: "/farm/mortality",
        label: tabHistory,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 3v18h18" strokeLinecap="round" />
            <path d="M7 16l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        to: "/farm/inventory",
        label: tabStock,
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ];
    return user ? items.filter((item) => canAccessPathByPageVisibility(user, item.to)) : items;
  }, [
    user,
    tabHome,
    tabRounds,
    tabMort,
    tabFeed,
    tabLog,
    tabHistory,
    tabStock,
  ]);

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6">
      {roundBanner ? <HubCheckinBanner variant={roundBanner.variant} message={roundBanner.text} /> : null}
      <PageHeader
        className="mb-3 gap-3"
        title={isJuniorVet ? hTitleJunior : hTitleLaborer}
        subtitle={isJuniorVet ? hSubJunior : hSubLaborer}
      />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError && (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      )}

      {!loading && !loadError && status ? (
        <CheckinStatusBlock status={status} showWarning={false} otherOverdueCount={otherOverdueCount} />
      ) : null}
      {!loading && !loadError && !status ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <ChartPanel
          title={useLaborerT("Today quick status")}
          subtitle={useLaborerT("Fast view of round, mortality, and feed activity")}
          loading={loading}
          error={loadError}
          empty={!loading && !loadError && quickStatusData.every((x) => x.value === 0)}
        >
          <SimpleCategoryBars data={quickStatusData} xKey="label" barKey="value" barName="Count" color="#1d9e75" />
        </ChartPanel>
        <ChartPanel
          title={useLaborerT("Cycle progress")}
          subtitle={useLaborerT("Check-in and feed workflow completeness")}
          loading={loading}
          error={loadError}
          empty={!loading && !loadError && cycleData.every((x) => x.value === 0)}
        >
          <SimpleCategoryBars data={cycleData} xKey="stage" barKey="value" barName="Progress %" color="#0ea5e9" />
        </ChartPanel>
      </div>

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
        <div className="grid gap-3">
          <Link
            to="/farm/checkin"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl bg-[var(--primary-color)] px-4 text-lg font-semibold text-white shadow hover:bg-[var(--primary-color-dark)]"
          >
            {linkCheckin}
          </Link>
          <Link
            to="/farm/mortality-log"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/80 px-4 text-lg font-semibold text-red-900 hover:bg-red-50"
          >
            {linkMort}
          </Link>
          <Link
            to="/farm/feed"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
          >
            {linkFeed}
          </Link>
        </div>
        <div className="grid gap-3">
          {user && canAccessPathByPageVisibility(user, "/farm/daily-log") ? (
            <Link
              to="/farm/daily-log"
              className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
            >
              {linkDaily}
            </Link>
          ) : null}
          <Link
            to="/farm/mortality"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
          >
            {linkTable}
          </Link>
          <Link
            to="/farm/inventory"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--border-color)] bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-[var(--primary-color-soft)]"
          >
            {linkInv}
          </Link>
          <Link
            to="/laborer/earnings"
            className="bounce-tap flex min-h-[60px] items-center justify-center rounded-2xl border border-[var(--primary-color)]/30 bg-[var(--primary-color-soft)] px-4 text-lg font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {linkEarnings}
          </Link>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 flex-col justify-center border-t border-[var(--border-color)] bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden"
        aria-label="Primary"
      >
        <div className="flex h-full items-stretch justify-around gap-0.5 px-0.5">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "bounce-tap flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center",
                  isActive ? "text-[var(--primary-color)]" : "text-neutral-600",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span className={tabIconClass(isActive)}>{item.icon}</span>
                  <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
