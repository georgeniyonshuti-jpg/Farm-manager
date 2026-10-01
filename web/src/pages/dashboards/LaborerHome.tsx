import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { shouldShowRoundCheckin } from "../../auth/permissions";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldMissionCard } from "../../components/field/FieldMissionCard";
import { FieldQuickActions } from "../../components/field/FieldQuickActions";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { FieldEarningsSnapshot } from "../../components/field/FieldEarningsSnapshot";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useFieldOpsHubStatus } from "../../hooks/useFieldOpsHubStatus";
import { TodayChecklistPanel } from "../../components/farm/TodayChecklistPanel";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { Button } from "../../components/ui";
import { FieldFlockTriageList } from "../../components/field/FieldFlockTriageList";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { prefetchFieldFlockContext } from "../../hooks/useFlockFieldContext";

export function LaborerHome() {
  const { token, user } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const queryClient = useQueryClient();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const { fieldReportingMode } = useFarmCapabilities();
  const { setPrimaryFlockId, setTriageFlockList, setActiveFlockId, activeFlockId } = useActiveFlock();
  const showRoundCheckin = shouldShowRoundCheckin(user, fieldReportingMode);

  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Waiting for flock assignment");
  const tRetry = useLaborerT("Try again");
  const tStartRound = useLaborerT("Start round check-in");
  const tOverdueLbl = useLaborerT("OVERDUE");
  const tOnTrackLbl = useLaborerT("On track");
  const tLoadingBanner = useLaborerT("Preparing round check-in status…");
  const tErrBanner = useLaborerT("Could not load round check-in. Try again.");
  const tNoScheduleBanner = useLaborerT("No round schedule available right now.");
  const tScheduleNotConfigured = useLaborerT("Round schedule not configured — ask your manager.");
  const tOverduePrefix = useLaborerT("Round check-in is overdue by");
  const tOverdueSuffix = useLaborerT("minutes. Inspect the flock now.");
  const tOnTrack = useLaborerT("You are on track.");
  const tAbout = useLaborerT("About");
  const tUntilNext = useLaborerT("minutes until the next round.");
  const tMultiFlockBanner = useLaborerT("flocks need check-in — details below for the most overdue.");

  const hubLabels = useMemo(
    () => ({
      loading: tLoadingBanner,
      error: tErrBanner,
      noSchedule: tNoScheduleBanner,
      overduePrefix: tOverduePrefix,
      overdueSuffix: tOverdueSuffix,
      onTrack: tOnTrack,
      about: tAbout,
      untilNext: tUntilNext,
      multiFlock: tMultiFlockBanner,
    }),
    [
      tLoadingBanner,
      tErrBanner,
      tNoScheduleBanner,
      tOverduePrefix,
      tOverdueSuffix,
      tOnTrack,
      tAbout,
      tUntilNext,
      tMultiFlockBanner,
    ]
  );

  const {
    status,
    loading,
    loadError,
    load,
    roundBanner,
    primaryFlockId,
    flockList,
  } = useFieldOpsHubStatus(token, hubLabels);

  useEffect(() => {
    setPrimaryFlockId(primaryFlockId);
    setTriageFlockList(flockList);
  }, [primaryFlockId, flockList, setPrimaryFlockId, setTriageFlockList]);

  useEffect(() => {
    if (!token) return;
    prefetchFieldFlockContext(
      queryClient,
      token,
      slug ?? "default-farm",
      activeFlockId || primaryFlockId
    );
  }, [token, slug, queryClient, activeFlockId, primaryFlockId]);

  const multiFlock = showRoundCheckin && flockList.length > 1;
  const hasOverdueFlock = flockList.some((r) => r.isOverdue);
  const heroFlockId = activeFlockId || primaryFlockId || status?.flockId || flockList[0]?.flockId;
  const checkinRoute = companyHref(
    fieldRoute(
      roundBanner?.variant === "warn" ? "/farm/checkin?log=1&step=1" : "/farm/checkin",
      heroFlockId
    )
  );

  const missionTone =
    roundBanner?.variant === "warn"
      ? "danger"
      : roundBanner?.variant === "ok"
        ? "success"
        : roundBanner?.variant === "error"
          ? "warning"
          : "neutral";

  const showCheckinHero =
    showRoundCheckin && Boolean(status || roundBanner) && (!multiFlock || hasOverdueFlock);
  const bannerText =
    roundBanner?.text ??
    (flockList.length > 0 && !status ? tScheduleNotConfigured : tNoScheduleBanner);

  return (
    <div className="w-full space-y-5">
      {loading ? <SkeletonList rows={2} /> : null}

      {!loading && loadError ? (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      ) : null}

      {!loading && !loadError && showRoundCheckin && !status && !roundBanner && flockList.length === 0 ? (
        <FieldBlockedScreen title={noFlockTitle} description={noFlockBody} />
      ) : null}

      {!loading && !loadError && multiFlock ? (
        <FieldFlockTriageList rows={flockList} mode="checkin" />
      ) : null}

      {!loading && !loadError && showCheckinHero ? (
        <FieldMissionCard
          statusTitle={bannerText}
          flockLabel={status?.label}
          urgencyTone={missionTone}
          urgencyLabel={
            roundBanner?.variant === "warn"
              ? tOverdueLbl
              : roundBanner?.variant === "ok"
                ? tOnTrackLbl
                : undefined
          }
          primaryAction={
            heroFlockId ? (
              <Button
                type="button"
                size="field"
                className="w-full"
                onClick={() => {
                  setActiveFlockId(heroFlockId);
                  navigate(checkinRoute);
                }}
              >
                {tStartRound}
              </Button>
            ) : (
              <Button type="button" size="field" variant="secondary" className="w-full" onClick={() => void load()}>
                {tRetry}
              </Button>
            )
          }
        />
      ) : null}

      <FieldQuickActions />

      <FieldEarningsSnapshot variant="compact" />

      <TodayChecklistPanel
        title="Today"
        excludeCategories={showCheckinHero || multiFlock ? ["checkin", "rounds"] : []}
      />
    </div>
  );
}
