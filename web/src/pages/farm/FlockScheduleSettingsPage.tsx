import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import type { CheckinStatus } from "./FarmCheckinPage";

type Band = { untilDay: number; intervalHours: number };

export function FlockScheduleSettingsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [flockId, setFlockId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [photosRequired, setPhotosRequired] = useState(1);
  const [targetMin, setTargetMin] = useState(45);
  const [targetMax, setTargetMax] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setPageLoading(true);
    try {
      const fr = await fetch("/api/flocks", { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error);
      const flocks = fd.flocks as { id: string }[];
      const id = flocks[0]?.id ?? null;
      setFlockId(id);
      if (!id) {
        setStatus(null);
        return;
      }
      const sr = await fetch(`/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error(sd.error);
      const s = sd as CheckinStatus;
      setStatus(s);
      setBands(s.bands.map((b) => ({ ...b })));
      setPhotosRequired(s.photosRequiredPerRound ?? 1);
      setTargetMin(s.targetSlaughterDays.min);
      setTargetMax(s.targetSlaughterDays.max);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setPageLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateBand(i: number, field: keyof Band, value: string) {
    setBands((prev) => {
      const next = prev.map((b, j) => (j === i ? { ...b } : b));
      if (!next[i]) return prev;
      if (field === "untilDay") next[i].untilDay = Math.max(1, Number(value) || 1);
      if (field === "intervalHours") next[i].intervalHours = Math.max(0.5, Number(value) || 1);
      return next;
    });
  }

  function addBand() {
    setBands((prev) => [...prev, { untilDay: 7, intervalHours: 1 }]);
  }

  function removeBand(i: number) {
    setBands((prev) => prev.filter((_, j) => j !== i));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/flocks/${flockId}/checkin-schedule`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          checkinBands: bands,
          photosRequiredPerRound: photosRequired,
          targetSlaughterDayMin: targetMin,
          targetSlaughterDayMax: targetMax,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Save failed");
      setStatus((data as { status: CheckinStatus }).status);
      showToast("success", "Schedule updated for this batch.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Check-in schedule (batch)"
        subtitle="Set how often laborers must complete photo check-ins by bird age. Target slaughter window is informational for the crew (default ~days 45–50)."
      />

      {pageLoading && <SkeletonList rows={4} />}

      {!pageLoading && error && !status && <ErrorState message={error} onRetry={() => void load()} />}

      {!pageLoading && !error && flockId == null ? (
        <EmptyState title="No flock on this farm yet" description="Add a flock to configure check-in bands." />
      ) : null}

      {!pageLoading && status && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">{status.label}</span> — placement {status.placementDate}, day{" "}
            {status.ageDays} today.
          </p>
          {/* FIX: same check-in urgency as flock list / detail */}
          <CheckinUrgencyBadge badge={status.checkinBadge} />
        </div>
      )}

      {!pageLoading && status && error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {!pageLoading && status ? (
      <form
        onSubmit={(e) => void handleSave(e)}
        className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Photos / round</label>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              value={photosRequired}
              onChange={(e) => setPhotosRequired(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Target harvest from (day)
            </label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              value={targetMin}
              onChange={(e) => setTargetMin(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Target harvest to (day)
            </label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              value={targetMax}
              onChange={(e) => setTargetMax(Number(e.target.value))}
            />
          </div>
        </div>

        <ul className="space-y-3 sm:hidden">
          {bands.map((b, i) => (
            <li key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
              <p className="font-medium text-neutral-800">Band {i + 1}</p>
              <label className="mt-2 block text-xs text-neutral-600">Until day (exclusive)</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                value={b.untilDay}
                onChange={(e) => updateBand(i, "untilDay", e.target.value)}
              />
              <p className="mt-1 text-xs text-neutral-500">e.g. before day 7 = chicks week 1</p>
              <label className="mt-2 block text-xs text-neutral-600">Hours between check-ins</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                value={b.intervalHours}
                onChange={(e) => updateBand(i, "intervalHours", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeBand(i)}
                className="mt-3 text-sm text-red-700 hover:underline"
              >
                Remove band
              </button>
            </li>
          ))}
        </ul>

        <div className="institutional-table-wrapper hidden overflow-x-auto sm:block">
          <table className="institutional-table text-sm">
            <thead>
              <tr>
                <th>Until day (exclusive)</th>
                <th>Hours between check-ins</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number"
                      min={1}
                      className="w-24 rounded border border-neutral-300 px-2 py-1"
                      value={b.untilDay}
                      onChange={(e) => updateBand(i, "untilDay", e.target.value)}
                    />
                    <span className="ml-2 text-neutral-500">e.g. before day 7 = chicks week 1</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="w-24 rounded border border-neutral-300 px-2 py-1"
                      value={b.intervalHours}
                      onChange={(e) => updateBand(i, "intervalHours", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeBand(i)}
                      className="text-sm text-red-700 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addBand}
          className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium"
        >
          Add band
        </button>

        <button
          type="submit"
          disabled={busy || !flockId}
          className="rounded-xl bg-emerald-800 px-6 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save schedule for batch"}
        </button>
      </form>
      ) : null}
    </div>
  );
}
