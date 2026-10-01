import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Skull } from "lucide-react";
import { PhotoTile } from "../../components/farm/PhotoTile";
import { useAuth } from "../../auth/AuthContext";
import { useLaborerT } from "../../i18n/laborerI18n";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldFilterBar } from "../../components/field/FieldFilterBar";
import { FieldHistoryList } from "../../components/field/FieldHistoryList";
import { FieldSectionTitle } from "../../components/field/FieldSectionTitle";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { PageHeader } from "../../components/PageHeader";
import { isOfficeFarmDesktopRole } from "../../auth/permissions";
import { FieldHeaderAction } from "../../components/layout/FieldHeaderAction";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import {
  createMortalityEvent,
  fetchMortalityEvents,
  IS_FRAPPE_MODE,
  type MortalityEventRow,
} from "../../api/farm.api";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { syncMortalityToERPNext } from "../../api/erpnext.api";
import { getStoredErpnextCompany, getStoredErpnextCostCenter, CLIENT_ERPNEXT_ENTITY_SYNC } from "../../lib/erpnextPrefs";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import { Button, Card, SegmentedControl, Textarea } from "../../components/ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFieldTaskState } from "../../hooks/useFieldTaskState";
import { FieldFlockContextBar } from "../../components/field/FieldFlockContextBar";
import { FieldTaskHub } from "../../components/field/FieldTaskHub";
import { FieldLogSheet } from "../../components/field/FieldLogSheet";
import { CountStepper } from "../../components/field/CountStepper";
import { fieldHubTeachingStatus } from "../../components/field/fieldHubTeaching";
import { buildFlockPassportMetrics } from "../../components/field/fieldFlockMetrics";
import { RecordMeta } from "../../components/farm/RecordMeta";
import { FlockScopeSelector } from "../../components/field/FlockScopeSelector";

const DEFAULT_VALUE_PER_BIRD = 2500;

function formatDateTime(iso: string | undefined) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return "";
  }
}

export function FarmMortalityLogPage() {
  const { token, user } = useAuth();
  const office = isOfficeFarmDesktopRole(user);
  const { erpnextAccess } = useFarmCapabilities();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logOpen = searchParams.get("log") === "1";
  const historyOpen = searchParams.get("view") === "history";
  const { status: erpnextStatus } = useERPNextConnection();

  const lblFlock = useLaborerT("Flock");
  const title = useLaborerT("Log mortality");
  const linkHist = useLaborerT("History");
  const lblNotes = useLaborerT("Notes (optional)");
  const btnSaving = useLaborerT("Saving…");
  const btnSubmit = useLaborerT("Submit mortality");
  const alertEmerg = useLaborerT("Emergency mortality logged.");
  const alertNorm = useLaborerT("Mortality logged.");
  const errSave = useLaborerT("Save failed");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT(
    "Add a flock before logging mortality. Log only birds that died naturally or were culled."
  );
  const tGoHome = useLaborerT("Back to home");
  const tLogNew = useLaborerT("Log mortality");
  const tLogTitle = useLaborerT("Log mortality");
  const tBack = useLaborerT("Back");
  const tCount = useLaborerT("Number of birds");
  const tEmerg = useLaborerT("Emergency / unusual loss");
  const tEmergYes = useLaborerT("Yes");
  const tEmergNo = useLaborerT("No");
  const tAddNotes = useLaborerT("Add notes");
  const tRecent = useLaborerT("Recent mortality");
  const tNoRecent = useLaborerT("No mortality logged yet for this flock.");
  const tNoToday = useLaborerT("No mortality logged today");
  const tTodayHint = useLaborerT("Tap below to record losses for this flock.");
  const tDay = useLaborerT("Day");
  const tMortToDate = useLaborerT("Mortality to date");
  const tLiveBirds = useLaborerT("Live birds");
  const tPicker = useLaborerT("Tap to add photos (1+ required, up to 6)");
  const tSubmitSuccess = useLaborerT("Mortality submitted successfully.");

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

  const [events, setEvents] = useState<MortalityEventRow[]>([]);
  const [historyEvents, setHistoryEvents] = useState<MortalityEventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [isEmergency, setIsEmergency] = useState<"yes" | "no">("no");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitCooldown, setSubmitCooldown] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");

  const pageState = useFieldTaskState({
    listLoading,
    error: ctxError,
    flockCount: flocks.length,
    needsStock: false,
  });

  const loadEvents = useCallback(async () => {
    if (!flockId || !token) {
      setEvents([]);
      setEventsError(null);
      return;
    }
    try {
      const data = await fetchMortalityEvents(token, flockId, 10);
      setEvents(data.events ?? []);
      setEventsError(null);
    } catch (e) {
      setEvents([]);
      setEventsError(e instanceof Error ? e.message : "Load failed");
    }
  }, [flockId, token]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const loadHistoryEvents = useCallback(async () => {
    if (!flockId || !token) {
      setHistoryEvents([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const data = await fetchMortalityEvents(token, flockId, 50);
      setHistoryEvents(data.events ?? []);
    } catch {
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [flockId, token]);

  useEffect(() => {
    if (historyOpen) void loadHistoryEvents();
  }, [historyOpen, loadHistoryEvents]);

  const openLog = () => setSearchParams({ log: "1" });
  const closeLog = () => setSearchParams({});
  const openHistory = () => setSearchParams({ view: "history" });

  async function handleSubmit() {
    if (!flockId) return;
    if (submitCooldown) {
      setError("Please wait a few seconds before submitting again.");
      return;
    }
    if (photos.length < 1) {
      setError("Add at least one photo of the mortality.");
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      setError("Enter number of birds (1 or more).");
      return;
    }
    setError(null);
    setBusy(true);
    setSubmitStage("submitting");
    const emergency = isEmergency === "yes";
    try {
      await createMortalityEvent(token, flockId, {
        photos,
        deadCount: count,
        count,
        isEmergency: emergency,
        notes: notes.trim() || undefined,
        valuePerBirdRwf: DEFAULT_VALUE_PER_BIRD,
      });
      const erpCompany = getStoredErpnextCompany() || erpnextStatus?.company;
      if (
        erpnextAccess &&
        CLIENT_ERPNEXT_ENTITY_SYNC &&
        !IS_FRAPPE_MODE &&
        erpnextStatus?.connected &&
        erpCompany &&
        token
      ) {
        try {
          await syncMortalityToERPNext(token, {
            company: erpCompany,
            date: new Date().toISOString().slice(0, 10),
            flockId,
            count,
            estimatedValuePerBird: DEFAULT_VALUE_PER_BIRD,
            costCenter: getStoredErpnextCostCenter() || undefined,
          });
        } catch (syncErr) {
          console.error("ERPNext mortality sync failed:", syncErr);
        }
      }
      setSubmitCooldown(true);
      window.setTimeout(() => setSubmitCooldown(false), 5000);
      setPhotos([]);
      setCount(1);
      setIsEmergency("no");
      setNotes("");
      setShowNotes(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:ops-updated"));
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted", { detail: { flockId } }));
      }
      void loadDetails();
      await loadEvents();
      closeLog();
      showToast("success", emergency ? alertEmerg : alertNorm);
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : errSave;
      setError(msg);
      showToast("error", msg);
      setSubmitStage("idle");
    } finally {
      setBusy(false);
    }
  }

  if (submitStage === "submitting" || submitStage === "success") {
    return (
      <SubmissionStageScreen
        stage={submitStage === "submitting" ? "submitting" : "success"}
        successText={tSubmitSuccess}
      />
    );
  }

  if (historyOpen && pageState !== "loading") {
    return (
      <div className={office ? "w-full space-y-5" : "mx-auto max-w-lg space-y-5 sm:max-w-xl"}>
        {office ? (
          <PageHeader title={linkHist} />
        ) : (
        <FieldPageHeader
          title={linkHist}
          variant="history"
          backTo={companyHref("/farm/mortality-log")}
          showAccount
        />
        )}

        <FieldFilterBar>
          <FlockScopeSelector
            flocks={flocks}
            flockId={flockId}
            onChange={setFlockId}
            label={lblFlock}
          />
        </FieldFilterBar>

        {historyLoading ? <SkeletonList rows={4} /> : null}
        {!historyLoading ? (
          <FieldHistoryList
            items={historyEvents.map((en) => ({
              id: en.id,
              primary: `${en.count ?? en.deadCount ?? 0} birds${en.isEmergency ? " · Emergency" : ""}`,
              meta: formatDateTime(en.at ?? en.logDate),
            }))}
            emptyText={tNoRecent}
          />
        ) : null}
      </div>
    );
  }

  if (logOpen && pageState === "ready") {
    return (
      <FieldLogSheet
        title={tLogTitle}
        backLabel={tBack}
        onBack={closeLog}
        submitLabel={btnSubmit}
        submittingLabel={btnSaving}
        busy={busy}
        onSubmit={() => void handleSubmit()}
        submitDisabled={!flockId || photos.length < 1 || count < 1 || submitCooldown}
      >
        <PhotoTile
          title={tPicker}
          help="Log only birds that died naturally or were culled."
          minCount={1}
          maxCount={6}
          busy={busy}
          pickerLabel={tPicker}
          onPhotos={setPhotos}
        />

        <CountStepper label={tCount} value={count} onChange={setCount} min={1} />

        <SegmentedControl
          variant="grid"
          label={tEmerg}
          value={isEmergency}
          onChange={(v) => setIsEmergency(v as "yes" | "no")}
          options={[
            { value: "no", label: tEmergNo },
            { value: "yes", label: tEmergYes },
          ]}
        />

        {showNotes ? (
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {lblNotes}
            <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowNotes(true)}>
            {tAddNotes}
          </Button>
        )}

        {error ? (
          <p className="text-sm text-[var(--status-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </FieldLogSheet>
    );
  }

  const hubTeaching = fieldHubTeachingStatus(events.length > 0, {
    title: tNoToday,
    subtitle: tTodayHint,
  });

  return (
    <div className={office ? "w-full space-y-5" : "mx-auto max-w-lg space-y-5 sm:max-w-xl"}>
      {office ? (
        <PageHeader
          title={title}
          action={<Button variant="secondary" size="sm" onClick={openHistory}>{linkHist}</Button>}
        />
      ) : (
      <FieldPageHeader
        title={title}
        backTo={companyHref("/dashboard/laborer")}
        showAccount
        action={<FieldHeaderAction onClick={openHistory}>{linkHist}</FieldHeaderAction>}
      />
      )}

      {pageState === "loading" ? <SkeletonList rows={3} /> : null}

      {pageState === "error" ? (
        <ErrorState
          message={ctxError ?? ""}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadEvents();
          }}
        />
      ) : null}

      {pageState === "no_flocks" ? (
        <FieldBlockedScreen
          title={noFlockTitle}
          description={noFlockBody}
          icon={<Skull className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
          action={
            <Button type="button" size="field" className="w-full" onClick={() => navigate(companyHref("/dashboard/laborer"))}>
              {tGoHome}
            </Button>
          }
        />
      ) : null}

      {pageState === "ready" ? (
        <>
          <FieldFlockContextBar
            flocks={flocks}
            flockId={flockId}
            onFlockChange={setFlockId}
            flockLabel={lblFlock}
            flockLabelText={status?.label}
            loading={Boolean(flockId && !status && detailLoading)}
            metrics={
              status
                ? buildFlockPassportMetrics(
                    status,
                    performance,
                    {
                      day: tDay,
                      liveBirds: tLiveBirds,
                    },
                    `${performance?.mortalityToDate ?? 0} ${tMortToDate.toLowerCase()}`
                  )
                : []
            }
          />

          <FieldTaskHub
            {...hubTeaching}
            primaryAction={
              <Button type="button" size="field" className="w-full" onClick={openLog}>
                {tLogNew}
              </Button>
            }
          >
            {eventsError ? (
              <p className="text-sm text-[var(--status-warning)]" role="status">
                {eventsError}
              </p>
            ) : null}

            <FieldSectionTitle>{tRecent}</FieldSectionTitle>
            {events.length > 0 ? (
              <ul className="space-y-2">
                {events.slice(0, 2).map((en) => (
                  <li key={en.id}>
                    <Card level="default" className="!p-3 text-sm">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {en.count ?? en.deadCount ?? 0} birds
                        {en.isEmergency ? " · Emergency" : ""}
                      </p>
                      <RecordMeta
                        className="mt-1"
                        createdAt={en.at ?? en.logDate}
                        approvalStatus={en.submissionStatus}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{tNoRecent}</p>
            )}
          </FieldTaskHub>
        </>
      ) : null}
    </div>
  );
}
