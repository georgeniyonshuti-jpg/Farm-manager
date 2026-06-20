import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { CheckinStatusBlock } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { HubCheckinBanner } from "../../components/farm/HubCheckinBanner";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useFieldOpsHubStatus } from "../../hooks/useFieldOpsHubStatus";
import { MobileFieldBottomNav, type MobileFieldNavItem } from "../../components/layout/MobileFieldBottomNav";
import { FieldOpsActionLink } from "../../components/field/FieldOpsActionLink";

export function VetFieldHub() {
  const { token } = useAuth();
  const [showDetailedCard, setShowDetailedCard] = useState(false);

  const hTitle = useLaborerT("Vet hub");
  const hSub = useLaborerT("Track rounds, flock health, and urgent work.");
  const linkCheckin = useLaborerT("Round check-in");
  const linkMort = useLaborerT("Log mortality");
  const linkFeed = useLaborerT("Feed log");
  const linkVetLogs = useLaborerT("Vet logs");
  const linkMedicine = useLaborerT("Medicine tracking");
  const linkSlaughter = useLaborerT("Slaughter & FCR");
  const linkEarnings = useLaborerT("My earnings");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Round status appears when a flock is assigned to your site.");
  const tRetry = useLaborerT("Try again");
  const tabHome = useLaborerT("Home");
  const tabRounds = useLaborerT("Rounds");
  const tabMort = useLaborerT("Mortality");
  const tabFeed = useLaborerT("Feed");
  const tabVetLogs = useLaborerT("Vet logs");

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

  const bottomNav: MobileFieldNavItem[] = [
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
      to: "/farm/vet-logs",
      label: tabVetLogs,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinejoin="round" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h6" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

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

      <div className="grid gap-3 md:grid-cols-2 md:gap-4 md:items-start">
        <div className="grid gap-3">
          <FieldOpsActionLink to="/farm/checkin" variant="primary">
            {linkCheckin}
          </FieldOpsActionLink>
          <FieldOpsActionLink to="/farm/mortality-log" variant="danger">
            {linkMort}
          </FieldOpsActionLink>
          <FieldOpsActionLink to="/farm/feed" variant="neutral">
            {linkFeed}
          </FieldOpsActionLink>
          <FieldOpsActionLink to="/farm/vet-logs" variant="emerald">
            {linkVetLogs}
          </FieldOpsActionLink>
          <FieldOpsActionLink to="/farm/treatments" variant="purple">
            {linkMedicine}
          </FieldOpsActionLink>
          <FieldOpsActionLink to="/farm/slaughter" variant="neutral">
            {linkSlaughter}
          </FieldOpsActionLink>
        </div>
        <div className="grid gap-3">
          <FieldOpsActionLink to="/laborer/earnings" variant="soft">
            {linkEarnings}
          </FieldOpsActionLink>
        </div>
      </div>

      <MobileFieldBottomNav items={bottomNav} />
    </div>
  );
}
