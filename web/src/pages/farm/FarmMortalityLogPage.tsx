import { useState } from "react";
import { Link } from "react-router-dom";
import { PhotoCaptureInput } from "../../components/farm/PhotoCaptureInput";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders } from "../../lib/authHeaders";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";

function MortalityPhotoBlock({
  busy,
  onPhotos,
}: {
  busy: boolean;
  onPhotos: (urls: string[]) => void;
}) {
  const pickerLabel = useLaborerT("Tap to add photos (1+ required, up to 6)");
  return (
    <PhotoCaptureInput
      minCount={1}
      maxCount={6}
      pickerLabel={pickerLabel}
      onChangeDataUrls={onPhotos}
      disabled={busy}
    />
  );
}

export function FarmMortalityLogPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const lblFlock = useLaborerT("Flock");
  const title = useLaborerT("Log mortality");
  const subtitle = useLaborerT(
    "Anytime — at a round check-in or as an emergency. Photos required.",
  );
  const linkHist = useLaborerT("History");
  const lblCount = useLaborerT("Number of birds");
  const emergTitle = useLaborerT("Emergency / unusual loss");
  const emergHint = useLaborerT(
    "Flags the event for faster vet review and may trigger alerts.",
  );
  const lblNotes = useLaborerT("Notes (optional)");
  const btnSaving = useLaborerT("Saving…");
  const btnSubmit = useLaborerT("Submit mortality");
  const alertEmerg = useLaborerT("Emergency mortality logged.");
  const alertNorm = useLaborerT("Mortality logged.");
  const errSave = useLaborerT("Save failed");
  const noFlockTitle = useLaborerT("No flock available");
  const noFlockBody = useLaborerT("Add a flock before logging mortality.");

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

  const [photos, setPhotos] = useState<string[]>([]);
  const [count, setCount] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitCooldown, setSubmitCooldown] = useState(false);

  const flockLoading = listLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    if (submitCooldown) {
      setError("Please wait a few seconds before submitting again.");
      return;
    }
    if (photos.length < 1) {
      setError("Add at least one photo of the mortality.");
      return;
    }
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter number of birds (1 or more).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/flocks/${flockId}/mortality-events`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          photos,
          count: n,
          isEmergency,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const hint = (data as { hint?: string }).hint ?? "";
        throw new Error(
          `${(data as { error?: string }).error ?? "Duplicate entry"}${hint ? ` — ${hint}` : ""}`,
        );
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setSubmitCooldown(true);
      window.setTimeout(() => setSubmitCooldown(false), 5000);
      setPhotos([]);
      setCount("");
      setIsEmergency(false);
      setNotes("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:ops-updated"));
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted"));
      }
      void loadDetails();
      const okMsg = isEmergency ? alertEmerg : alertNorm;
      showToast("success", okMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : errSave;
      setError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <Link to="/farm/mortality" className="text-sm font-medium text-emerald-800 hover:underline">
            {linkHist}
          </Link>
        }
      />

      {flockLoading && <SkeletonList rows={2} />}

      {!flockLoading && ctxError && (
        <ErrorState
          message={ctxError}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
          }}
        />
      )}

      {!flockLoading && !ctxError && flocks.length === 0 ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      {!flockLoading && !ctxError && flocks.length > 0 ? (
        <label className="block text-sm font-medium text-neutral-700">
          {lblFlock}
          <select
            className="mt-1 w-full min-h-[48px] rounded-xl border border-neutral-300 px-3 text-base"
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

      {!flockLoading && !ctxError && flockId && !status && detailLoading ? <SkeletonList rows={2} /> : null}

      {!flockLoading && !ctxError && status ? (
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
        />
      ) : null}

      {!flockLoading && !ctxError && flockId && status ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
        >
          <MortalityPhotoBlock busy={busy} onPhotos={setPhotos} />

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="cnt">
              {lblCount}
            </label>
            <input
              id="cnt"
              inputMode="numeric"
              required
              className="w-full min-h-[48px] rounded-xl border border-neutral-300 px-4 text-lg"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-red-300 text-red-700"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-red-900">{emergTitle}</span>
              <span className="text-xs text-red-800/90">{emergHint}</span>
            </span>
          </label>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="mnotes">
              {lblNotes}
            </label>
            <textarea
              id="mnotes"
              rows={3}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? (
            <p className="text-sm text-red-800" role="alert">
              <TranslatedText text={error} />
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !flockId || submitCooldown}
            className="w-full min-h-[52px] rounded-xl bg-neutral-900 text-lg font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? btnSaving : btnSubmit}
          </button>
        </form>
      ) : null}
    </div>
  );
}
