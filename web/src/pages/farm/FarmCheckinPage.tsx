import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { CheckinBandLine } from "./CheckinBandLine";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { createRoundCheckin } from "../../api/farm.api";
import { PhotoTile } from "../../components/farm/PhotoTile";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import type { CheckinStatus } from "./checkinStatusTypes";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { Button, Card, Field, Input, Metric, SegmentedControl, Textarea } from "../../components/ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";

export type { CheckinBadge, CheckinStatus } from "./checkinStatusTypes";
export type OpsGlanceSummary = {
  activeFlockCount: number;
  checkinDoneTodayCount: number;
  feedLoggedTodayCount: number;
  vetLoggedRecentCount: number;
  vetRecentWindowDays: number;
  oldestMissing?: {
    checkin?: { flockId: string; label: string; hours: number } | null;
    feed?: { flockId: string; label: string; hours: number } | null;
    vet?: { flockId: string; label: string; days: number } | null;
  } | null;
  focus?: "checkin" | "feed" | "vet" | null;
};

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
  const { token } = useAuth();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const lblFlock = useLaborerT("Flock");
  const title = useLaborerT("Round check-in");
  const subtitle = useLaborerT(
    "Photos required • confirm feed & water available • optional birds lost"
  );
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
  const detailsTitle = useLaborerT("Age → frequency curve");
  const detailsFoot = useLaborerT(
    "Management, vet, or superuser can customize this batch under Check-in schedule."
  );
  const savedMsg = useLaborerT("Round check-in saved.");
  const errSave = useLaborerT("Save failed");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Add a flock before submitting round check-ins.");

  const {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error: loadError,
    flockSync,
    loadDetails,
    loadFlocks,
  } = useFlockFieldContext(token);
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
  const [fcrHintDismissed, setFcrHintDismissed] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");

  const pageLoading = listLoading;

  useEffect(() => {
    setFcrHintDismissed(false);
  }, [flockId, status?.fcrCheckinHint?.message]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    const minP = status?.photosRequiredPerRound ?? 1;
    if (!Number.isFinite(Number(coopTemperatureC))) {
      setSubmitError("Coop temperature is required.");
      return;
    }
    if (photosFlockSign.length < minP) {
      setSubmitError(`Add at least ${minP} flock sign photo(s).`);
      return;
    }
    if (photosThermometer.length < 1) {
      setSubmitError("Add at least one thermometer photo.");
      return;
    }
    const feedAvailable = feedLevel !== "empty";
    const waterAvailable = waterLevel === "yes";
    if (feedAvailable && photosFeed.length < 1) {
      setSubmitError("Add at least one feed photo when feed is available.");
      return;
    }
    if (waterAvailable && photosWater.length < 1) {
      setSubmitError("Add at least one water photo when water is available.");
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
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted"));
      }
      void loadDetails();
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
        successText="Round check-in submitted successfully."
      />
    );
  }

  const tempVal = Number(coopTemperatureC);
  const tempExpectedMin = 27;
  const tempExpectedMax = 30;
  const tempVerdict =
    !Number.isFinite(tempVal) || coopTemperatureC === ""
      ? null
      : tempVal < tempExpectedMin || tempVal > tempExpectedMax
        ? "out"
        : "ok";
  const feedAvailable = feedLevel !== "empty";
  const waterAvailable = waterLevel === "yes";

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl md:space-y-6">
      <FieldPageHeader
        title={title}
        backTo={companyHref("/dashboard/laborer")}
        backLabel={linkAction}
        context={status?.label}
      />
      <div className="hidden md:block">
        <PageHeader
          title={title}
          subtitle={subtitle}
          action={
            <Link to={companyHref("/dashboard/laborer")} className="bounce-tap rounded-lg px-2 py-1 text-sm font-medium text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]">
              {linkAction}
            </Link>
          }
        />
      </div>

      {flockSync?.stale && !loadError ? (
        <div
          className="rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning-soft)] px-3 py-2 text-sm text-[var(--status-warning)]"
          role="status"
        >
          Flock list may be slightly out of date. Refresh if a batch is missing.
        </div>
      ) : null}

      {pageLoading && <SkeletonList rows={3} />}
      {!pageLoading && loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
          }}
        />
      )}

      {!pageLoading && !loadError && flocks.length === 0 ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      {!pageLoading && !loadError && flocks.length > 0 ? (
        <Field label={lblFlock}>
          <select
            className="mt-1 w-full min-h-[48px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)]"
            value={flockId}
            onChange={(e) => setFlockId(e.target.value)}
          >
            {flocks.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {!pageLoading && !loadError && flockId && !status && detailLoading ? <SkeletonList rows={2} /> : null}

      {!pageLoading && !loadError && status?.fcrCheckinHint && !fcrHintDismissed ? (
        <div
          className={
            status.fcrCheckinHint.severity === "warning"
              ? "rounded-xl border border-[var(--status-danger)]/25 bg-[var(--status-danger-soft)] px-4 py-3 text-sm text-[var(--status-danger)]"
              : "rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning-soft)] px-4 py-3 text-sm text-[var(--status-warning)]"
          }
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{status.fcrCheckinHint.message}</p>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold underline"
              onClick={() => setFcrHintDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {!pageLoading && !loadError && status ? (
        <CheckinStatusBlock
          status={status}
          birdsLive={performance?.birdsLiveEstimate ?? performance?.verifiedLiveCount}
          mortalityToDate={performance?.mortalityToDate}
        />
      ) : null}

      {!pageLoading && !loadError && status ? (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]"
      >
        <CheckinPhotoBlock
          title={lblFlockSignPhoto}
          help="Required for this round"
          minCount={status?.photosRequiredPerRound ?? 1}
          maxCount={6}
          allowMultiple
          busy={busy}
          pickerLabel={lblFlockSignPhoto}
          onPhotos={setPhotosFlockSign}
        />

        <Field label={lblCoopTemp} htmlFor="coop-temperature" help={`Expected ${tempExpectedMin}–${tempExpectedMax}°C`}>
          <Input
            id="coop-temperature"
            inputMode="decimal"
            className="text-lg"
            value={coopTemperatureC}
            placeholder="28.4"
            onChange={(e) => setCoopTemperatureC(e.target.value)}
            required
          />
        </Field>
        {tempVerdict === "ok" ? (
          <p className="text-xs font-semibold text-[var(--status-success)]">✓ Normal — within expected range</p>
        ) : null}
        {tempVerdict === "out" ? (
          <p className="text-xs font-semibold text-[var(--status-danger)]">Out of expected range ({tempExpectedMin}–{tempExpectedMax}°C)</p>
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
            + {lblNotes}
          </Button>
        ) : (
          <Field label={lblNotes} htmlFor="notes">
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        )}

        {submitError && (
          <p className="text-sm text-[var(--status-danger)]" role="alert">
            <TranslatedText text={submitError} />
          </p>
        )}
        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-[5] bg-[var(--surface-card)] pt-2 md:static md:bg-transparent">
          <Button type="submit" size="field" className="w-full" disabled={busy || !flockId || !status}>
            {busy ? btnSaving : btnSubmit}
          </Button>
        </div>
      </form>
      ) : null}

      {!pageLoading && !loadError && status ? (
        <details className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-secondary)]">
          <summary className="cursor-pointer font-medium text-[var(--text-primary)]">{detailsTitle}</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {status.bands.map((b) => (
              <CheckinBandLine key={`${b.untilDay}-${b.intervalHours}`} untilDay={b.untilDay} hours={b.intervalHours} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{detailsFoot}</p>
          <Link to={companyHref("/farm/feed")} className="mt-2 inline-block text-xs font-semibold text-[var(--primary-color)] underline">
            Log feed only
          </Link>
        </details>
      ) : null}
    </div>
  );
}
