import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { fetchFlockFcrSnapshot, type FcrBroilerSnapshot } from "../../api/farm.api";
import { ErrorState, SkeletonList } from "../LoadingSkeleton";
import { FlockContextStrip } from "./FlockContextStrip";

function statusBadgeClass(status: string) {
  if (status === "on_track") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-400";
  if (status === "watch") return "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300";
  if (status === "warning") return "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-400";
  return "bg-neutral-100 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300";
}

type Props = {
  flockId: string;
  flockLabel?: string | null;
  flockCode?: string | null;
  placementDate?: string | null;
};

export function FlockPerformancePanel({ flockId, flockLabel, flockCode, placementDate }: Props) {
  const { token } = useAuth();
  const [snap, setSnap] = useState<FcrBroilerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!flockId || !token) return;
    setError(null);
    setLoading(true);
    try {
      const sd = await fetchFlockFcrSnapshot(token, flockId);
      setSnap(sd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [flockId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!flockId) return null;
  if (loading) return <SkeletonList rows={2} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!snap) return null;

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Flock performance</p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Cumulative FCR · kg feed ÷ kg flock weight gained (lower is better)
          </p>
        </div>
        <span className={["rounded px-2 py-0.5 text-xs font-semibold capitalize", statusBadgeClass(snap.status)].join(" ")}>
          {snap.status.replace(/_/g, " ")}
        </span>
      </div>

      <FlockContextStrip
        label={flockLabel ?? "Flock"}
        code={flockCode}
        placementDate={placementDate ?? ""}
        ageDays={snap.ageDays}
        feedToDateKg={snap.feedToDateKg}
        footer={
          <div className="flex flex-wrap gap-3">
            <Link to="/farm/feed" className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 dark:text-emerald-400">
              Log feed
            </Link>
            <Link to="/farm/checkin" className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 dark:text-emerald-400">
              Round check-in
            </Link>
            <Link to={`/farm/flocks/${encodeURIComponent(flockId)}#weigh-in`} className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 dark:text-emerald-400">
              Record weigh-in
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Current FCR</p>
          <p className="font-mono-data mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {snap.fcrCumulative != null ? snap.fcrCumulative.toFixed(2) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Target band</p>
          <p className="font-mono-data mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {snap.fcrTargetMin.toFixed(2)}–{snap.fcrTargetMax.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Days in cycle</p>
          <p className="font-mono-data mt-1 text-lg font-semibold text-[var(--text-primary)]">{snap.ageDays}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
          <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Live birds (est.)</p>
          <p className="font-mono-data mt-1 text-lg font-semibold text-[var(--text-primary)]">{snap.birdsLiveEstimate}</p>
        </div>
      </div>

      {snap.reason === "no_weigh_in" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Add a weigh-in on the flock page to estimate live biomass; cumulative FCR needs average bird weight × headcount.
        </p>
      ) : null}

      {snap.playbook.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">If FCR is high — check</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {snap.playbook.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
