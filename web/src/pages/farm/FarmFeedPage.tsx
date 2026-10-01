import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Package, Wheat } from "lucide-react";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { PageHeader } from "../../components/PageHeader";
import { isOfficeFarmDesktopRole } from "../../auth/permissions";
import { useAuth } from "../../auth/AuthContext";
import {
  fetchFeedEntries,
  createFeedEntry,
  fetchPendingFeed,
  reviewFeedEntry,
  fetchFeedStockSummary,
  type FeedStockRow,
} from "../../api/farm.api";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { FieldFlockContextBar } from "../../components/field/FieldFlockContextBar";
import { buildFlockPassportMetrics } from "../../components/field/fieldFlockMetrics";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { canReviewFeedEntry } from "../../auth/permissions";
import { useLaborerT } from "../../i18n/laborerI18n";
import { Button, Card, SegmentedControl, StatusPill, Textarea } from "../../components/ui";
import { RecordMeta } from "../../components/farm/RecordMeta";
import { useFarmBootstrapContext } from "../../context/FarmBootstrapContext";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFieldPageState } from "../../hooks/useFieldPageState";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldTaskHub } from "../../components/field/FieldTaskHub";
import { FieldLogSheet } from "../../components/field/FieldLogSheet";
import { KgStepper } from "../../components/field/KgStepper";
import { fieldHubTeachingStatus } from "../../components/field/fieldHubTeaching";
import { TextLink } from "../../components/ui/TextLink";

type FeedEntry = {
  id: string;
  recordedAt: string;
  feedKg: number;
  feedType?: string | null;
  notes?: string;
  submissionStatus?: string;
};

type PendingFeedEntry = FeedEntry & {
  flockId?: string;
  enteredByName?: string;
};

const FEED_TYPE_LABELS: Record<string, string> = {
  starter: "Starter",
  grower: "Grower",
  finisher: "Finisher",
  supplement: "Supplement",
};

function feedTypeLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return FEED_TYPE_LABELS[value] ?? value;
}

function StatusBadge({ status, pendingLabel, rejectedLabel }: { status?: string; pendingLabel: string; rejectedLabel: string }) {
  if (!status || status === "approved") return null;
  const tone = status === "pending_review" ? "warning" : "danger";
  const label = status === "pending_review" ? pendingLabel : rejectedLabel;
  return (
    <StatusPill tone={tone}>
      {label}
    </StatusPill>
  );
}

function estimatedDailyKg(ageDays: number | undefined, birds: number | undefined): number | null {
  if (!ageDays || !birds || birds <= 0) return null;
  const perBird =
    ageDays <= 14 ? 0.045 : ageDays <= 28 ? 0.09 : ageDays <= 35 ? 0.12 : 0.14;
  return Number((perBird * birds).toFixed(2));
}

export function FarmFeedPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const { farm } = useFarmBootstrapContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logOpen = searchParams.get("log") === "1";

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error: ctxError,
    loadFlocks,
    loadDetails,
  } = useFlockFieldContext(token);

  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingFeedEntry[]>([]);
  const [stockRows, setStockRows] = useState<FeedStockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [feedKg, setFeedKg] = useState(0);
  const [feedType, setFeedType] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [feedFieldErrors, setFeedFieldErrors] = useState<Record<string, string>>({});

  const tTitle = useLaborerT("Feed request / log");
  const tHome = useLaborerT("Home");
  const tFlock = useLaborerT("Flock");
  const tDay = useLaborerT("Day");
  const tLiveBirds = useLaborerT("Live birds");
  const tFeedToDate = useLaborerT("Feed to date");
  const tFeedStock = useLaborerT("Available stock");
  const tCouldNotLoad = useLaborerT("Could not load recent entries.");
  const tRetry = useLaborerT("Retry");
  const tRecentEntries = useLaborerT("Recent feed entries");
  const tNoEntries = useLaborerT("No feed entries yet for this flock.");
  const tLogNew = useLaborerT("Log new feed");
  const tLogTitle = useLaborerT("Log feed");
  const tBack = useLaborerT("Back");
  const tFeedType = useLaborerT("Feed type (from stock)");
  const tNotesOpt = useLaborerT("Notes (optional)");
  const tAddNotes = useLaborerT("Add notes");
  const tSaving = useLaborerT("Saving\u2026");
  const tSaveEntry = useLaborerT("Save feed entry");
  const tFeedKg = useLaborerT("Feed delivered (kg)");
  const tSeeAll = useLaborerT("See all entries");
  const tRoundCheckin = useLaborerT("Round check-in");
  const tStillCaptures = useLaborerT("still captures photos, water, and mortality with each round.");
  const tNoFlocksTitle = useLaborerT("No flock available");
  const tNoFlocksBody = useLaborerT(
    "A manager must add a flock before you can log feed."
  );
  const tNoStockTitle = useLaborerT("No feed in stock");
  const tNoStockBody = useLaborerT(
    "Feed must be received in inventory before logging. Ask your manager if you expected stock here."
  );
  const tGoHome = useLaborerT("Back to home");
  const tGoInventory = useLaborerT("Open inventory");
  const tPendingTitle = useLaborerT("Pending feed logs");
  const tApprove = useLaborerT("Approve");
  const tReject = useLaborerT("Reject");
  const tExpectedToday = useLaborerT("Expected today");
  const tProjectedRemaining = useLaborerT("Projected remaining");
  const tOrderSoon = useLaborerT("Order soon");
  const tAtCurrentIntake = useLaborerT("At current intake");
  const tBirds = useLaborerT("birds");
  const tTodayNotLogged = useLaborerT("Not logged yet today");
  const tTodayHint = useLaborerT("Tap below to record feed for this flock.");
  const tToastRecorded = useLaborerT("Feed logged.");
  const tToastPending = useLaborerT("Feed submitted for review.");
  const tToastApproved = useLaborerT("Feed log approved.");
  const tToastRejected = useLaborerT("Feed log rejected.");
  const tErrSave = useLaborerT("Save failed");
  const tErrReview = useLaborerT("Review failed");
  const tErrFlock = useLaborerT("Flock is required.");
  const tErrFeedType = useLaborerT("Select feed type from available stock.");
  const tErrFeedKg = useLaborerT("Enter feed weight in kg (greater than zero).");
  const tErrFeedKgMax = useLaborerT("Only {max} kg available for {type}.");
  const tSubmitSuccess = useLaborerT("Feed log submitted successfully.");
  const tPendingReview = useLaborerT("Pending review");
  const tRejected = useLaborerT("Rejected");

  const availableStock = useMemo(
    () => stockRows.filter((r) => r.feedType && r.balanceKg > 0),
    [stockRows]
  );

  const selectedStock = useMemo(
    () => availableStock.find((r) => r.feedType === feedType) ?? null,
    [availableStock, feedType]
  );

  const canReview = canReviewFeedEntry(user);
  const isManager =
    user?.role === "vet_manager" || user?.role === "manager" || user?.role === "company_admin";

  const pageState = useFieldPageState({
    listLoading,
    stockLoading,
    error: ctxError,
    flockCount: flocks.length,
    availableStockCount: availableStock.length,
  });

  const loadStock = useCallback(async () => {
    if (!token) {
      setStockRows([]);
      setStockLoading(false);
      return;
    }
    if (flocks.length === 0 && farm?.feed_context?.block_reason === "no_flocks") {
      setStockRows([]);
      setStockLoading(false);
      return;
    }
    setStockLoading(true);
    try {
      const d = await fetchFeedStockSummary(token);
      setStockRows(d.summary ?? []);
    } catch {
      setStockRows([]);
    } finally {
      setStockLoading(false);
    }
  }, [token, flocks.length, farm?.feed_context?.block_reason]);

  const loadPending = useCallback(async () => {
    if (!token || !canReview) {
      setPendingEntries([]);
      return;
    }
    try {
      const d = await fetchPendingFeed(token);
      setPendingEntries((d as { entries?: PendingFeedEntry[] }).entries ?? []);
    } catch {
      setPendingEntries([]);
    }
  }, [token, canReview]);

  const loadFeedEntries = useCallback(async () => {
    if (!flockId || !token) {
      setEntries([]);
      setEntriesError(null);
      return;
    }
    try {
      const ed = await fetchFeedEntries(token, flockId);
      setEntries((ed.entries ?? []) as FeedEntry[]);
      setEntriesError(null);
    } catch (e) {
      setEntries([]);
      setEntriesError(e instanceof Error ? e.message : "Entries failed");
    }
  }, [flockId, token]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useEffect(() => {
    if (!feedType && availableStock.length > 0) {
      setFeedType(availableStock[0].feedType ?? "");
    } else if (feedType && !availableStock.some((r) => r.feedType === feedType)) {
      setFeedType(availableStock[0]?.feedType ?? "");
    }
  }, [availableStock, feedType]);

  useEffect(() => {
    void loadFeedEntries();
    void loadPending();
  }, [loadFeedEntries, loadPending]);

  const openLog = () => setSearchParams({ log: "1" });
  const closeLog = () => setSearchParams({});

  async function submitLog() {
    setFeedFieldErrors({});
    const errs: Record<string, string> = {};
    if (!flockId) errs.flockId = tErrFlock;
    if (!feedType) errs.feedType = tErrFeedType;
    const kg = feedKg;
    if (!Number.isFinite(kg) || kg <= 0) {
      errs.feedKg = tErrFeedKg;
    } else if (selectedStock && kg > selectedStock.balanceKg) {
      errs.feedKg = tErrFeedKgMax.replace("{max}", selectedStock.balanceKg.toFixed(1)).replace(
        "{type}",
        feedTypeLabel(feedType)
      );
    }
    if (Object.keys(errs).length) {
      setFeedFieldErrors(errs);
      return;
    }
    setBusy(true);
    setSubmitStage("submitting");
    try {
      await createFeedEntry(token, flockId, {
        feedKg: kg,
        feedType,
        notes: notes.trim() || undefined,
      });
      showToast(
        "success",
        canReview ? tToastRecorded : tToastPending
      );
      setFeedKg(0);
      setNotes("");
      setShowNotes(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:ops-updated"));
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted", { detail: { flockId } }));
      }
      void loadDetails();
      await loadFeedEntries();
      await loadStock();
      await loadPending();
      closeLog();
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : tErrSave);
      setSubmitStage("idle");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(entryId: string, action: "approve" | "reject") {
    if (!token || !canReview) return;
    setReviewBusyId(entryId);
    try {
      await reviewFeedEntry(token, entryId, action);
      showToast("success", action === "approve" ? tToastApproved : tToastRejected);
      await loadFeedEntries();
      await loadPending();
      await loadStock();
      void loadDetails();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : tErrReview);
    } finally {
      setReviewBusyId(null);
    }
  }

  const selected = flocks.find((f) => f.id === flockId);
  const birds =
    performance?.birdsLiveEstimate ?? performance?.verifiedLiveCount ?? selected?.initialCount;
  const expectedTodayKg = estimatedDailyKg(status?.ageDays, birds);
  const daysRemaining =
    selectedStock && expectedTodayKg && expectedTodayKg > 0
      ? Number((selectedStock.balanceKg / expectedTodayKg).toFixed(1))
      : null;

  const hubTeaching = fieldHubTeachingStatus(entries.length > 0, {
    title: tTodayNotLogged,
    subtitle: tTodayHint,
  });

  if (submitStage === "submitting" || submitStage === "success") {
    return (
      <SubmissionStageScreen
        stage={submitStage === "submitting" ? "submitting" : "success"}
        successText={tSubmitSuccess}
      />
    );
  }

  if (logOpen && pageState === "ready") {
    const feedTypeOptions = availableStock.map((r) => ({
      value: r.feedType ?? "",
      label: `${feedTypeLabel(r.feedType)} (${r.balanceKg.toFixed(1)} kg)`,
    }));

    return (
      <FieldLogSheet
        title={tLogTitle}
        backLabel={tBack}
        onBack={closeLog}
        submitLabel={tSaveEntry}
        submittingLabel={tSaving}
        busy={busy}
        onSubmit={() => void submitLog()}
        submitDisabled={!flockId || !feedType || feedKg <= 0}
      >
        {feedTypeOptions.length <= 4 ? (
          <SegmentedControl
            label={tFeedType}
            variant="grid"
            fullWidth
            value={feedType}
            options={feedTypeOptions}
            onChange={setFeedType}
          />
        ) : (
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {tFeedType}
            <select
              className="mt-1 w-full min-h-[52px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 text-base"
              value={feedType}
              onChange={(e) => setFeedType(e.target.value)}
            >
              {feedTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {feedFieldErrors.feedType ? (
          <p className="text-xs text-[var(--status-danger)]">{feedFieldErrors.feedType}</p>
        ) : null}

        <KgStepper
          label={tFeedKg}
          value={feedKg}
          onChange={setFeedKg}
          max={selectedStock?.balanceKg}
          error={feedFieldErrors.feedKg}
        />

        {showNotes ? (
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {tNotesOpt}
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowNotes(true)}>
            {tAddNotes}
          </Button>
        )}
      </FieldLogSheet>
    );
  }

  return (
    <div className={isOfficeFarmDesktopRole(user) ? "w-full space-y-5" : "mx-auto max-w-lg space-y-5 sm:max-w-xl"}>
      {isOfficeFarmDesktopRole(user) ? (
        <PageHeader title={tTitle} />
      ) : (
      <FieldPageHeader
        title={tTitle}
        backTo={companyHref("/dashboard/laborer")}
        backLabel={tHome}
        showAccount
      />
      )}

      {pageState === "loading" ? <SkeletonList rows={3} /> : null}

      {pageState === "error" ? (
        <ErrorState
          message={ctxError ?? ""}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadStock();
            void loadFeedEntries();
          }}
        />
      ) : null}

      {pageState === "no_flocks" ? (
        <FieldBlockedScreen
          title={tNoFlocksTitle}
          description={tNoFlocksBody}
          icon={<Wheat className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            <Button type="button" size="field" className="w-full" onClick={() => navigate(companyHref("/dashboard/laborer"))}>
              {tGoHome}
            </Button>
          }
        />
      ) : null}

      {pageState === "no_stock" ? (
        <FieldBlockedScreen
          title={tNoStockTitle}
          description={tNoStockBody}
          icon={<Package className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            isManager ? (
              <Button
                type="button"
                size="field"
                className="w-full"
                onClick={() => navigate(companyHref("/farm/inventory"))}
              >
                {tGoInventory}
              </Button>
            ) : (
              <Button type="button" size="field" variant="secondary" className="w-full" onClick={() => navigate(companyHref("/dashboard/laborer"))}>
                {tGoHome}
              </Button>
            )
          }
        />
      ) : null}

      {pageState === "ready" ? (
        <>
          <FieldFlockContextBar
            flocks={flocks}
            flockId={flockId}
            onFlockChange={setFlockId}
            flockLabel={tFlock}
            flockLabelText={status?.label}
            loading={Boolean(flockId && !status && detailLoading)}
            metrics={
              status
                ? buildFlockPassportMetrics(
                    status,
                    performance,
                    { day: tDay, liveBirds: tLiveBirds },
                    status.feedToDateKg != null
                      ? `${status.feedToDateKg} kg ${tFeedToDate.toLowerCase()}`
                      : undefined
                  )
                : []
            }
          />

          <FieldTaskHub
            {...hubTeaching}
            metrics={
              selectedStock
                ? [
                    {
                      label: tFeedStock,
                      value: `${selectedStock.balanceKg.toFixed(1)} kg`,
                      context: feedTypeLabel(feedType),
                    },
                    {
                      label: tExpectedToday,
                      value: expectedTodayKg != null ? `${expectedTodayKg} kg` : "—",
                      context: birds != null ? `${birds} ${tBirds}` : undefined,
                    },
                    {
                      label: tProjectedRemaining,
                      value: daysRemaining != null ? `${daysRemaining} d` : "—",
                      context:
                        daysRemaining != null && daysRemaining < 3 ? tOrderSoon : tAtCurrentIntake,
                    },
                  ]
                : undefined
            }
            primaryAction={
              <Button type="button" size="field" className="w-full" onClick={openLog}>
                {tLogNew}
              </Button>
            }
          >
            {canReview && pendingEntries.length > 0 ? (
              <section className="rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning-soft)] p-3 text-sm">
                <p className="mb-2 font-semibold text-[var(--status-warning)]">
                  {tPendingTitle} ({pendingEntries.length})
                </p>
                <ul className="space-y-2">
                  {pendingEntries.map((pe) => (
                    <li
                      key={pe.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
                    >
                      <div>
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {feedTypeLabel(pe.feedType)} · {pe.feedKg} kg
                        </span>
                        {pe.enteredByName ? (
                          <span className="ml-2 text-xs text-[var(--text-muted)]">{pe.enteredByName}</span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={reviewBusyId === pe.id}
                          onClick={() => void handleReview(pe.id, "approve")}
                        >
                          {tApprove}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={reviewBusyId === pe.id}
                          onClick={() => void handleReview(pe.id, "reject")}
                        >
                          {tReject}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {entriesError ? (
              <p className="text-sm text-[var(--status-warning)]" role="status">
                {tCouldNotLoad}{" "}
                <TextLink className="font-semibold" onClick={() => void loadFeedEntries()}>
                  {tRetry}
                </TextLink>
              </p>
            ) : null}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="type-h3 text-[var(--text-primary)]">{tRecentEntries}</p>
                {entries.length > 3 ? (
                  <Link
                    to={companyHref("/farm/feed")}
                    className="text-xs font-semibold text-[var(--text-secondary)] underline"
                  >
                    {tSeeAll}
                  </Link>
                ) : null}
              </div>
              {entries.length > 0 ? (
                <ul className="space-y-2">
                  {entries.slice(0, 3).map((en) => (
                    <li key={en.id}>
                      <Card level="default" className="!p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">
                              {en.feedKg} kg · {feedTypeLabel(en.feedType)}
                            </p>
                            <RecordMeta
                              className="mt-1"
                              createdAt={en.recordedAt}
                              approvalStatus={en.submissionStatus}
                            />
                          </div>
                          <StatusBadge status={en.submissionStatus} pendingLabel={tPendingReview} rejectedLabel={tRejected} />
                        </div>
                        {en.notes ? <p className="mt-2 type-caption">{en.notes}</p> : null}
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">{tNoEntries}</p>
              )}
            </section>
          </FieldTaskHub>

          <p className="text-xs text-[var(--text-secondary)]">
            <Link className="font-medium underline" to={companyHref("/farm/checkin")}>
              {tRoundCheckin}
            </Link>{" "}
            {tStillCaptures}
          </p>
        </>
      ) : null}
    </div>
  );
}
