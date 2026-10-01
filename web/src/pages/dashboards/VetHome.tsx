import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { CheckinStatusBlock, type CheckinStatus, type OpsGlanceSummary } from "../farm/FarmCheckinPage";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { OpsScorecardTable } from "../../components/farm/OpsScorecardTable";
import { PageHeader } from "../../components/PageHeader";
import { HubCheckinBanner, type HubCheckinBannerVariant } from "../../components/farm/HubCheckinBanner";
import { ChartPanel } from "../../components/dashboard/ChartPanel";
import { API_BASE_URL } from "../../api/config";
import { fetchJsonWithNetworkRetry } from "../../lib/apiFetch";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useHubAggregatePoll } from "../../hooks/useHubAggregatePoll";
import { useVetDashboardData } from "../../hooks/useVetDashboardData";
import {
  blockersSeries,
  flockWeightTrendChartData,
  fcrVsTargetSeries,
  growthScorecardRows,
  growthTrackerSummary,
  mortalityTrendPseudoDaily,
  topRiskSeries,
  weighInTrendFlockOptions,
  weightVsTargetSeries,
} from "../../lib/dashboardAdapters";
import { BlockersStacked, FcrTargetBars, FlockWeightTrendLines, MortalityTrendLine, SimpleCategoryBars, TopRiskBars, WeightVsTargetBars } from "../../components/dashboard/charts/OpsCharts";
import { useWeighInTrends } from "../../hooks/useWeighInTrends";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button } from "../../components/ui/Button";
import { VetFieldHub } from "./VetFieldHub";
import { readAuthHeaders } from "../../lib/authHeaders";

type VetHubFlockRow = {
  flockId: string;
  label: string;
  isOverdue: boolean;
  overdueMinutes: number;
  nextDueAt: string;
  checkinDoneToday: boolean;
  feedLoggedToday: boolean;
  vetLoggedRecent: boolean;
  lastCheckinAt?: string | null;
  lastFeedAt?: string | null;
  lastVetAt?: string | null;
};

function vetChip(label: string, ok: boolean) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: ok ? "color-mix(in srgb, var(--status-success) 30%, transparent)" : "color-mix(in srgb, var(--status-warning) 30%, transparent)",
        color: ok ? "var(--status-success)" : "var(--status-warning)",
      }}
    >
      {label} {ok ? "done" : "pending"}
    </span>
  );
}


export function VetHome() {
  const { user } = useAuth();
  if (user?.role === "vet") {
    return <VetFieldHub />;
  }
  return <VetManagerDashboard />;
}

function VetManagerDashboard() {
  const { token } = useAuth();
  const vetDash = useVetDashboardData(token);
  const weighTrends = useWeighInTrends(token, 90);
  const [weighTrendFlockFilter, setWeighTrendFlockFilter] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [primaryFlockId, setPrimaryFlockId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const didInitialLoadRef = useRef(false);

  const hTitle = useLaborerT("Vet hub");
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
  const tFlockAttentionList = useLaborerT("Flock attention list");
  const tFlocks = useLaborerT("flocks");
  const tOverdue = useLaborerT("Overdue");
  const tNextDue = useLaborerT("Next due");
  const tShowMore = useLaborerT("Show more");
  const tShowLess = useLaborerT("Show less");
  const tCheckin = useLaborerT("Check-in");
  const tFeed = useLaborerT("Feed");
  const tVet = useLaborerT("Vet");
  const tLastCheckin = useLaborerT("Last check-in");
  const tLastFeedLog = useLaborerT("Last feed log");
  const tLastVetRecord = useLaborerT("Last vet record");

  const [bannerSummary, setBannerSummary] = useState<{
    anyOverdue: boolean;
    overdueCount: number;
    maxOverdueMinutes: number;
    overdueLabels: string[];
    minutesUntilSoonestNext: number | null;
    soonestFlockLabel: string | null;
  } | null>(null);
  const [opsGlance, setOpsGlance] = useState<OpsGlanceSummary | null>(null);
  const [flockList, setFlockList] = useState<VetHubFlockRow[]>([]);
  const [expandedFlocks, setExpandedFlocks] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    if (!didInitialLoadRef.current) setLoading(true);
    try {
      const ad = await fetchJsonWithNetworkRetry<{
        primaryFlockId?: string | null;
        primaryStatus?: CheckinStatus | null;
        summary?: {
          anyOverdue?: boolean;
          overdueCount?: number;
          maxOverdueMinutes?: number;
          overdueLabels?: string[];
          minutesUntilSoonestNext?: number | null;
          soonestFlockLabel?: string | null;
          opsGlance?: OpsGlanceSummary | null;
          flockList?: VetHubFlockRow[] | null;
        } | null;
      }>(`${API_BASE_URL}/api/me/aggregate-checkin-status`, { headers: readAuthHeaders(token) });
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
        setOpsGlance(s.opsGlance ?? null);
        setFlockList(Array.isArray(s.flockList) ? s.flockList : []);
      } else {
        setBannerSummary(null);
        setOpsGlance(null);
        setFlockList([]);
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
  const hasList = flockList.length > 0;

  const vetFlocks = vetDash.data.opsBoard?.flocks ?? [];
  const farmTotals = vetDash.data.opsBoard?.farmTotals;
  const growth = growthTrackerSummary(vetFlocks, farmTotals);
  const scorecardFlocks = growthScorecardRows(vetFlocks, 8);
  const weightData = weightVsTargetSeries(vetFlocks, 8);
  const weighTrendFlockOptionsList = useMemo(
    () => weighInTrendFlockOptions(weighTrends.points),
    [weighTrends.points],
  );
  const flockWeightTrend = useMemo(
    () =>
      flockWeightTrendChartData(weighTrends.points, {
        flockId: weighTrendFlockFilter,
        limit: 8,
      }),
    [weighTrends.points, weighTrendFlockFilter],
  );
  const tWeighTrendSub = useLaborerT("Per-flock actual (solid) vs breed target (dotted) — 90 days");
  const tAllFlocksTop8 = useLaborerT("All flocks (top 8)");
  const tClinicalAnalytics = useLaborerT("Clinical analytics");
  const tTreatmentRoundStatus = useLaborerT("Treatment round status");
  const tTreatmentRoundSub = useLaborerT("Current treatment workflow distribution");
  const tMedicineStockRunway = useLaborerT("Medicine stock runway");
  const tMedicineStockSub = useLaborerT("Days remaining before stockout");
  const tGrowthConversion = useLaborerT("Growth & conversion");
  const tAvgWtVsTarget = useLaborerT("Avg wt vs target");
  const tBelowTarget = useLaborerT("Below target");
  const tStaleWeighIns = useLaborerT("Stale weigh-ins");
  const tAvgFcr = useLaborerT("Avg FCR");
  const tFarmFeedKg = useLaborerT("Farm feed (kg)");
  const tFeedPerBirdKg = useLaborerT("Feed / bird (kg)");
  const tFcrAboveTarget = useLaborerT("FCR above target");
  const tAvgAdg = useLaborerT("Avg ADG (g/d)");
  const tGrowthScorecard = useLaborerT("Growth scorecard");
  const tWeightVsTarget = useLaborerT("Weight vs target");
  const tWeightVsTargetSub = useLaborerT("Actual vs expected by flock");
  const tFcrVsTarget = useLaborerT("FCR vs target");
  const tFcrVsTargetSub = useLaborerT("Top flocks by FCR variance");
  const tWeighInTrend = useLaborerT("Weigh-in trend");
  const tMortalityTrend = useLaborerT("Mortality trend");
  const tMortalityTrendSub = useLaborerT("Farm-level mortality direction");
  const tHighestRiskFlocks = useLaborerT("Highest risk flocks");
  const tHighestRiskSub = useLaborerT("Immediate vet-manager attention queue");
  const tOperationalBlockers = useLaborerT("Operational blockers");
  const tOperationalBlockersSub = useLaborerT("Overdue rounds and withdrawal blockers");
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
    <ManagerPage>
      {roundBanner ? <HubCheckinBanner variant={roundBanner.variant} message={roundBanner.text} /> : null}
      <PageHeader className="mb-3 gap-3" title={hTitle} />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError ? (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && !loadError && hasList ? (
        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{tFlockAttentionList}</h3>
            <span className="text-xs text-[var(--text-muted)]">{flockList.length} {tFlocks}</span>
          </div>
          <div className="space-y-2">
            {flockList.map((row) => {
              const expanded = Boolean(expandedFlocks[row.flockId]);
              return (
                <article key={row.flockId} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{row.label}</p>
                      <p className={`text-xs ${row.isOverdue ? "text-[var(--status-danger)]" : "text-[var(--text-muted)]"}`}>
                        {row.isOverdue
                          ? `${tOverdue} ${Math.max(1, row.overdueMinutes)}m`
                          : `${tNextDue} ${new Date(row.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}`}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setExpandedFlocks((prev) => ({ ...prev, [row.flockId]: !expanded }))}
                    >
                      {expanded ? tShowLess : tShowMore}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vetChip(tCheckin, row.checkinDoneToday)}
                    {vetChip(tFeed, row.feedLoggedToday)}
                    {vetChip(tVet, row.vetLoggedRecent)}
                  </div>
                  {expanded ? (
                    <div className="mt-2 grid gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
                      <p>{tLastCheckin}: {row.lastCheckinAt ? new Date(row.lastCheckinAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" }) : "—"}</p>
                      <p>{tLastFeedLog}: {row.lastFeedAt ? new Date(row.lastFeedAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" }) : "—"}</p>
                      <p>{tLastVetRecord}: {row.lastVetAt ? new Date(row.lastVetAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" }) : "—"}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {!loading && !loadError && !hasList && status ? (
        <CheckinStatusBlock
          status={status}
          showWarning={false}
          otherOverdueCount={otherOverdueCount}
          opsGlance={opsGlance}
        />
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
            to={primaryFlockId ? `/farm/vet-logs?flockId=${encodeURIComponent(primaryFlockId)}` : "/farm/vet-logs"}
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
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tClinicalAnalytics}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={tTreatmentRoundStatus}
            metricNote={tTreatmentRoundSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && treatmentStatusData.length === 0}
          >
            <SimpleCategoryBars data={treatmentStatusData} xKey="status" barKey="count" barName="Rounds" color="#8b5cf6" />
          </ChartPanel>
          <ChartPanel
            title={tMedicineStockRunway}
            metricNote={tMedicineStockSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && medicineForecastData.length === 0}
          >
            <SimpleCategoryBars data={medicineForecastData} xKey="medicine" barKey="days" barName="Days to stockout" color="#f59e0b" />
          </ChartPanel>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tGrowthConversion}</h2>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-center text-xs">
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tAvgWtVsTarget}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">
                {growth.avgWeightDeviationPct != null ? `${growth.avgWeightDeviationPct >= 0 ? "+" : ""}${growth.avgWeightDeviationPct}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tBelowTarget}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.belowTargetCount}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tStaleWeighIns}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.staleWeighInCount}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tAvgFcr}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.avgFcr ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tFarmFeedKg}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">
                {growth.totalFeedToDateKg > 0 ? growth.totalFeedToDateKg.toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tFeedPerBirdKg}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.avgFeedPerBirdKg ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tFcrAboveTarget}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.flocksAboveTargetFcr}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-2">
              <p className="text-[var(--text-muted)]">{tAvgAdg}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{growth.avgAdgGramsPerDay ?? "—"}</p>
            </div>
          </div>
          <OpsScorecardTable
            flocks={scorecardFlocks}
            loading={vetDash.loading}
            variant="vet"
            title={tGrowthScorecard}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={tWeightVsTarget}
            metricNote={tWeightVsTargetSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && weightData.length === 0}
          >
            <WeightVsTargetBars data={weightData} />
          </ChartPanel>
          <ChartPanel
            title={tFcrVsTarget}
            metricNote={tFcrVsTargetSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && fcrVsTargetSeries(vetFlocks).length === 0}
          >
            <FcrTargetBars data={fcrVsTargetSeries(vetFlocks, 8)} />
          </ChartPanel>
        </div>
        <ChartPanel
          title={tWeighInTrend}
          metricNote={tWeighTrendSub}
          loading={weighTrends.loading}
          error={weighTrends.error}
          empty={!weighTrends.loading && !weighTrends.error && flockWeightTrend.rows.length === 0}
          action={
            weighTrendFlockOptionsList.length > 0 ? (
              <select
                className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                value={weighTrendFlockFilter ?? ""}
                onChange={(e) => setWeighTrendFlockFilter(e.target.value || null)}
                aria-label="Filter weigh-in trend by flock"
              >
                <option value="">{tAllFlocksTop8}</option>
                {weighTrendFlockOptionsList.map((f) => (
                  <option key={f.flockId} value={f.flockId}>
                    {f.label}
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          <FlockWeightTrendLines rows={flockWeightTrend.rows} series={flockWeightTrend.series} />
        </ChartPanel>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartPanel
            title={tMortalityTrend}
            metricNote={tMortalityTrendSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <MortalityTrendLine data={mortalityTrendPseudoDaily(vetFlocks)} />
          </ChartPanel>
          <ChartPanel
            title={tHighestRiskFlocks}
            metricNote={tHighestRiskSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <TopRiskBars data={topRiskSeries(vetFlocks, 8)} />
          </ChartPanel>
          <ChartPanel
            title={tOperationalBlockers}
            metricNote={tOperationalBlockersSub}
            loading={vetDash.loading}
            error={vetDash.error}
            empty={!vetDash.loading && !vetDash.error && vetFlocks.length === 0}
          >
            <BlockersStacked data={blockersSeries(vetFlocks, 8)} />
          </ChartPanel>
        </div>
      </div>

    </ManagerPage>
  );
}
