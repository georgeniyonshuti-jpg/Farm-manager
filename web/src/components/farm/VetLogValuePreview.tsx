import { useMemo } from "react";
import type { FcrBroilerSnapshot } from "../../api/farm.api";

type Props = {
  snap: FcrBroilerSnapshot | null;
  previewAvgWeightKg: number | null;
  sampleSize: number | null;
};

export function VetLogValuePreview({ snap, previewAvgWeightKg, sampleSize }: Props) {
  const liveCount = snap?.birdsLiveEstimate ?? 0;
  const currentAvg = snap?.currentTotalBiomassKg != null && liveCount > 0
    ? snap.currentTotalBiomassKg / liveCount
    : null;

  const previewTotalKg = useMemo(() => {
    if (!previewAvgWeightKg || previewAvgWeightKg <= 0 || liveCount <= 0) return null;
    return previewAvgWeightKg * liveCount;
  }, [previewAvgWeightKg, liveCount]);

  if (!snap) return null;

  return (
    <section className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
        Live bird value context
      </p>
      <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
        Weight samples update flock biomass used for IAS 41 carrying value in ERPNext after manager approval.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--text-muted)]">Live birds (est.)</dt>
          <dd className="font-mono font-semibold text-[var(--text-primary)]">{liveCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">Latest avg weight</dt>
          <dd className="font-mono font-semibold text-[var(--text-primary)]">
            {currentAvg != null ? `${currentAvg.toFixed(3)} kg` : "No weigh-in yet"}
          </dd>
        </div>
        {previewAvgWeightKg != null && previewAvgWeightKg > 0 ? (
          <>
            <div>
              <dt className="text-[var(--text-muted)]">Sample avg (this log)</dt>
              <dd className="font-mono font-semibold text-[var(--text-primary)]">
                {previewAvgWeightKg.toFixed(3)} kg
                {sampleSize ? ` · n=${sampleSize}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Projected flock biomass</dt>
              <dd className="font-mono font-semibold text-emerald-900 dark:text-emerald-300">
                {previewTotalKg != null ? `${previewTotalKg.toFixed(1)} kg` : "—"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {snap.fcrCumulative != null ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Cycle FCR: <span className="font-mono font-semibold">{Number(snap.fcrCumulative).toFixed(2)}</span>
          {snap.feedToDateKg > 0 ? ` · Feed to date ${snap.feedToDateKg.toFixed(0)} kg` : ""}
        </p>
      ) : null}
    </section>
  );
}
