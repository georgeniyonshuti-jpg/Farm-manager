import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PhotoCaptureInput } from "../../components/farm/PhotoCaptureInput";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { CheckinBandLine } from "./CheckinBandLine";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import type { CheckinStatus } from "./checkinStatusTypes";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";

export type { CheckinBadge, CheckinStatus } from "./checkinStatusTypes";

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
}: {
  status: CheckinStatus;
  showWarning?: boolean;
  /** Other flocks (besides this card) that are overdue — multi-flock hint only. */
  otherOverdueCount?: number;
}) {
  const onSiteLine = useLaborerT(
    `Day ${status.ageDays} on-site • target harvest ~days ${status.targetSlaughterDays.min}–${status.targetSlaughterDays.max}`
  );
  const sourceWord =
    status.intervalSource === "default_age_curve" ? "age-based default" : "custom batch";
  const policyLine = useLaborerT(
    `Current policy: every ${status.intervalHours} h (${sourceWord})`
  );
  const nextDueLbl = useLaborerT("Next due:");
  const overdueMsg = useLaborerT("Overdue — please complete check-in as soon as possible.");
  const onTrackMsg = useLaborerT("You are on track.");
  const otherFlocksOverdue = useLaborerT("other flock(s) are also overdue.");
  const nextDueMs = new Date(status.nextDueAt).getTime();
  const remainingMs = Math.max(0, nextDueMs - Date.now());
  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TranslatedFlockName name={status.label} />
        <CheckinUrgencyBadge badge={status.checkinBadge} />
      </div>
      {otherOverdueCount > 0 ? (
        <p className="mt-2 text-xs font-medium text-amber-400">
          +{otherOverdueCount} <TranslatedText text={otherFlocksOverdue} />
        </p>
      ) : null}
      <p className="mt-1 text-xs text-[var(--text-muted)]">{onSiteLine}</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{policyLine}</p>
      <p className="mt-1 text-sm">
        {nextDueLbl}{" "}
        <time className="font-mono text-[var(--text-primary)]" dateTime={status.nextDueAt}>
          {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
        </time>
      </p>
      {showWarning ? (
        status.isOverdue ? (
          <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400">
            {overdueMsg} ({formatDurationMs(status.overdueMs)})
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400">
            {onTrackMsg} ({formatDurationMs(remainingMs)} remaining)
          </p>
        )
      ) : null}
    </section>
  );
}

function CheckinPhotoBlock({
  minCount,
  busy,
  onPhotos,
}: {
  minCount: number;
  busy: boolean;
  onPhotos: (urls: string[]) => void;
}) {
  const pickerLabel = useLaborerT(
    minCount === 1
      ? "Tap to add photos (1+ required, up to 6)"
      : `Tap to add photos (${minCount}+ required, up to 6)`
  );
  return (
    <PhotoCaptureInput
      minCount={minCount}
      maxCount={6}
      pickerLabel={pickerLabel}
      onChangeDataUrls={onPhotos}
      disabled={busy}
    />
  );
}

export function FarmCheckinPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const lblFlock = useLaborerT("Flock");
  const title = useLaborerT("Round check-in");
  const subtitle = useLaborerT(
    "Photos required • confirm feed & water available • optional birds lost"
  );
  const linkAction = useLaborerT("Action center");
  const lblFeedAvail = useLaborerT("Feed is available");
  const lblWaterAvail = useLaborerT("Water is available");
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
    loadDetails,
    loadFlocks,
  } = useFlockFieldContext(token);
  const [photos, setPhotos] = useState<string[]>([]);
  const [feedAvailable, setFeedAvailable] = useState(false);
  const [waterAvailable, setWaterAvailable] = useState(false);
  const [mortalityAtCheckin, setMortalityAtCheckin] = useState("");
  const [mortalityReportedInMortalityLog, setMortalityReportedInMortalityLog] = useState(false);
  const [notes, setNotes] = useState("");
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
    if (photos.length < minP) {
      setSubmitError(`Add at least ${minP} photo(s).`);
      return;
    }
    setSubmitError(null);
    setBusy(true);
    setSubmitStage("submitting");
    try {
      // ENV: moved to environment variable
      const res = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/round-checkins`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          photos,
          feedAvailable,
          waterAvailable,
          feedKg: 0,
          waterL: 0,
          mortalityAtCheckin: mortalityAtCheckin === "" ? 0 : Number(mortalityAtCheckin),
          mortalityReportedInMortalityLog,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // FIX: surface photo / server errors on check-in (no silent failure)
        const msg = (data as { error?: string }).error ?? `Save failed (${res.status})`;
        throw new Error(msg);
      }
      setPhotos([]);
      setFeedAvailable(false);
      setWaterAvailable(false);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <Link to="/dashboard/laborer" className="bounce-tap rounded-lg px-2 py-1 text-sm font-medium text-[var(--primary-color-dark)] hover:bg-[var(--primary-color-soft)]">
            {linkAction}
          </Link>
        }
      />

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
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {lblFlock}
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
        </label>
      ) : null}

      {!pageLoading && !loadError && flockId && !status && detailLoading ? <SkeletonList rows={2} /> : null}

      {!pageLoading && !loadError && status?.fcrCheckinHint && !fcrHintDismissed ? (
        <div
          className={
            status.fcrCheckinHint.severity === "warning"
              ? "rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              : "rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
          }
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{status.fcrCheckinHint.message}</p>
            <div className="flex gap-2">
              {flockId ? (
                <Link
                  to={`/farm/flocks/${encodeURIComponent(flockId)}/fcr`}
                  className="shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-2 py-1 text-xs font-semibold text-emerald-400 underline"
                >
                  FCR
                </Link>
              ) : null}
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-[var(--text-muted)] underline"
                onClick={() => setFcrHintDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!pageLoading && !loadError && status ? (
        <FlockContextStrip
          label={status.label}
          code={flocks.find((f) => f.id === flockId)?.code}
          placementDate={status.placementDate}
          ageDays={status.ageDays}
          feedToDateKg={status.feedToDateKg}
          initialCount={flocks.find((f) => f.id === flockId)?.initialCount}
          birdsLiveEstimate={performance?.birdsLiveEstimate}
          verifiedLiveCount={performance?.verifiedLiveCount}
          mortalityToDate={performance?.mortalityToDate}
          footer={
            <Link
              to="/farm/feed"
              className="text-xs font-semibold text-emerald-400 underline hover:text-emerald-300"
            >
              Log feed only (no photos)
            </Link>
          }
        />
      ) : null}

      {!pageLoading && !loadError && status && <CheckinStatusBlock status={status} />}

      {!pageLoading && !loadError && status ? (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
      >
        <CheckinPhotoBlock
          minCount={status?.photosRequiredPerRound ?? 1}
          busy={busy}
          onPhotos={setPhotos}
        />

        <label className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={feedAvailable}
            onChange={(e) => setFeedAvailable(e.target.checked)}
            className="h-5 w-5 rounded border-[var(--border-input)] text-emerald-500 focus:ring-emerald-500"
          />
          {lblFeedAvail}
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={waterAvailable}
            onChange={(e) => setWaterAvailable(e.target.checked)}
            className="h-5 w-5 rounded border-[var(--border-input)] text-emerald-500 focus:ring-emerald-500"
          />
          {lblWaterAvail}
        </label>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="mort">
            {lblMort}
          </label>
          <input
            id="mort"
            inputMode="numeric"
            className="w-full min-h-[48px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 text-lg text-[var(--text-primary)]"
            value={mortalityAtCheckin}
            placeholder={phZero}
            onChange={(e) => setMortalityAtCheckin(e.target.value)}
          />
        </div>
        {mortalityAtCheckin && Number(mortalityAtCheckin) > 0 ? (
          <label className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mortalityReportedInMortalityLog}
              onChange={(e) => setMortalityReportedInMortalityLog(e.target.checked)}
              className="h-5 w-5 rounded border-amber-500/30 text-amber-400 focus:ring-amber-500"
            />
            {lblMortLogged}
          </label>
        ) : null}
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="notes">
            {lblNotes}
          </label>
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 py-3 text-sm text-[var(--text-primary)]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {submitError && (
          <p className="text-sm text-red-400" role="alert">
            <TranslatedText text={submitError} />
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !flockId || !status}
          className="bounce-tap w-full min-h-[52px] rounded-xl bg-[var(--primary-color)] text-lg font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50"
        >
          {busy ? btnSaving : btnSubmit}
        </button>
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
        </details>
      ) : null}
    </div>
  );
}
