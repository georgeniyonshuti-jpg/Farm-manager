import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import { HubCheckinBanner, type HubCheckinBannerVariant } from "../../components/farm/HubCheckinBanner";
import { ChartPanel } from "../../components/dashboard/ChartPanel";
import { API_BASE_URL } from "../../api/config";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useHubAggregatePoll } from "../../hooks/useHubAggregatePoll";
import { useVetDashboardData } from "../../hooks/useVetDashboardData";
import {
  blockersSeries,
  fcrVsTargetSeries,
  mortalityTrendPseudoDaily,
  topRiskSeries,
} from "../../lib/dashboardAdapters";
import { BlockersStacked, FcrTargetBars, MortalityTrendLine, SimpleCategoryBars, TopRiskBars } from "../../components/dashboard/charts/OpsCharts";
import type { ReactNode } from "react";

type TabItem = { to: string; label: string; end?: boolean; icon: ReactNode };

function tabIconClass(isActive: boolean): string {
  return isActive ? "text-[var(--primary-color)]" : "text-neutral-500";
}

export function VetHome() {
  const { token } = useAuth();
  const vetDash = useVetDashboardData(token);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [primaryFlockId, setPrimaryFlockId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const didInitialLoadRef = useRef(false);

  const hTitle = useLaborerT("Vet hub");
  const hSub = useLaborerT("Track rounds, flock health, and urgent work.");
  const medTitle = useLaborerT("Medicine");
  const medBody = useLaborerT("Record treatments, doses, and withdrawal periods by flock.");
  const medLink = useLaborerT("Open medicine tracking");
  const slTitle = useLaborerT("Slaughter & FCR");
  const slBody = useLaborerT("Record slaughter timing and weights, and review FCR reports.");
  const slLink = useLaborerT("Open slaughter & FCR");
  const fcrTitle = useLaborerT("Cycle FCR");
  const fcrBody = useLaborerT("Feed ÷ flock weight gained vs day-age targets. Mobile-friendly action center.");
  const fcrLink = useLaborerT("Open cycle FCR");
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
  const tabSchedule = useLaborerT("Schedule");

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
    if (!didInitialLoadRef.current) setLoading(true);
    try {
      const ar = await fetch(`${API_BASE_URL}/api/me/aggregate-checkin-status`, { headers: readAuthHeaders(token) });
      const ad = await ar.json();
      if (!ar.ok) throw new Error(ad.error ?? "Status failed");
      const pid = ad.primaryFlockId != null ? String(ad.primaryFlockId) : null;
      setPrimaryFlockId(pid);
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
      didInitialLoadRef.current = true;
      setLoading(false);
    }
  }, [token]);

  useHubAggregatePoll(load);

  useEffect(() => {
    const onSubmitted = () => void load();
    window.addEventListener("farm:checkin-submitted", onSubmitted);
    return () => window.removeEventListener("farm:checkin-submitted", onSubmitted);
  }, [load]);

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

  const bottomNav: TabItem[] = [
    {
      to: "/dashboard/vet",
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
      to: "/farm/batch-schedule",
      label: tabSchedule,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      ),
    },
  ];
  const vetFlocks = vetDash.data.opsBoard?.flocks ?? [];
  const treatmentStatusData = Object.entries(
    vetDash.data.treatmentRounds.reduce<Record<string, number>>((acc, r) => {
      const k = r.status ?? "planned";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([statusKey, count]) => ({ status: statusKey, count }));
  const medicineForecastData = vetDash.data.medicineForecast
    .slice(0, 8)
    .map((r) => ({
      medicine: String(r.medicineName ?? "Medicine"),
      days: r.daysToStockout == null ? 60 : Number(r.daysToStockout),
    }));

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6">
      {roundBanner ? <HubCheckinBanner variant={roundBanner.variant} message={roundBanner.text} /> : null}
      <PageHeader className="mb-3 gap-3" title={hTitle} subtitle={hSub} />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError ? (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && !loadError && status ? (
        <CheckinStatusBlock status={status} showWarning={false} otherOverdueCount={otherOverdueCount} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="app-surface h-full p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{medTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{medBody}</p>
          <Link
            to="/farm/treatments"
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {medLink}
          </Link>
        </section>
        <section className="app-surface h-full p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{fcrTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{fcrBody}</p>
          <Link
            to={primaryFlockId ? `/farm/flocks/${encodeURIComponent(primaryFlockId)}/fcr` : "/farm/fcr"}
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {fcrLink}
          </Link>
        </section>
        <section className="app-surface h-full p-4">
          <h2 className="text-sm font-semibold text-neutral-800">{slTitle}</h2>
          <p className="mt-2 text-sm text-neutral-600">{slBody}</p>
          <Link
            to="/farm/slaughter"
            className="bounce-tap mt-3 inline-block rounded-xl border border-[var(--primary-color)]/40 px-3 py-2 text-sm font-semibold text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]"
          >
            {slLink}
          </Link>
        </section>
      </div>

      <div className="space-y-4">
        <PageHeader
          className="mb-2"
          title={useLaborerT("Clinical analytics")}
          subtitle={useLaborerT("Trends and blockers across treatment, mortality, and feed efficiency.")}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={useLaborerT("Treatment round status")}
            subtitle={useLaborerT("Current treatment workflow distribution")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && treatmentStatusData.length === 0}
          >
            <SimpleCategoryBars data={treatmentStatusData} xKey="status" barKey="count" barName="Rounds" color="#8b5cf6" />
          </ChartPanel>
          <ChartPanel
            title={useLaborerT("Medicine stock runway")}
            subtitle={useLaborerT("Days remaining before stockout")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && medicineForecastData.length === 0}
          >
            <SimpleCategoryBars data={medicineForecastData} xKey="medicine" barKey="days" barName="Days to stockout" color="#f59e0b" />
          </ChartPanel>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={useLaborerT("Mortality trend")}
            subtitle={useLaborerT("Farm-level mortality direction")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <MortalityTrendLine data={mortalityTrendPseudoDaily(vetFlocks)} />
          </ChartPanel>
          <ChartPanel
            title={useLaborerT("FCR vs target")}
            subtitle={useLaborerT("Top flocks by FCR variance")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && fcrVsTargetSeries(vetFlocks).length === 0}
          >
            <FcrTargetBars data={fcrVsTargetSeries(vetFlocks, 8)} />
          </ChartPanel>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={useLaborerT("Highest risk flocks")}
            subtitle={useLaborerT("Immediate vet-manager attention queue")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <TopRiskBars data={topRiskSeries(vetFlocks, 8)} />
          </ChartPanel>
          <ChartPanel
            title={useLaborerT("Operational blockers")}
            subtitle={useLaborerT("Overdue rounds and withdrawal blockers")}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <BlockersStacked data={blockersSeries(vetFlocks, 8)} />
          </ChartPanel>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 flex-col justify-center border-t border-[var(--border-color)] bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden"
        aria-label="Primary"
      >
        <div className="grid h-full grid-cols-7 gap-0 px-1">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "bounce-tap flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center",
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
