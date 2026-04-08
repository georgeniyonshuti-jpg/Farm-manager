import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PhotoCaptureInput } from "../../components/farm/PhotoCaptureInput";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { CheckinBandLine } from "./CheckinBandLine";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";

export type CheckinBadge = "ok" | "upcoming" | "overdue";

export type CheckinStatus = {
  flockId: string;
  label: string;
  placementDate: string;
  ageDays: number;
  targetSlaughterDays: { min: number; max: number };
  intervalHours: number;
  intervalSource: string;
  lastCheckinAt: string | null;
  nextDueAt: string;
  overdueMs: number;
  isOverdue: boolean;
  checkinBadge: CheckinBadge;
  photosRequiredPerRound: number;
  bands: { untilDay: number; intervalHours: number }[];
  fcrCheckinHint?: { severity: string; message: string } | null;
  feedToDateKg?: number | null;
};

function kigaliNowDate(): Date {
  const asKigali = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Africa/Kigali" })
  );
  return asKigali;
}

function computeLiveOverdue(status: CheckinStatus): boolean {
  const nextDue = new Date(status.nextDueAt);
  const now = kigaliNowDate();
  return now.getTime() > nextDue.getTime();
}

function formatDurationMs(ms: number): string {
  const abs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function TranslatedFlockName({ name }: { name: string }) {
  const t = useLaborerT(name);
  return <p className="text-sm font-semibold text-neutral-900">{t}</p>;
}

export function CheckinStatusBlock({
  status,
  showWarning = true,
}: {
  status: CheckinStatus;
  showWarning?: boolean;
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
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 15000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const liveIsOverdue = computeLiveOverdue(status);
  const liveBadge: CheckinBadge = liveIsOverdue ? "overdue" : status.checkinBadge;
  const now = kigaliNowDate();
  const nextDueMs = new Date(status.nextDueAt).getTime();
  const deltaMs = nextDueMs - now.getTime();
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TranslatedFlockName name={status.label} />
        {/* FIX: age-based schedule urgency badge */}
        <CheckinUrgencyBadge badge={liveBadge} />
      </div>
      <p className="mt-1 text-xs text-neutral-600">{onSiteLine}</p>
      <p className="mt-2 text-sm text-neutral-800">{policyLine}</p>
      <p className="mt-1 text-sm">
        {nextDueLbl}{" "}
        <time className="font-mono text-neutral-900" dateTime={status.nextDueAt}>
          {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
        </time>
      </p>
      {showWarning ? (
        liveIsOverdue ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
            {overdueMsg} ({formatDurationMs(Math.abs(deltaMs))})
          </p>
        ) : (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            {onTrackMsg} ({formatDurationMs(deltaMs)} remaining)
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
  const pickerLabel = useLaborerT(`Tap to add photos (${minCount}+ required, up to 6)`);
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
  const title = useLaborerT("Round check-in");
  const subtitle = useLaborerT(
    "Photos required • feed & water • optional birds lost at this round"
  );
  const linkAction = useLaborerT("Action center");
  const lblFeed = useLaborerT("Feed since last round (kg)");
  const lblWater = useLaborerT("Water since last round (L)");
  const lblMort = useLaborerT("Birds lost at this check-in (optional)");
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

  const [flockId, setFlockId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [feedKg, setFeedKg] = useState("");
  const [waterL, setWaterL] = useState("");
  const [mortalityAtCheckin, setMortalityAtCheckin] = useState("");
  const [notes, setNotes] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fcrHintDismissed, setFcrHintDismissed] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    setPageLoading(true);
    try {
      // ENV: moved to environment variable
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Flocks failed");
      const flocks = fd.flocks as { id: string }[];
      const id = flocks[0]?.id ?? null;
      setFlockId(id);
      if (!id) return;
      // ENV: moved to environment variable
      const sr = await fetch(`${API_BASE_URL}/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error(sd.error ?? "Status failed");
      setStatus(sd as CheckinStatus);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setPageLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

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
    try {
      // ENV: moved to environment variable
      const res = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/round-checkins`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          photos,
          feedKg: feedKg === "" ? 0 : Number(feedKg),
          waterL: waterL === "" ? 0 : Number(waterL),
          mortalityAtCheckin: mortalityAtCheckin === "" ? 0 : Number(mortalityAtCheckin),
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
      setFeedKg("");
      setWaterL("");
      setMortalityAtCheckin("");
      setNotes("");
      if ((data as { status?: CheckinStatus }).status) {
        setStatus((data as { status: CheckinStatus }).status);
      } else void loadStatus();
      const pay = (data as { payrollImpact?: { rwfDelta?: number } }).payrollImpact;
      const flockDay = (data as { flockDay?: number }).flockDay;
      const bonus =
        pay != null && typeof pay.rwfDelta === "number"
          ? ` (${pay.rwfDelta >= 0 ? "+" : ""}${pay.rwfDelta} RWF)`
          : "";
      const dayLabel = typeof flockDay === "number" ? ` (Day ${flockDay})` : "";
      showToast("success", `${savedMsg}${dayLabel}${bonus}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : errSave;
      setSubmitError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
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
      {!pageLoading && loadError && <ErrorState message={loadError} onRetry={() => void loadStatus()} />}

      {!pageLoading && !loadError && status?.fcrCheckinHint && !fcrHintDismissed ? (
        <div
          className={
            status.fcrCheckinHint.severity === "warning"
              ? "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
              : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          }
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{status.fcrCheckinHint.message}</p>
            <div className="flex gap-2">
              {flockId ? (
                <Link
                  to={`/farm/flocks/${encodeURIComponent(flockId)}/fcr`}
                  className="shrink-0 rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-900 underline"
                >
                  FCR
                </Link>
              ) : null}
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-neutral-600 underline"
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
          placementDate={status.placementDate}
          ageDays={status.ageDays}
          feedToDateKg={status.feedToDateKg}
          footer={
            <Link
              to="/farm/feed"
              className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
            >
              Log feed only (no photos)
            </Link>
          }
        />
      ) : null}

      {!pageLoading && !loadError && status && <CheckinStatusBlock status={status} />}

      {!pageLoading && !loadError ? (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-5 rounded-2xl border border-[var(--border-color)] bg-white p-4 shadow-sm sm:p-5"
      >
        <CheckinPhotoBlock
          minCount={status?.photosRequiredPerRound ?? 1}
          busy={busy}
          onPhotos={setPhotos}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="feed">
            {lblFeed}
          </label>
          <input
            id="feed"
            inputMode="decimal"
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-4 text-lg"
            value={feedKg}
            onChange={(e) => setFeedKg(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="water">
            {lblWater}
          </label>
          <input
            id="water"
            inputMode="decimal"
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-4 text-lg"
            value={waterL}
            onChange={(e) => setWaterL(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="mort">
            {lblMort}
          </label>
          <input
            id="mort"
            inputMode="numeric"
            className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-4 text-lg"
            value={mortalityAtCheckin}
            placeholder={phZero}
            onChange={(e) => setMortalityAtCheckin(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="notes">
            {lblNotes}
          </label>
          <textarea
            id="notes"
            rows={3}
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {submitError && (
          <p className="text-sm text-red-800" role="alert">
            <TranslatedText text={submitError} />
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !flockId}
          className="bounce-tap w-full min-h-[52px] rounded-xl bg-[var(--primary-color)] text-lg font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50"
        >
          {busy ? btnSaving : btnSubmit}
        </button>
      </form>
      ) : null}

      {!pageLoading && !loadError && status ? (
        <details className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-700">
          <summary className="cursor-pointer font-medium text-neutral-900">{detailsTitle}</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {status.bands.map((b) => (
              <CheckinBandLine key={`${b.untilDay}-${b.intervalHours}`} untilDay={b.untilDay} hours={b.intervalHours} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">{detailsFoot}</p>
        </details>
      ) : null}
    </div>
  );
}
