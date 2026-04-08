import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import type { CheckinStatus } from "./FarmCheckinPage";

type Flock = {
  id: string;
  label: string;
  code?: string | null;
  placementDate?: string;
  initialCount?: number;
};

type FeedEntry = {
  id: string;
  recordedAt: string;
  feedKg: number;
  notes?: string;
};

export function FarmFeedPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [flockId, setFlockId] = useState("");
  const [strip, setStrip] = useState<CheckinStatus | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [feedToDateKg, setFeedToDateKg] = useState<number | null>(null);
  const [feedKg, setFeedKg] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFlocks = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to load flocks");
      const list = (d.flocks as Flock[]) ?? [];
      setFlocks(list);
      setFlockId((prev) => (prev && list.some((f) => f.id === prev) ? prev : list[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadContext = useCallback(async () => {
    if (!flockId || !token) {
      setStrip(null);
      setEntries([]);
      setFeedToDateKg(null);
      return;
    }
    try {
      const [sr, er] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/checkin-status`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/feed-entries?limit=25`, {
          headers: readAuthHeaders(token),
        }),
      ]);
      const sd = await sr.json();
      const ed = await er.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error ?? "Status failed");
      if (!er.ok) throw new Error((ed as { error?: string }).error ?? "Entries failed");
      setStrip(sd as CheckinStatus);
      setEntries(((ed as { entries?: FeedEntry[] }).entries) ?? []);
      const td = (ed as { feedToDateKg?: number }).feedToDateKg;
      setFeedToDateKg(typeof td === "number" ? td : null);
    } catch {
      setStrip(null);
      setEntries([]);
      setFeedToDateKg(null);
    }
  }, [flockId, token]);

  useEffect(() => {
    void loadFlocks();
  }, [loadFlocks]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    const kg = Number(feedKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      showToast("error", "Enter feed weight in kg (greater than zero).");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/feed-entries`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedKg: kg,
          notes: notes.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      const td = (d as { feedToDateKg?: number }).feedToDateKg;
      if (typeof td === "number") setFeedToDateKg(td);
      showToast("success", "Feed logged.");
      setFeedKg("");
      setNotes("");
      await loadContext();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = flocks.find((f) => f.id === flockId);

  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <PageHeader
        title="Feed log"
        subtitle="Record feed delivered without a photo round check-in. Totals count toward cycle FCR with round check-ins."
        action={
          <Link
            to="/dashboard/laborer"
            className="text-sm font-medium text-emerald-800 hover:underline"
          >
            Home
          </Link>
        }
      />

      {loading && <SkeletonList rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void loadFlocks()} />}

      {!loading && !error ? (
        <>
          <label className="block text-sm font-medium text-neutral-700">
            Flock
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

          {strip ? (
            <FlockContextStrip
              label={strip.label}
              code={selected?.code}
              placementDate={strip.placementDate}
              ageDays={strip.ageDays}
              feedToDateKg={feedToDateKg ?? strip.feedToDateKg}
            />
          ) : flockId ? (
            <p className="text-sm text-neutral-500">Loading flock context…</p>
          ) : (
            <p className="text-sm text-amber-800">No active flocks. Create a flock to start logging feed.</p>
          )}

          <form
            onSubmit={(ev) => void submit(ev)}
            className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <label className="block text-sm font-medium text-neutral-700">
              Feed delivered (kg)
              <input
                inputMode="decimal"
                className="mt-1 w-full min-h-[52px] rounded-xl border border-neutral-300 px-4 text-lg"
                value={feedKg}
                onChange={(e) => setFeedKg(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Notes (optional)
              <textarea
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !flockId}
              className="w-full rounded-xl bg-emerald-700 py-3 text-lg font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save feed entry"}
            </button>
          </form>

          {entries.length > 0 ? (
            <section className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Recent feed entries</p>
              <ul className="space-y-2">
                {entries.map((en) => (
                  <li
                    key={en.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 pb-2 last:border-0"
                  >
                    <span className="font-mono text-xs text-neutral-600">
                      {new Date(en.recordedAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-900">{en.feedKg} kg</span>
                    {en.notes ? <span className="w-full text-xs text-neutral-600">{en.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-xs text-neutral-500">
            <Link className="font-medium text-emerald-800 underline" to="/farm/checkin">
              Round check-in
            </Link>{" "}
            still captures photos, water, and mortality with each round.
          </p>
        </>
      ) : null}
    </div>
  );
}
