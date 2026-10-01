import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { shouldShowRoundCheckin } from "../../auth/permissions";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { CheckinBandLine } from "./CheckinBandLine";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { FieldBlockedScreen } from "../../components/field/FieldBlockedScreen";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { createRoundCheckin, fetchCheckinsList } from "../../api/farm.api";
import { PhotoTile } from "../../components/farm/PhotoTile";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import type { CheckinStatus } from "./checkinStatusTypes";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { Button, Card, Field, Input, Metric, SegmentedControl, Textarea } from "../../components/ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFieldTaskState } from "../../hooks/useFieldTaskState";
import { FieldFlockContextBar } from "../../components/field/FieldFlockContextBar";
import { buildFlockPassportMetrics } from "../../components/field/fieldFlockMetrics";
import { FieldTaskHub } from "../../components/field/FieldTaskHub";
import { FieldStepSheet } from "../../components/field/FieldStepSheet";
import { RecordMeta } from "../../components/farm/RecordMeta";

export type { CheckinBadge, CheckinStatus } from "./checkinStatusTypes";
export type { OpsGlanceSummary } from "./opsGlanceTypes";
import type { OpsGlanceSummary } from "./opsGlanceTypes";

function formatDurationMs(ms: number): string {
  const abs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TranslatedFlockName({ name }: { name: string }) {
  const t = useLaborerT(name);
  return <p className="text-sm font-semibold text-[var(--text-primary)]">{t}</p>;
}

export function CheckinStatusBlock({
  status,
  showWarning = true,
  otherOverdueCount = 0,
  opsGlance = null,
  birdsLive,
  mortalityToDate,
}: {
  status: CheckinStatus;
  showWarning?: boolean;
  otherOverdueCount?: number;
  opsGlance?: OpsGlanceSummary | null;
  birdsLive?: number | null;
  mortalityToDate?: number | null;
}) {
  const overdueMsg = useLaborerT("Immediate attention required — potential welfare risk.");
  const onTrackMsg = useLaborerT("You are on track.");
  const nextDueLbl = useLaborerT("Next check");
  const dayLbl = useLaborerT("Day");
  const birdsLbl = useLaborerT("Live birds");
  const mortLbl = useLaborerT("Mortality");
  const otherFlocksOverdue = useLaborerT("other flock(s) also overdue");
  const detailsLbl = useLaborerT("Details");
  const policyLine = useLaborerT(
    `Policy: every ${status.intervalHours} h · harvest ~days ${status.targetSlaughterDays.min}–${status.targetSlaughterDays.max}`
  );
  const nextDueMs = new Date(status.nextDueAt).getTime();
  const remainingMs = Math.max(0, nextDueMs - Date.now());
  const overdueHours = Math.max(1, Math.round(status.overdueMs / 3600000));

  return (
    <Card level={status.isOverdue ? "elevated" : "default"} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TranslatedFlockName name={status.label} />
        <CheckinUrgencyBadge badge={status.checkinBadge} />
      </div>
      {opsGlance && opsGlance.activeFlockCount > 0 ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
          Today&apos;s rounds {opsGlance.checkinDoneTodayCount}/{opsGlance.activeFlockCount}
          {otherOverdueCount > 0 ? ` · ${otherOverdueCount} ${otherFlocksOverdue}` : ""}
        </div>
      ) : otherOverdueCount > 0 ? (
        <p className="text-xs font-medium text-[var(--status-warning)]">
          +{otherOverdueCount} {otherFlocksOverdue}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={dayLbl} value={status.ageDays} />
        <Metric label={birdsLbl} value={birdsLive != null ? birdsLive : "—"} />
        <Metric
          label={mortLbl}
          value={mortalityToDate != null ? mortalityToDate : "—"}
          context={mortalityToDate == null ? undefined : "To date"}
        />
        <Metric
          label={nextDueLbl}
          value={status.isOverdue ? `${overdueHours}h` : formatDurationMs(remainingMs)}
          context={status.isOverdue ? "Overdue" : "Remaining"}
        />
      </div>
      {showWarning ? (
        status.isOverdue ? (
          <div
            className="rounded-xl border border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] px-3 py-3 text-sm font-semibold text-[var(--status-danger)]"
            role="alert"
          >
            {overdueMsg}
            <p className="mt-1 text-xs font-medium opacity-90">
              Last due {formatDurationMs(status.overdueMs)} ago · {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-[var(--status-success)]/25 bg-[var(--status-success-soft)] px-3 py-2 text-sm font-medium text-[var(--status-success)]">
            {onTrackMsg} ({formatDurationMs(remainingMs)} remaining)
          </p>
        )
      ) : null}
      <details className="text-xs text-[var(--text-muted)]">
        <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">{detailsLbl}</summary>
        <p className="mt-2">{policyLine}</p>
        <p className="mt-1">
          Feed to date: {status.feedToDateKg != null ? `${status.feedToDateKg} kg` : "—"} · Placement{" "}
          {status.placementDate}
        </p>
      </details>
    </Card>
  );
}

function CheckinPhotoBlock({
  title,
  help,
  minCount,
  maxCount = 6,
  allowMultiple = true,
  busy,
  pickerLabel,
  onPhotos,
}: {
  title: string;
  help?: string;
  minCount: number;
  maxCount?: number;
  allowMultiple?: boolean;
  busy: boolean;
  pickerLabel?: string;
  onPhotos: (urls: string[]) => void;
}) {
  return (
    <PhotoTile
      title={title}
      help={help}
      minCount={minCount}
      maxCount={maxCount}
      allowMultiple={allowMultiple}
      busy={busy}
      pickerLabel={pickerLabel}
      onPhotos={onPhotos}
    />
  );
}

export function FarmCheckinPage() {
  const { token, user } = useAuth();
  const { fieldReportingMode } = useFarmCapabilities();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logOpen = searchParams.get("log") === "1";
  const step = Math.min(3, Math.max(1, Number(searchParams.get("step") || "1") || 1));

  const lblFlock = useLaborerT("Flock");
  const title = useLaborerT("Round check-in");
  const linkAction = useLaborerT("Action center");
  const lblFeedAvail = useLaborerT("Feed is available");
  const lblWaterAvail = useLaborerT("Water is available");
  const lblCoopTemp = useLaborerT("Coop temperature (°C)");
  const lblFlockSignPhoto = useLaborerT("Take photo(s) of flock number sign");
  const lblThermometerPhoto = useLaborerT("Take photo of thermometer");
  const lblFeedPhoto = useLaborerT("Take photo of available feed");
  const lblWaterPhoto = useLaborerT("Take photo of available water");
  const lblMort = useLaborerT("Birds lost at this check-in (optional)");
  const lblMortLogged = useLaborerT("Also file in mortality log (affects live count)");
  const lblNotes = useLaborerT("Notes");
  const phZero = useLaborerT("0");
  const btnSaving = useLaborerT("Saving…");
  const btnSubmit = useLaborerT("Submit round check-in");
  const savedMsg = useLaborerT("Round check-in saved.");
  const errSave = useLaborerT("Save failed");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Add a flock before submitting round check-ins.");
  const tGoHome = useLaborerT("Back to home");
  const tStartRound = useLaborerT("Start round");
  const tNext = useLaborerT("Next");
  const tBack = useLaborerT("Back");
  const tStepFlock = useLaborerT("Flock proof");
  const tStepBarn = useLaborerT("Barn check");
  const tStepFinish = useLaborerT("Finish");
  const tOnTrack = useLaborerT("On track — next round in {time}");
  const tOverdue = useLaborerT("Round overdue — inspect flock now");
  const tRoundHint = useLaborerT("Tap below to start this round.");
  const tRecent = useLaborerT("Last round");
  const tNoRecent = useLaborerT("No rounds logged yet for this flock.");
  const tDay = useLaborerT("Day");
  const tLiveBirds = useLaborerT("Live birds");
  const tAddNotes = useLaborerT("Add notes");
  const tSubmitSuccess = useLaborerT("Round check-in submitted successfully.");
  const tScheduleLink = useLaborerT("Check-in schedule");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error: loadError,
    loadDetails,
    loadFlocks,
  } = useFlockFieldContext(token);

  useEffect(() => {
    if (!user) return;
    if (!shouldShowRoundCheckin(user, fieldReportingMode)) {
      if (user.role === "vet") {
        navigate(companyHref("/farm/vet-logs"), { replace: true });
      } else {
        navigate(companyHref("/dashboard/laborer"), { replace: true });
      }
    }
  }, [user, fieldReportingMode, navigate, companyHref]);

  const [photosFlockSign, setPhotosFlockSign] = useState<string[]>([]);
  const [photosThermometer, setPhotosThermometer] = useState<string[]>([]);
  const [photosFeed, setPhotosFeed] = useState<string[]>([]);
  const [photosWater, setPhotosWater] = useState<string[]>([]);
  const [coopTemperatureC, setCoopTemperatureC] = useState("");
  const [mortalityAtCheckin, setMortalityAtCheckin] = useState("");
  const [mortalityReportedInMortalityLog, setMortalityReportedInMortalityLog] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [feedLevel, setFeedLevel] = useState<"full" | "low" | "empty">("full");
  const [waterLevel, setWaterLevel] = useState<"yes" | "no">("yes");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [recentCheckin, setRecentCheckin] = useState<{ id: string; recordedAt?: string; coopTemperatureC?: number } | null>(null);

  const pageState = useFieldTaskState({
    listLoading,
    error: loadError,
    flockCount: flocks.length,
    needsStock: false,
  });

  const loadRecent = useCallback(async () => {
    if (!flockId || !token) {
      setRecentCheckin(null);
      return;
    }
    try {
      const data = await fetchCheckinsList(token, { flockId, pageSize: 1 });
      const row = data.checkins?.[0];
      setRecentCheckin(
        row ? { id: row.id, recordedAt: row.at, coopTemperatureC: row.coopTemperatureC ?? undefined } : null
      );
    } catch {
      setRecentCheckin(null);
    }
  }, [flockId, token]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const openLog = () => setSearchParams({ log: "1", step: "1" });
  const closeLog = () => setSearchParams({});
  const goStep = (n: number) => setSearchParams({ log: "1", step: String(n) });

  const feedAvailable = feedLevel !== "empty";
  const waterAvailable = waterLevel === "yes";
  const minPhotos = status?.photosRequiredPerRound ?? 1;
  const tempExpectedMin = 27;
  const tempExpectedMax = 30;
  const tempVal = Number(coopTemperatureC);
  const tempVerdict =
    !Number.isFinite(tempVal) || coopTemperatureC === ""
      ? null
      : tempVal < tempExpectedMin || tempVal > tempExpectedMax
        ? "out"
        : "ok";

  const hubStatus = useMemo(() => {
    if (!status) return { title: "", subtitle: "" };
    const nextDueMs = new Date(status.nextDueAt).getTime();
    const remainingMs = Math.max(0, nextDueMs - Date.now());
    if (status.isOverdue) {
      return { title: tOverdue, subtitle: status.fcrCheckinHint?.message ?? tRoundHint };
    }
    return {
      title: tOnTrack.replace("{time}", formatDurationMs(remainingMs)),
      subtitle: status.fcrCheckinHint?.message ?? tRoundHint,
    };
  }, [status, tOverdue, tOnTrack, tRoundHint]);

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (photosFlockSign.length < minPhotos) {
        return `Add at least ${minPhotos} flock sign photo(s).`;
      }
    }
    if (s === 2) {
      if (!Number.isFinite(Number(coopTemperatureC))) return "Coop temperature is required.";
      if (photosThermometer.length < 1) return "Add at least one thermometer photo.";
    }
    if (s === 3) {
      if (feedAvailable && photosFeed.length < 1) {
        return "Add at least one feed photo when feed is available.";
      }
      if (waterAvailable && photosWater.length < 1) {
        return "Add at least one water photo when water is available.";
      }
    }
    return null;
  }

  async function handleSubmit() {
    if (!flockId) return;
    const err = validateStep(3);
    if (err) {
      setSubmitError(err);
      return;
    }
    setSubmitError(null);
    setBusy(true);
    setSubmitStage("submitting");
    try {
      const data = await createRoundCheckin(token, flockId, {
        photosFlockSign,
        photosThermometer,
        photosFeed,
        photosWater,
        coopTemperatureC: Number(coopTemperatureC),
        feedAvailable,
        waterAvailable,
        feedOk: feedAvailable,
        waterOk: waterAvailable,
        feedKg: 0,
        waterL: 0,
        mortalityAtCheckin: mortalityAtCheckin === "" ? 0 : Number(mortalityAtCheckin),
        mortalityReportedInMortalityLog,
        notes,
      });
      setPhotosFlockSign([]);
      setPhotosThermometer([]);
      setPhotosFeed([]);
      setPhotosWater([]);
      setCoopTemperatureC("");
      setFeedLevel("full");
      setWaterLevel("yes");
      setShowNotes(false);
      setMortalityAtCheckin("");
      setMortalityReportedInMortalityLog(false);
      setNotes("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted", { detail: { flockId } }));
      }
      void loadDetails();
      await loadRecent();
      closeLog();
      const pay = (data as { payrollImpact?: { rwfDelta?: number } }).payrollImpact;
      const flockDay = (data as { flockDay?: number }).flockDay;
      const bonus =
        pay != null && typeof pay.rwfDelta === "number"
          ? ` (${pay.rwfDelta >= 0 ? "+" : ""}${pay.rwfDelta} RWF)`
          : "";
      const dayLabel = typeof flockDay === "number" ? ` (Day ${flockDay})` : "";
      showToast("success", `${savedMsg}${dayLabel}${bonus}`);
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : errSave;
      setSubmitError(msg);
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

  const stepLabels = [tStepFlock, tStepBarn, tStepFinish];
  const isManager = user?.role === "vet_manager" || user?.role === "manager" || user?.role === "company_admin";

  if (logOpen && pageState === "ready" && status) {
    const stepLabel = stepLabels[step - 1];
    const onBack = () => (step > 1 ? goStep(step - 1) : closeLog());
    const onNext = () => {
      const err = validateStep(step);
      if (err) {
        setSubmitError(err);
        return;
      }
      setSubmitError(null);
      goStep(step + 1);
    };

    return (
      <FieldStepSheet
        title={title}
        backLabel={tBack}
        onBack={onBack}
        step={step}
        totalSteps={3}
        stepLabel={stepLabel}
        nextLabel={tNext}
        nextDisabled={busy}
        onNext={step < 3 ? onNext : undefined}
        submitLabel={btnSubmit}
        submittingLabel={btnSaving}
        busy={busy}
        onSubmit={() => void handleSubmit()}
        submitDisabled={busy || !flockId}
      >
        {step === 1 ? (
          <CheckinPhotoBlock
            title={lblFlockSignPhoto}
            help="Required for this round"
            minCount={minPhotos}
            maxCount={6}
            allowMultiple
            busy={busy}
            pickerLabel={lblFlockSignPhoto}
            onPhotos={setPhotosFlockSign}
          />
        ) : null}

        {step === 2 ? (
          <>
            <Field label={lblCoopTemp} htmlFor="coop-temperature" help={`Expected ${tempExpectedMin}–${tempExpectedMax}°C`}>
              <Input
                id="coop-temperature"
                inputMode="decimal"
                className="text-lg"
                value={coopTemperatureC}
                placeholder="28.4"
                onChange={(e) => setCoopTemperatureC(e.target.value)}
              />
            </Field>
            {tempVerdict === "ok" ? (
              <p className="text-xs font-semibold text-[var(--status-success)]">✓ Normal — within expected range</p>
            ) : null}
            {tempVerdict === "out" ? (
              <p className="text-xs font-semibold text-[var(--status-danger)]">
                Out of expected range ({tempExpectedMin}–{tempExpectedMax}°C)
              </p>
            ) : null}
            <CheckinPhotoBlock
              title={lblThermometerPhoto}
              minCount={1}
              maxCount={1}
              allowMultiple={false}
              busy={busy}
              pickerLabel={lblThermometerPhoto}
              onPhotos={setPhotosThermometer}
            />
            <SegmentedControl
              variant="grid"
              label={lblFeedAvail}
              value={feedLevel}
              onChange={(v) => setFeedLevel(v as "full" | "low" | "empty")}
              options={[
                { value: "full", label: "Full" },
                { value: "low", label: "Low" },
                { value: "empty", label: "Empty" },
              ]}
            />
            <SegmentedControl
              variant="grid"
              label={lblWaterAvail}
              value={waterLevel}
              onChange={(v) => setWaterLevel(v as "yes" | "no")}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            {feedAvailable ? (
              <CheckinPhotoBlock
                title={lblFeedPhoto}
                minCount={1}
                maxCount={1}
                allowMultiple={false}
                busy={busy}
                pickerLabel={lblFeedPhoto}
                onPhotos={setPhotosFeed}
              />
            ) : null}
            {waterAvailable ? (
              <CheckinPhotoBlock
                title={lblWaterPhoto}
                minCount={1}
                maxCount={1}
                allowMultiple={false}
                busy={busy}
                pickerLabel={lblWaterPhoto}
                onPhotos={setPhotosWater}
              />
            ) : null}
            <Field label={lblMort} htmlFor="mort">
              <Input
                id="mort"
                inputMode="numeric"
                className="text-lg"
                value={mortalityAtCheckin}
                placeholder={phZero}
                onChange={(e) => setMortalityAtCheckin(e.target.value)}
              />
            </Field>
            {mortalityAtCheckin && Number(mortalityAtCheckin) > 0 ? (
              <label className="flex items-center gap-3 rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning-soft)] px-4 py-3 text-sm font-medium text-[var(--status-warning)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mortalityReportedInMortalityLog}
                  onChange={(e) => setMortalityReportedInMortalityLog(e.target.checked)}
                  className="h-5 w-5 rounded"
                />
                {lblMortLogged}
              </label>
            ) : null}
            {!showNotes ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNotes(true)}>
                {tAddNotes}
              </Button>
            ) : (
              <Field label={lblNotes} htmlFor="notes">
                <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            )}
          </>
        ) : null}

        {submitError ? (
          <p className="text-sm text-[var(--status-danger)]" role="alert">
            <TranslatedText text={submitError} />
          </p>
        ) : null}
      </FieldStepSheet>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <FieldPageHeader
        title={title}
        backTo={companyHref("/dashboard/laborer")}
        backLabel={linkAction}
        showAccount
      />

      {pageState === "loading" ? <SkeletonList rows={3} /> : null}

      {pageState === "error" ? (
        <ErrorState
          message={loadError ?? ""}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadRecent();
          }}
        />
      ) : null}

      {pageState === "no_flocks" ? (
        <FieldBlockedScreen
          title={noFlockTitle}
          description={noFlockBody}
          icon={<ClipboardCheck className="h-10 w-10 text-[var(--status-warning)]" aria-hidden />}
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
            badge={status?.checkinBadge}
            loading={Boolean(flockId && !status && detailLoading)}
            metrics={
              status
                ? buildFlockPassportMetrics(status, performance, {
                    day: tDay,
                    liveBirds: tLiveBirds,
                  })
                : []
            }
          />

          {status ? (
            <FieldTaskHub
              statusTitle={hubStatus.title}
              statusSubtitle={hubStatus.subtitle}
              primaryAction={
                <Button type="button" size="field" className="w-full" onClick={openLog}>
                  {tStartRound}
                </Button>
              }
            >
              <section className="space-y-2">
                <p className="type-h3 text-[var(--text-primary)]">{tRecent}</p>
                {recentCheckin ? (
                  <Card level="default" className="!p-3 text-sm">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {recentCheckin.coopTemperatureC != null
                        ? `${recentCheckin.coopTemperatureC}°C`
                        : "Round logged"}
                    </p>
                    <RecordMeta className="mt-1" createdAt={recentCheckin.recordedAt} />
                  </Card>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">{tNoRecent}</p>
                )}
              </section>
            </FieldTaskHub>
          ) : null}

          {isManager && status ? (
            <details className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-secondary)]">
              <summary className="cursor-pointer font-medium text-[var(--text-primary)]">{tScheduleLink}</summary>
              <ul className="mt-2 space-y-1 pl-4">
                {status.bands.map((b) => (
                  <CheckinBandLine key={`${b.untilDay}-${b.intervalHours}`} untilDay={b.untilDay} hours={b.intervalHours} />
                ))}
              </ul>
              <Link to={companyHref("/farm/feed")} className="mt-2 inline-block text-xs font-semibold text-[var(--primary-color)] underline">
                Log feed only
              </Link>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
