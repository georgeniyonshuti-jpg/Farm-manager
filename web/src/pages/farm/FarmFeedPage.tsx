import { useCallback, useEffect, useRef, useState } from "react";
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
import { useLaborerT, TranslatedText } from "../../i18n/laborerI18n";

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
      ? "border border-amber-500/25 bg-amber-500/12 text-amber-300"
      : "border border-red-500/25 bg-red-500/12 text-red-300";
  const label = status === "pending_review" ? "Pending review" : "Rejected";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}><TranslatedText text={label} /></span>;
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
  const [showFeedForm, setShowFeedForm] = useState(false);
  const [feedFieldErrors, setFeedFieldErrors] = useState<Record<string, string>>({});
  const flockSelectRef = useRef<HTMLSelectElement>(null);
  const feedKgInputRef = useRef<HTMLInputElement>(null);
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
        // Farm-wide balance for the selected feed type
        fetch(
          `${API_BASE_URL}/api/inventory/stock-summary${feedType ? `?feed_type=${encodeURIComponent(feedType)}` : ""}`,
          { headers: readAuthHeaders(token) }
        ),
      ]);
      const ed = await er.json();
      if (!er.ok) throw new Error((ed as { error?: string }).error ?? "Entries failed");
      setEntries(((ed as { entries?: FeedEntry[] }).entries) ?? []);
      setEntriesError(null);
      try {
        const bd = await br.json();
        const rows = (bd as { summary?: Array<{ feedType: string | null; balanceKg: number }> }).summary ?? [];
        const matchedRow = feedType
          ? rows.find((r) => r.feedType === feedType)
          : rows.reduce(
              (acc, r) => ({ feedType: null, balanceKg: acc.balanceKg + r.balanceKg }),
              { feedType: null, balanceKg: 0 }
            );
        setInventoryBalanceKg(matchedRow?.balanceKg ?? null);
      } catch {
        setInventoryBalanceKg(null);
      }
    } catch (e) {
      setEntries([]);
      setEntriesError(e instanceof Error ? e.message : "Entries failed");
    }
  }, [flockId, token, feedType]);

  useEffect(() => {
    void loadFeedEntries();
  }, [loadFeedEntries]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedFieldErrors({});
    const errs: Record<string, string> = {};
    if (!flockId) errs.flockId = "Flock is required.";
    const kg = Number(feedKg);
    if (!String(feedKg).trim() || !Number.isFinite(kg) || kg <= 0) {
      errs.feedKg = "Enter feed weight in kg (greater than zero).";
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

  const selected = flocks.find((f) => f.id === flockId);
  const loading = listLoading;

  const tTitle = useLaborerT("Feed request / log");
  const tSubtitle = useLaborerT("Record feed delivered. Lower roles require manager approval. Totals count toward cycle FCR with round check-ins.");
  const tHome = useLaborerT("Home");
  const tFlock = useLaborerT("Flock");
  const tLoadingCtx = useLaborerT("Loading flock context\u2026");
  const tNoFlocks = useLaborerT("No active flocks. Create a flock to start logging feed.");
  const tFeedStock = useLaborerT("Feed stock:");
  const tCouldNotLoad = useLaborerT("Could not load recent entries.");
  const tRetry = useLaborerT("Retry");
  const tRecentEntries = useLaborerT("Recent feed entries");
  const tNoEntries = useLaborerT("No feed entries yet for this flock.");
  const tClose = useLaborerT("Close");
  const tLogNew = useLaborerT("Log new feed");
  const tFeedKg = useLaborerT("Feed delivered (kg)");
  const tFeedType = useLaborerT("Feed type");
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

          {inventoryBalanceKg != null ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
              <span className="font-semibold text-emerald-400">{tFeedStock}</span>
              <span className="font-mono tabular-nums text-emerald-300">{inventoryBalanceKg.toFixed(2)} kg</span>
              <span className="ml-auto text-[10px] font-medium text-emerald-400/80">
                {feedType ? feedTypeOptions.find((o) => o.value === feedType)?.label ?? feedType : "all types"}
              </span>
            </div>
          ) : null}

          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs text-sky-300">
            <TranslatedText text="Stock is deducted automatically when your feed log is approved by a manager." />
          </div>

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
              onClick={() => setShowFeedForm((v) => !v)}
              className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)]"
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
                {tFeedType}
                <select
                  className="mt-1 w-full min-h-[52px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-4 text-base text-[var(--text-primary)]"
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
                disabled={busy || !flockId || !status}
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
