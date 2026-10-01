import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldMissionCard } from "../../components/field/FieldMissionCard";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { FieldEarningsSnapshot } from "../../components/field/FieldEarningsSnapshot";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useFieldOpsVetVisitStatus } from "../../hooks/useFieldOpsVetVisitStatus";
import { TodayChecklistPanel } from "../../components/farm/TodayChecklistPanel";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { Button } from "../../components/ui";
import { FieldFlockTriageList } from "../../components/field/FieldFlockTriageList";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";
import { prefetchFieldFlockContext } from "../../hooks/useFlockFieldContext";
import { fetchWeighQueue } from "../../api/pipeline.api";
import { canScoutPipeline } from "../../auth/permissions";

export function VetFieldHub() {
  const { token, user } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const queryClient = useQueryClient();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const { setPrimaryFlockId, setTriageFlockList, setActiveFlockId, activeFlockId } = useActiveFlock();

  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Waiting for flock assignment");
  const tRetry = useLaborerT("Try again");
  const tStartVisit = useLaborerT("Start vet visit");
  const tOverdueLbl = useLaborerT("OVERDUE");
  const tOnTrackLbl = useLaborerT("On track");
  const tLoadingBanner = useLaborerT("Preparing vet visit status…");
  const tErrBanner = useLaborerT("Could not load vet visit schedule. Try again.");
  const tNoScheduleBanner = useLaborerT("No vet visit schedule available right now.");
  const tScheduleNotConfigured = useLaborerT("Visit schedule not configured — ask your manager.");
  const tOverduePrefix = useLaborerT("Vet visit is overdue by");
  const tOverdueSuffix = useLaborerT("minutes. Inspect the flock now.");
  const tOnTrack = useLaborerT("You are on track.");
  const tAbout = useLaborerT("About");
  const tUntilNext = useLaborerT("minutes until the next visit.");
  const tMultiFlockBanner = useLaborerT("flocks need a vet visit — details below for the most overdue.");

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
    visitBanner,
    isOverdue,
    primaryFlockId,
    flockList,
  } = useFieldOpsVetVisitStatus(token, hubLabels);

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

  const multiFlock = flockList.length > 1;
  const heroFlockId = activeFlockId || primaryFlockId || status?.flockId || flockList[0]?.flockId;
  const [weighDue, setWeighDue] = useState(0);
  useEffect(() => {
    if (!token || !canScoutPipeline(user)) return;
    let cancelled = false;
    void fetchWeighQueue(token)
      .then((r) => {
        if (!cancelled) setWeighDue(r.dueThisWeek || r.lots.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const vetVisitRoute = companyHref(
    fieldRoute("/farm/vet-logs?log=1&step=1", heroFlockId)
  );

  const missionTone =
    visitBanner?.variant === "warn" || isOverdue
      ? "danger"
      : visitBanner?.variant === "ok"
        ? "success"
        : visitBanner?.variant === "error"
          ? "warning"
          : "neutral";

  // Multi-flock: triage list is the work queue — do not duplicate the same CTA in a hero.
  const showVisitHero = Boolean(status || visitBanner) && !multiFlock;
  const bannerText =
    visitBanner?.text ??
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

      {!loading && !loadError && !status && !visitBanner && flockList.length === 0 ? (
        <FieldBlockedScreen title={noFlockTitle} description={noFlockBody} />
      ) : null}

      {!loading && !loadError && multiFlock ? (
        <FieldFlockTriageList rows={flockList} mode="vet_visit" />
      ) : null}

      {!loading && !loadError && showVisitHero ? (
        <FieldMissionCard
          statusTitle={bannerText}
          flockLabel={status?.label}
          urgencyTone={missionTone}
          urgencyLabel={
            visitBanner?.variant === "warn" || isOverdue
              ? tOverdueLbl
              : visitBanner?.variant === "ok"
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
                  navigate(vetVisitRoute);
                }}
              >
                {tStartVisit}
              </Button>
            ) : (
              <Button type="button" size="field" variant="secondary" className="w-full" onClick={() => void load()}>
                {tRetry}
              </Button>
            )
          }
        />
      ) : null}

      {weighDue > 0 ? (
        <FieldMissionCard
          statusTitle={`${weighDue} weigh visits this week`}
          urgencyTone="warning"
          urgencyLabel="Visit"
          primaryAction={
            <Button
              type="button"
              size="field"
              className="w-full"
              onClick={() => navigate(companyHref("/farm/pipeline/weigh"))}
            >
              Open weigh queue
            </Button>
          }
        />
      ) : null}

      <FieldEarningsSnapshot />

      <TodayChecklistPanel
        title="Today"
        excludeCategories={showVisitHero || multiFlock ? ["checkin", "rounds", "vet_visit"] : []}
      />
    </div>
  );
}
