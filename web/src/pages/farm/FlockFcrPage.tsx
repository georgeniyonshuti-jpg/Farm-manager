import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { FlockContextStrip } from "../../components/farm/FlockContextStrip";

export type FcrBroilerSnapshot = {
  fcrCumulative: number | null;
  reason: string | null;
  fcrTargetMin: number;
  fcrTargetMax: number;
  ageDays: number;
  feedToDateKg: number;
  weightGainedKg: number | null;
  initialTotalWeightKg: number;
  currentTotalBiomassKg: number | null;
  birdsLiveEstimate: number;
  latestWeighDate: string | null;
  status: string;
  playbook: string[];
};

function statusBadgeClass(status: string) {
  if (status === "on_track") return "bg-emerald-100 text-emerald-900";
  if (status === "watch") return "bg-amber-100 text-amber-900";
  if (status === "warning") return "bg-red-100 text-red-900";
  return "bg-neutral-100 text-neutral-700";
}

export function FlockFcrPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [label, setLabel] = useState<string | null>(null);
  const [flockCode, setFlockCode] = useState<string | null>(null);
  const [placementDate, setPlacementDate] = useState<string | null>(null);
  const [snap, setSnap] = useState<FcrBroilerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const [fr, sr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(id)}/fcr-snapshot`, { headers: readAuthHeaders(token) }),
      ]);
      const fd = await fr.json();
      const sd = await sr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error ?? "Flocks failed");
      if (!sr.ok) throw new Error((sd as { error?: string }).error ?? "FCR snapshot failed");
      const f = (
        (fd.flocks as { id: string; label: string; code?: string | null; placementDate?: string }[]) ?? []
      ).find((x) => x.id === id);
      setLabel(f?.label ?? null);
      setFlockCode(f?.code ?? null);
      setPlacementDate(f?.placementDate ?? null);
      setSnap(sd as FcrBroilerSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1 sm:max-w-2xl sm:px-0">
      <PageHeader
        title="Cycle FCR"
        subtitle={
          label ? (
            <>
              {label} · kg feed ÷ kg flock weight gained (broiler standard; lower is better)
            </>
          ) : (
            "Feed conversion for this batch"
          )
        }
        action={
          <Link to={`/farm/flocks/${id ?? ""}`} className="text-sm font-medium text-emerald-800 hover:underline">
            ← Flock
          </Link>
        }
      />

      {!loading && !error && snap ? (
        <FlockContextStrip
          label={label ?? "Flock"}
          code={flockCode}
          placementDate={placementDate ?? ""}
          ageDays={snap.ageDays}
          feedToDateKg={snap.feedToDateKg}
          footer={
            <Link
              to="/farm/feed"
              className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950"
            >
              Open feed log
            </Link>
          }
        />
      ) : null}

      {loading && <SkeletonList rows={2} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && snap ? (
        <>
          <section className={`rounded-2xl border border-neutral-200 p-4 shadow-sm ${statusBadgeClass(snap.status)}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Action center</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs opacity-80">Current FCR</p>
                <p className="text-xl font-bold tabular-nums">
                  {snap.fcrCumulative != null ? snap.fcrCumulative.toFixed(2) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs opacity-80">Target (day {snap.ageDays})</p>
                <p className="text-lg font-semibold tabular-nums">
                  {snap.fcrTargetMin.toFixed(2)} – {snap.fcrTargetMax.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs opacity-80">Days in cycle</p>
                <p className="font-semibold">{snap.ageDays}</p>
              </div>
              <div>
                <p className="text-xs opacity-80">Status</p>
                <p className="font-semibold capitalize">{snap.status.replace(/_/g, " ")}</p>
              </div>
            </div>
            {snap.reason === "no_weigh_in" ? (
              <p className="mt-3 text-sm">
                Add a weigh-in on the flock page to estimate live biomass; cumulative FCR needs average bird weight × headcount.
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800">
            <p className="font-semibold text-neutral-900">Inputs used</p>
            <ul className="mt-2 space-y-1 text-neutral-600">
              <li>
                Feed to date: <span className="font-medium text-neutral-900">{snap.feedToDateKg} kg</span> (round check-ins
                + feed log)
              </li>
              <li>
                Live birds (est.): <span className="font-medium text-neutral-900">{snap.birdsLiveEstimate}</span>
              </li>
              <li>
                Initial batch weight: <span className="font-medium text-neutral-900">{snap.initialTotalWeightKg} kg</span>
              </li>
              {snap.currentTotalBiomassKg != null ? (
                <li>
                  Current biomass est.:{" "}
                  <span className="font-medium text-neutral-900">{snap.currentTotalBiomassKg} kg</span>
                </li>
              ) : null}
              {snap.weightGainedKg != null ? (
                <li>
                  Weight gained: <span className="font-medium text-neutral-900">{snap.weightGainedKg} kg</span>
                </li>
              ) : null}
              {snap.latestWeighDate ? (
                <li>
                  Latest weigh-in date: <span className="font-mono text-xs">{snap.latestWeighDate}</span>
                </li>
              ) : null}
            </ul>
          </section>

          {snap.playbook.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
              <p className="font-semibold">If FCR is high — check</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {snap.playbook.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/farm/flocks/${id}#weigh-in`}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Record weigh-in
            </Link>
            <Link
              to="/farm/checkin"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              Round check-in
            </Link>
          </div>

          <p className="text-xs text-neutral-500">
            Harvest-oriented FCR on the slaughter page uses different inputs. Use this page for flock-cycle monitoring.
          </p>
        </>
      ) : null}
    </div>
  );
}
