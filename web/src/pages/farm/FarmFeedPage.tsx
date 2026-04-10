import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";

type FeedEntry = {
  id: string;
  recordedAt: string;
  feedKg: number;
  notes?: string;
  submissionStatus?: string;
};

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "approved") return null;
  const cls =
    status === "pending_review"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";
  const label = status === "pending_review" ? "Pending review" : "Rejected";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{label}</span>;
}

export function FarmFeedPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
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
  const [feedKg, setFeedKg] = useState("");
  const [feedType, setFeedType] = useState("starter");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [inventoryBalanceKg, setInventoryBalanceKg] = useState<number | null>(null);
  const feedTypeOptions = useReferenceOptions("feed_type", token, [
    { value: "starter", label: "Starter" },
    { value: "grower", label: "Grower" },
    { value: "finisher", label: "Finisher" },
    { value: "supplement", label: "Supplement" },
  ]);

  const loadFeedEntries = useCallback(async () => {
    if (!flockId || !token) {
      setEntries([]);
      setEntriesError(null);
      setInventoryBalanceKg(null);
      return;
    }
    try {
      const [er, br] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/feed-entries?limit=25`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/inventory/balance?flock_id=${encodeURIComponent(flockId)}`, { headers: readAuthHeaders(token) }),
      ]);
      const ed = await er.json();
      if (!er.ok) throw new Error((ed as { error?: string }).error ?? "Entries failed");
      setEntries(((ed as { entries?: FeedEntry[] }).entries) ?? []);
      setEntriesError(null);
      try {
        const bd = await br.json();
        const bal = ((bd as { balances?: Array<{ balanceKg: number }> }).balances ?? [])[0]?.balanceKg;
        setInventoryBalanceKg(typeof bal === "number" ? bal : null);
      } catch {
        setInventoryBalanceKg(null);
      }
    } catch (e) {
      setEntries([]);
      setEntriesError(e instanceof Error ? e.message : "Entries failed");
    }
  }, [flockId, token]);

  useEffect(() => {
    void loadFeedEntries();
  }, [loadFeedEntries]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!flockId) return;
    const kg = Number(feedKg);
    if (!Number.isFinite(kg) || kg <= 0) {
      showToast("error", "Enter feed weight in kg (greater than zero).");
      return;
    }
    setBusy(true);
    setSubmitStage("submitting");
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/feed-entries`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          feedKg: kg,
          notes: [`feed_type:${feedType}`, notes.trim()].filter(Boolean).join(" | "),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      showToast("success", "Feed logged.");
      setFeedKg("");
      setFeedType((feedTypeOptions[0]?.value ?? "starter"));
      setNotes("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:ops-updated"));
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted"));
      }
      void loadDetails();
      await loadFeedEntries();
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
      setSubmitStage("idle");
    } finally {
      setBusy(false);
    }
  }

  const selected = flocks.find((f) => f.id === flockId);
  const loading = listLoading;

  if (submitStage === "submitting" || submitStage === "success") {
    return (
      <SubmissionStageScreen
        stage={submitStage === "submitting" ? "submitting" : "success"}
        successText="Feed log submitted successfully."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <PageHeader
        title="Feed request / log"
        subtitle="Record feed delivered. Lower roles require manager approval. Totals count toward cycle FCR with round check-ins."
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
      {!loading && ctxError && (
        <ErrorState
          message={ctxError}
          onRetry={() => {
            void loadFlocks();
            void loadDetails();
            void loadFeedEntries();
          }}
        />
      )}

      {!loading && !ctxError ? (
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

          {status ? (
            <FlockContextStrip
              label={status.label}
              code={selected?.code}
              placementDate={status.placementDate}
              ageDays={status.ageDays}
              feedToDateKg={status.feedToDateKg}
              initialCount={selected?.initialCount}
              birdsLiveEstimate={performance?.birdsLiveEstimate}
              verifiedLiveCount={performance?.verifiedLiveCount}
              mortalityToDate={performance?.mortalityToDate}
            />
          ) : flockId && detailLoading ? (
            <p className="text-sm text-neutral-500">Loading flock context…</p>
          ) : !flockId ? (
            <p className="text-sm text-amber-800">No active flocks. Create a flock to start logging feed.</p>
          ) : null}

          {inventoryBalanceKg != null ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <span className="font-semibold text-emerald-900">Feed stock:</span>
              <span className="font-mono tabular-nums text-emerald-800">{inventoryBalanceKg.toFixed(2)} kg</span>
            </div>
          ) : null}

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
              Feed type
              <select
                className="mt-1 w-full min-h-[52px] rounded-xl border border-neutral-300 px-4 text-base"
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
              disabled={busy || !flockId || !status}
              className="w-full rounded-xl bg-emerald-700 py-3 text-lg font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save feed entry"}
            </button>
          </form>

          {entriesError ? (
            <p className="text-sm text-amber-800" role="status">
              Could not load recent entries.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void loadFeedEntries()}
              >
                Retry
              </button>
            </p>
          ) : null}

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
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-emerald-900">{en.feedKg} kg</span>
                      <StatusBadge status={en.submissionStatus} />
                    </span>
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
