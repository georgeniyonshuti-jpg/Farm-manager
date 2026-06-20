import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import {
  fetchFeedEntries,
  createFeedEntry,
  fetchPendingFeed,
  reviewFeedEntry,
  IS_FRAPPE_MODE,
} from "../../api/farm.api";
import { API_BASE_URL } from "../../api/config";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";
import { useFlockFieldContext } from "../../hooks/useFlockFieldContext";
import { SubmissionStageScreen } from "../../components/farm/SubmissionStageScreen";
import { canReviewFeedEntry } from "../../auth/permissions";
import { useLaborerT, TranslatedText } from "../../i18n/laborerI18n";

type FeedEntry = {
  id: string;
  recordedAt: string;
  feedKg: number;
  feedType?: string | null;
  notes?: string;
  submissionStatus?: string;
};

type StockRow = {
  feedType: string | null;
  balanceKg: number;
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

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "approved") return null;
  const cls =
    status === "pending_review"
      ? "border border-amber-500/25 bg-amber-500/12 text-amber-300"
      : "border border-red-500/25 bg-red-500/12 text-red-300";
  const label = status === "pending_review" ? "Pending review" : "Rejected";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      <TranslatedText text={label} />
    </span>
  );
}

export function FarmFeedPage() {
  const { token, user } = useAuth();
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
  const [pendingEntries, setPendingEntries] = useState<PendingFeedEntry[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [feedKg, setFeedKg] = useState("");
  const [feedType, setFeedType] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [submitStage, setSubmitStage] = useState<"idle" | "submitting" | "success">("idle");
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [showFeedForm, setShowFeedForm] = useState(false);
  const [feedFieldErrors, setFeedFieldErrors] = useState<Record<string, string>>({});
  const flockSelectRef = useRef<HTMLSelectElement>(null);
  const feedKgInputRef = useRef<HTMLInputElement>(null);

  const availableStock = useMemo(
    () => stockRows.filter((r) => r.feedType && r.balanceKg > 0),
    [stockRows]
  );

  const selectedStock = useMemo(
    () => availableStock.find((r) => r.feedType === feedType) ?? null,
    [availableStock, feedType]
  );

  const canReview = canReviewFeedEntry(user);

  const loadStock = useCallback(async () => {
    if (!token || IS_FRAPPE_MODE) {
      setStockRows([]);
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/api/inventory/stock-summary`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStockRows([]);
        return;
      }
      const rows = (d as { summary?: StockRow[] }).summary ?? [];
      setStockRows(rows);
    } catch {
      setStockRows([]);
    }
  }, [token]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedFieldErrors({});
    const errs: Record<string, string> = {};
    if (!flockId) errs.flockId = "Flock is required.";
    if (!feedType) errs.feedType = "Select feed type from available stock.";
    const kg = Number(feedKg);
    if (!String(feedKg).trim() || !Number.isFinite(kg) || kg <= 0) {
      errs.feedKg = "Enter feed weight in kg (greater than zero).";
    } else if (selectedStock && kg > selectedStock.balanceKg) {
      errs.feedKg = `Only ${selectedStock.balanceKg.toFixed(2)} kg available for ${feedTypeLabel(feedType)}.`;
    }
    if (availableStock.length === 0) {
      errs.feedType = "No feed in stock. Receive stock on the Inventory page first.";
    }
    if (Object.keys(errs).length) {
      setFeedFieldErrors(errs);
      if (errs.flockId) flockSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else feedKgInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      showToast("success", "Feed logged.");
      setFeedKg("");
      setNotes("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("farm:ops-updated"));
        window.dispatchEvent(new CustomEvent("farm:checkin-submitted"));
      }
      void loadDetails();
      await loadFeedEntries();
      await loadStock();
      await loadPending();
      setShowFeedForm(false);
      setSubmitStage("success");
      window.setTimeout(() => setSubmitStage("idle"), 1200);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
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
      showToast("success", action === "approve" ? "Feed log approved." : "Feed log rejected.");
      await loadFeedEntries();
      await loadPending();
      await loadStock();
      void loadDetails();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewBusyId(null);
    }
  }

  const selected = flocks.find((f) => f.id === flockId);
  const loading = listLoading;
  const noStock = availableStock.length === 0;

  const tTitle = useLaborerT("Feed request / log");
  const tSubtitle = useLaborerT(
    "Log feed from farm stock only. Lower roles require manager approval before stock is deducted."
  );
  const tHome = useLaborerT("Home");
  const tFlock = useLaborerT("Flock");
  const tLoadingCtx = useLaborerT("Loading flock context\u2026");
  const tNoFlocks = useLaborerT("No active flocks. Create a flock to start logging feed.");
  const tFeedStock = useLaborerT("Available stock:");
  const tCouldNotLoad = useLaborerT("Could not load recent entries.");
  const tRetry = useLaborerT("Retry");
  const tRecentEntries = useLaborerT("Recent feed entries");
  const tNoEntries = useLaborerT("No feed entries yet for this flock.");
  const tClose = useLaborerT("Close");
  const tLogNew = useLaborerT("Log new feed");
  const tFeedKg = useLaborerT("Feed delivered (kg)");
  const tFeedType = useLaborerT("Feed type (from stock)");
  const tNotesOpt = useLaborerT("Notes (optional)");
  const tSaving = useLaborerT("Saving\u2026");
  const tSaveEntry = useLaborerT("Save feed entry");
  const tRoundCheckin = useLaborerT("Round check-in");
  const tStillCaptures = useLaborerT("still captures photos, water, and mortality with each round.");

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
        title={tTitle}
        subtitle={tSubtitle}
        action={
          <Link
            to="/dashboard/laborer"
            className="text-sm font-medium text-[var(--primary-color-dark)] hover:underline"
          >
            {tHome}
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
            void loadStock();
          }}
        />
      )}

      {!loading && !ctxError ? (
        <>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {tFlock}
            <span className="text-red-500"> *</span>
            <select
              ref={flockSelectRef}
              className={[
                "mt-1 w-full min-h-[48px] rounded-xl border bg-[var(--surface-input)] px-3 text-base text-[var(--text-primary)]",
                feedFieldErrors.flockId ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
              ].join(" ")}
              value={flockId}
              onChange={(e) => {
                setFlockId(e.target.value);
                setFeedFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.flockId;
                  return next;
                });
              }}
            >
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            {feedFieldErrors.flockId ? <p className="mt-1 text-xs text-red-500">{feedFieldErrors.flockId}</p> : null}
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
            <p className="text-sm text-[var(--text-muted)]">{tLoadingCtx}</p>
          ) : !flockId ? (
            <p className="text-sm text-amber-400">{tNoFlocks}</p>
          ) : null}

          {noStock ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <TranslatedText text="No feed in stock. Receive stock on the Inventory page before logging feed." />
            </div>
          ) : selectedStock ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
              <span className="font-semibold text-emerald-400">{tFeedStock}</span>
              <span className="font-mono tabular-nums text-emerald-300">{selectedStock.balanceKg.toFixed(2)} kg</span>
              <span className="ml-auto text-[10px] font-medium text-emerald-400/80">
                {feedTypeLabel(feedType)}
              </span>
            </div>
          ) : null}

          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs text-sky-300">
            <TranslatedText text="Stock is deducted when the log is approved (or immediately for vet manager and above)." />
          </div>

          {canReview && pendingEntries.length > 0 ? (
            <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
              <p className="mb-2 font-semibold text-amber-300">
                <TranslatedText text="Pending feed logs" /> ({pendingEntries.length})
              </p>
              <ul className="space-y-2">
                {pendingEntries.map((pe) => (
                  <li
                    key={pe.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-[var(--surface-card)] px-3 py-2"
                  >
                    <div>
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {feedTypeLabel(pe.feedType)} · {pe.feedKg} kg
                      </span>
                      {pe.enteredByName ? (
                        <span className="ml-2 text-xs text-[var(--text-muted)]">by {pe.enteredByName}</span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={reviewBusyId === pe.id}
                        onClick={() => void handleReview(pe.id, "approve")}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === pe.id}
                        onClick={() => void handleReview(pe.id, "reject")}
                        className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-300 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {entriesError ? (
            <p className="text-sm text-amber-400" role="status">
              {tCouldNotLoad}{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void loadFeedEntries()}
              >
                {tRetry}
              </button>
            </p>
          ) : null}

          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-sm shadow-[var(--shadow-sm)]">
            <p className="mb-2 font-semibold text-[var(--text-primary)]">{tRecentEntries}</p>
            {entries.length > 0 ? (
              <ul className="space-y-2">
                {entries.map((en) => (
                  <li
                    key={en.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-[var(--border-color)] pb-2 last:border-0"
                  >
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {new Date(en.recordedAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">{feedTypeLabel(en.feedType)}</span>
                      <span className="font-semibold tabular-nums text-emerald-400">{en.feedKg} kg</span>
                      <StatusBadge status={en.submissionStatus} />
                    </span>
                    {en.notes ? <span className="w-full text-xs text-[var(--text-muted)]">{en.notes}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{tNoEntries}</p>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={noStock}
              onClick={() => setShowFeedForm((v) => !v)}
              className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50"
            >
              {showFeedForm ? tClose : tLogNew}
            </button>
          </div>

          {showFeedForm ? (
            <form
              onSubmit={(ev) => void submit(ev)}
              className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]"
            >
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tFeedType}
                <span className="text-red-500"> *</span>
                <select
                  className={[
                    "mt-1 w-full min-h-[52px] rounded-xl border bg-[var(--surface-input)] px-4 text-base text-[var(--text-primary)]",
                    feedFieldErrors.feedType ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
                  ].join(" ")}
                  value={feedType}
                  onChange={(e) => {
                    setFeedType(e.target.value);
                    setFeedFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.feedType;
                      return next;
                    });
                  }}
                >
                  {availableStock.map((r) => (
                    <option key={r.feedType ?? ""} value={r.feedType ?? ""}>
                      {feedTypeLabel(r.feedType)} ({r.balanceKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
                {feedFieldErrors.feedType ? (
                  <p className="mt-1 text-xs text-red-500">{feedFieldErrors.feedType}</p>
                ) : null}
              </label>
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tFeedKg}
                <span className="text-red-500"> *</span>
                <input
                  ref={feedKgInputRef}
                  inputMode="decimal"
                  className={[
                    "mt-1 w-full min-h-[52px] rounded-xl border bg-[var(--surface-input)] px-4 text-lg text-[var(--text-primary)]",
                    feedFieldErrors.feedKg ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
                  ].join(" ")}
                  value={feedKg}
                  onChange={(e) => {
                    setFeedKg(e.target.value);
                    setFeedFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.feedKg;
                      return next;
                    });
                  }}
                  placeholder="0"
                />
                {feedFieldErrors.feedKg ? <p className="mt-1 text-xs text-red-500">{feedFieldErrors.feedKg}</p> : null}
              </label>
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                {tNotesOpt}
                <textarea
                  className="mt-1 w-full rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !flockId || !status || noStock || !feedType}
                className="w-full rounded-xl bg-[var(--primary-color)] py-3 text-lg font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50"
              >
                {busy ? tSaving : tSaveEntry}
              </button>
            </form>
          ) : null}

          <p className="text-xs text-[var(--text-muted)]">
            <Link className="font-medium text-[var(--primary-color-dark)] underline" to="/farm/checkin">
              {tRoundCheckin}
            </Link>{" "}
            {tStillCaptures}
          </p>
        </>
      ) : null}
    </div>
  );
}
