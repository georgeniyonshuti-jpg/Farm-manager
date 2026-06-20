import { useCallback, useEffect, useMemo, useState } from "react";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

export type MortalityReviewEvent = {
  id: string;
  at: string;
  count: number;
  laborerName: string | null;
  source: string | null;
  notes: string | null;
};

export type MortalityReviewContext = {
  previousVetLogId: string | null;
  previousVetLogDate: string | null;
  sinceAt: string | null;
  events: MortalityReviewEvent[];
  loggedSinceLastVisit: number;
  initialCount: number;
  slaughterToDate: number;
  mortalityToDate: number;
  computedBirdsLive: number;
};

export type MortalityReviewPayload = {
  loggedSinceLastVisit: number;
  mortalityAdjustments?: { eventId: string; count: number }[];
  confirmedSinceLastVisit?: number;
};

type Props = {
  token: string;
  flockId: string;
  logDate: string;
  onChange: (payload: MortalityReviewPayload | null, valid: boolean) => void;
};

export function VetLogMortalityReviewSection({ token, flockId, logDate, onChange }: Props) {
  const [ctx, setCtx] = useState<MortalityReviewContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedCounts, setEditedCounts] = useState<Record<string, string>>({});
  const [noEventTotal, setNoEventTotal] = useState("0");

  const load = useCallback(async () => {
    if (!token || !flockId) return;
    setLoading(true);
    setError(null);
    try {
      const q = logDate ? `?beforeDate=${encodeURIComponent(logDate)}` : "";
      const r = await fetch(
        `${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/vet-log-mortality-review${q}`,
        { headers: readAuthHeaders(token) }
      );
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      const review = (d as { review: MortalityReviewContext }).review;
      setCtx(review);
      const counts: Record<string, string> = {};
      for (const ev of review.events) counts[ev.id] = String(ev.count);
      setEditedCounts(counts);
      setNoEventTotal("0");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [token, flockId, logDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const deathsSinceVisit = useMemo(() => {
    if (!ctx) return 0;
    if (ctx.events.length === 0) {
      const n = Math.floor(Number(noEventTotal));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    let sum = 0;
    for (const ev of ctx.events) {
      const raw = editedCounts[ev.id] ?? String(ev.count);
      const n = Math.floor(Number(raw));
      sum += Number.isFinite(n) && n >= 1 ? n : ev.count;
    }
    return sum;
  }, [ctx, editedCounts, noEventTotal]);

  const mortalityDelta = useMemo(() => {
    if (!ctx) return 0;
    return deathsSinceVisit - ctx.loggedSinceLastVisit;
  }, [ctx, deathsSinceVisit]);

  const derivedMortalityToDate = useMemo(() => {
    if (!ctx) return 0;
    return Math.max(0, ctx.mortalityToDate + mortalityDelta);
  }, [ctx, mortalityDelta]);

  const derivedLiveBirds = useMemo(() => {
    if (!ctx) return 0;
    return Math.max(0, ctx.initialCount - derivedMortalityToDate - ctx.slaughterToDate);
  }, [ctx, derivedMortalityToDate]);

  useEffect(() => {
    if (!ctx) {
      onChange(null, false);
      return;
    }

    if (ctx.events.length === 0) {
      const total = Math.floor(Number(noEventTotal));
      const valid = Number.isFinite(total) && total >= 0;
      if (!valid) {
        onChange(null, false);
        return;
      }
      onChange(
        {
          loggedSinceLastVisit: ctx.loggedSinceLastVisit,
          confirmedSinceLastVisit: total,
        },
        true
      );
      return;
    }

    const adjustments: { eventId: string; count: number }[] = [];
    for (const ev of ctx.events) {
      const raw = editedCounts[ev.id] ?? String(ev.count);
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n) || n < 1) {
        onChange(null, false);
        return;
      }
      if (n !== ev.count) {
        adjustments.push({ eventId: ev.id, count: n });
      }
    }
    onChange(
      {
        loggedSinceLastVisit: ctx.loggedSinceLastVisit,
        mortalityAdjustments: adjustments.length ? adjustments : undefined,
      },
      true
    );
  }, [ctx, editedCounts, noEventTotal, onChange]);

  if (loading) {
    return (
      <p className="text-sm text-[var(--text-muted)] animate-pulse rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4">
        Loading mortality since last visit…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700">
        {error}
        <button type="button" className="ml-2 underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!ctx) return null;

  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">
        Mortality review since last visit
      </legend>
      <p className="text-xs text-[var(--text-muted)]">
        {ctx.previousVetLogDate
          ? `Last approved vet log: ${ctx.previousVetLogDate}. Correct deaths logged since then — live birds are calculated automatically and sync to ERPNext.`
          : "No prior approved vet log. Confirm deaths logged for this flock or enter missed mortality below."}
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Deaths since visit
          </p>
          <p className="font-mono-data text-lg font-semibold text-[var(--text-primary)]">{deathsSinceVisit}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Mortality to date
          </p>
          <p className="font-mono-data text-lg font-semibold text-[var(--text-primary)]">{derivedMortalityToDate}</p>
        </div>
        <div className="rounded-lg border border-[var(--primary-color)]/30 bg-[var(--primary-color-soft)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Live birds now
          </p>
          <p className="font-mono-data text-lg font-semibold text-[var(--text-primary)]">{derivedLiveBirds}</p>
        </div>
      </div>

      {ctx.events.length > 0 ? (
        <div className="table-block">
          <div className="table-toolbar">
            <span className="text-xs text-[var(--text-muted)]">
              {ctx.events.length} mortality event(s) — edit counts if field logs were wrong
            </span>
          </div>
          <div className="institutional-table-wrapper">
            <table className="institutional-table min-w-[40rem]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Recorded by</th>
                  <th>Source</th>
                  <th className="tbl-num">Logged</th>
                  <th className="tbl-num">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {ctx.events.map((ev) => {
                  const edited = editedCounts[ev.id] ?? String(ev.count);
                  const changed = Math.floor(Number(edited)) !== ev.count;
                  return (
                    <tr key={ev.id}>
                      <td className="tbl-mono whitespace-nowrap text-xs">
                        {new Date(ev.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                      </td>
                      <td className="text-xs">{ev.laborerName ?? "—"}</td>
                      <td className="text-xs">{ev.source ?? "—"}</td>
                      <td className="tbl-num">{ev.count}</td>
                      <td className="tbl-num">
                        <input
                          type="number"
                          min={1}
                          className={[
                            "w-20 rounded border px-1.5 py-0.5 text-right font-mono-data text-xs",
                            changed ? "border-amber-500 bg-amber-50" : "border-[var(--border-input)]",
                          ].join(" ")}
                          value={edited}
                          onChange={(e) =>
                            setEditedCounts((prev) => ({ ...prev, [ev.id]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
          <p className="mb-2 text-sm text-[var(--text-muted)]">
            No approved mortality events since the last vet visit.
          </p>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Deaths since last visit
            <input
              type="number"
              min={0}
              className="mt-1 block w-32 rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-1.5 font-mono-data text-sm"
              value={noEventTotal}
              onChange={(e) => setNoEventTotal(e.target.value)}
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Enter deaths missed by field logs. A reconciliation mortality record is created when you save.
          </p>
        </div>
      )}
    </fieldset>
  );
}
