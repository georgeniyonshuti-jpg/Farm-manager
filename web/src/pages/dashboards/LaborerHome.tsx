import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CheckinStatusBlock } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { HubCheckinBanner } from "../../components/farm/HubCheckinBanner";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useFieldOpsHubStatus } from "../../hooks/useFieldOpsHubStatus";
import { FieldOpsActionLink } from "../../components/field/FieldOpsActionLink";
import { TodayChecklistPanel } from "../../components/farm/TodayChecklistPanel";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";

export function LaborerHome() {
  const { token } = useAuth();
  const [showDetailedCard, setShowDetailedCard] = useState(false);

  const hTitle = useLaborerT("Field operations hub");
  const hSub = useLaborerT("Daily tasks optimized for your phone.");
  const linkCheckin = useLaborerT("Round check-in");
  const linkMort = useLaborerT("Log mortality");
  const linkFeed = useLaborerT("Feed log");
  const linkEarnings = useLaborerT("My earnings");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
  const tRetry = useLaborerT("Try again");

  const tLoadingBanner = useLaborerT("Preparing round check-in status…");
  const tErrBanner = useLaborerT("Could not load round check-in. Try again.");
  const tNoScheduleBanner = useLaborerT("No round schedule available right now.");
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

  const { status, loading, loadError, load, opsGlance, roundBanner, otherOverdueCount } =
    useFieldOpsHubStatus(token, hubLabels);
  const { can, hasBootstrap } = useFarmCapabilities();
  const showCap = (cap: Parameters<typeof can>[0], legacy = true) => (hasBootstrap ? can(cap) : legacy);
  return (
    <div className="mx-auto w-full max-w-[960px] space-y-6">
      {roundBanner ? (
        <button type="button" className="w-full text-left" onClick={() => setShowDetailedCard((v) => !v)}>
          <HubCheckinBanner variant={roundBanner.variant} message={roundBanner.text} />
        </button>
      ) : null}
      <PageHeader className="mb-3 gap-3" title={hTitle} subtitle={hSub} />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError && (
        <ErrorState
          message={<TranslatedText text={loadError} />}
          retryLabel={tRetry}
          onRetry={() => void load()}
        />
      )}

      {!loading && !loadError && status && showDetailedCard ? (
        <CheckinStatusBlock
          status={status}
          showWarning={false}
          otherOverdueCount={otherOverdueCount}
          opsGlance={opsGlance}
        />
      ) : null}
      {!loading && !loadError && !status ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      <TodayChecklistPanel />

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
        <div className="grid gap-3">
          {showCap("checkin") ? (
            <FieldOpsActionLink to="/farm/checkin" variant="primary">
              {linkCheckin}
            </FieldOpsActionLink>
          ) : null}
          {showCap("mortality") ? (
            <FieldOpsActionLink to="/farm/mortality-log" variant="danger">
              {linkMort}
            </FieldOpsActionLink>
          ) : null}
          {showCap("feed_log") ? (
            <FieldOpsActionLink to="/farm/feed" variant="neutral">
              {linkFeed}
            </FieldOpsActionLink>
          ) : null}
        </div>
        <div className="grid gap-3">
          {showCap("payroll_visible") ? (
            <FieldOpsActionLink to="/laborer/earnings" variant="soft">
              {linkEarnings}
            </FieldOpsActionLink>
          ) : null}
        </div>
      </div>

    </div>
  );
}
