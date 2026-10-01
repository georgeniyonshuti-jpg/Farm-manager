import { useCallback, useEffect, useMemo, useState } from "react";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { CountStepper } from "../field/CountStepper";
import { FieldMetricStrip } from "../field/FieldMetricStrip";
import { FieldSectionTitle } from "../field/FieldSectionTitle";
import { formatFieldDateTime } from "../../lib/formatFieldDateTime";
import { useLaborerT } from "../../i18n/laborerI18n";

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

function mortalitySourceLabel(
  source: string | null,
  labels: { reconciled: string; fieldLog: string }
): string | null {
  if (!source) return null;
  if (source === "vet_log_reconciliation") return labels.reconciled;
  if (source === "adhoc" || source === "emergency" || source === "linked" || source === "round_checkin") {
    return labels.fieldLog;
  }
  return source.replace(/_/g, " ");
}

export function VetLogMortalityReviewSection({ token, flockId, logDate, onChange }: Props) {
  const tTitle = useLaborerT("Mortality review since last visit");
  const tHintPrior = useLaborerT("Confirm deaths logged since the last vet visit. Live birds update automatically.");
  const tHintNoPrior = useLaborerT("No prior vet visit. Confirm deaths or enter missed mortality below.");
  const tErpNote = useLaborerT("Counts sync to ERPNext when you save.");
  const tDeathsSince = useLaborerT("Deaths since visit");
  const tMortToDate = useLaborerT("Mortality to date");
  const tLiveNow = useLaborerT("Live birds now");
  const tEventsHint = useLaborerT("Edit counts if field logs were wrong");
  const tRecordedBy = useLaborerT("Recorded by {name}");
  const tLogged = useLaborerT("Logged");
  const tConfirm = useLaborerT("Confirm count");
  const tNoEvents = useLaborerT("No mortality events since the last vet visit.");
  const tManualDeaths = useLaborerT("Deaths since last visit");
  const tManualHint = useLaborerT("Enter deaths missed by field logs. A reconciliation record is created when you save.");
  const tSourceReconciled = useLaborerT("Reconciled at vet visit");
  const tSourceField = useLaborerT("Field log");
  const tBirds = useLaborerT("birds");
  const tLoading = useLaborerT("Loading mortality since last visit…");
  const tRetry = useLaborerT("Retry");

  const [ctx, setCtx] = useState<MortalityReviewContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedCounts, setEditedCounts] = useState<Record<string, number>>({});
  const [noEventTotal, setNoEventTotal] = useState(0);

  const sourceLabels = useMemo(
    () => ({ reconciled: tSourceReconciled, fieldLog: tSourceField }),
    [tSourceReconciled, tSourceField]
  );

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
      const counts: Record<string, number> = {};
      for (const ev of review.events) counts[ev.id] = ev.count;
      setEditedCounts(counts);
      setNoEventTotal(0);
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
    if (ctx.events.length === 0) return Math.max(0, noEventTotal);
    let sum = 0;
    for (const ev of ctx.events) {
      const n = editedCounts[ev.id] ?? ev.count;
      sum += n >= 1 ? n : ev.count;
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
      const valid = Number.isFinite(noEventTotal) && noEventTotal >= 0;
      if (!valid) {
        onChange(null, false);
        return;
      }
      onChange(
        {
          loggedSinceLastVisit: ctx.loggedSinceLastVisit,
          confirmedSinceLastVisit: noEventTotal,
        },
        true
      );
      return;
    }

    const adjustments: { eventId: string; count: number }[] = [];
    for (const ev of ctx.events) {
      const n = editedCounts[ev.id] ?? ev.count;
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
        {tLoading}
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700">
        {error}
        <button type="button" className="ml-2 underline" onClick={() => void load()}>
          {tRetry}
        </button>
      </div>
    );
  }

  if (!ctx) return null;

  return (
    <div className="space-y-4">
      <FieldSectionTitle>{tTitle}</FieldSectionTitle>
      <p className="type-caption text-[var(--text-muted)]">
        {ctx.previousVetLogDate ? tHintPrior : tHintNoPrior}
      </p>

      <FieldMetricStrip
        metrics={[
          { label: tDeathsSince, value: deathsSinceVisit },
          { label: tMortToDate, value: derivedMortalityToDate },
          { label: tLiveNow, value: derivedLiveBirds },
        ]}
      />
      <p className="type-caption text-[var(--text-muted)]">{tErpNote}</p>

      {ctx.events.length > 0 ? (
        <div className="space-y-3">
          <p className="type-caption text-[var(--text-muted)]">
            {ctx.events.length} {tEventsHint}
          </p>
          <ul className="space-y-3">
            {ctx.events.map((ev) => {
              const confirmed = editedCounts[ev.id] ?? ev.count;
              const changed = confirmed !== ev.count;
              const sourceLabel = mortalitySourceLabel(ev.source, sourceLabels);
              return (
                <li
                  key={ev.id}
                  className={[
                    "rounded-xl border bg-[var(--surface-card)] p-4 space-y-3",
                    changed ? "border-amber-500/50" : "border-[var(--border-color)]",
                  ].join(" ")}
                >
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {ev.count} {tBirds} · {formatFieldDateTime(ev.at)}
                    </p>
                    {ev.laborerName ? (
                      <p className="mt-0.5 type-caption text-[var(--text-muted)]">
                        {tRecordedBy.replace("{name}", ev.laborerName)}
                      </p>
                    ) : null}
                    {sourceLabel ? (
                      <p className="type-caption text-[var(--text-muted)]">{sourceLabel}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <p className="type-label text-[var(--text-secondary)]">
                      {tLogged}: <span className="font-mono-data">{ev.count}</span>
                    </p>
                    <div className="min-w-0 flex-1">
                      <CountStepper
                        label={tConfirm}
                        value={confirmed}
                        min={1}
                        onChange={(n) =>
                          setEditedCounts((prev) => ({ ...prev, [ev.id]: n }))
                        }
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-4 space-y-3">
          <p className="text-sm text-[var(--text-muted)]">{tNoEvents}</p>
          <CountStepper
            label={tManualDeaths}
            value={noEventTotal}
            min={0}
            onChange={setNoEventTotal}
          />
          <p className="type-caption text-[var(--text-muted)]">{tManualHint}</p>
        </div>
      )}
    </div>
  );
}
