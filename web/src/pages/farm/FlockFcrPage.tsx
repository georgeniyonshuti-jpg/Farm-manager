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
  const { token, user } = useAuth();
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
      const listQ =
        user?.role === "superuser" || user?.role === "manager" || user?.role === "vet_manager"
          ? "?includeArchived=true"
          : "";
      const [fr, sr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks${listQ}`, { headers: readAuthHeaders(token) }),
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
  }, [id, token, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 sm:max-w-3xl sm:px-0">
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
          <div className="table-block">
            <div className="table-toolbar">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">FCR summary</span>
              <span className={["ml-auto rounded px-2 py-0.5 text-xs font-semibold capitalize", statusBadgeClass(snap.status)].join(" ")}>
                {snap.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="institutional-table-wrapper">
              <table className="institutional-table">
                <thead>
                  <tr>
                    <th className="tbl-num">Current FCR</th>
                    <th className="tbl-num">Target min</th>
                    <th className="tbl-num">Target max</th>
                    <th className="tbl-num">Days in cycle</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="tbl-num text-xl font-bold">
                      {snap.fcrCumulative != null ? snap.fcrCumulative.toFixed(2) : "—"}
                    </td>
                    <td className="tbl-num font-semibold">{snap.fcrTargetMin.toFixed(2)}</td>
                    <td className="tbl-num font-semibold">{snap.fcrTargetMax.toFixed(2)}</td>
                    <td className="tbl-num font-semibold">{snap.ageDays}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {snap.reason === "no_weigh_in" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Add a weigh-in on the flock page to estimate live biomass; cumulative FCR needs average bird weight × headcount.
            </p>
          ) : null}

          <div className="table-block">
            <div className="table-toolbar">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Inputs used for FCR calculation</span>
            </div>
            <div className="institutional-table-wrapper">
              <table className="institutional-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th className="tbl-num">Value</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Feed to date</td>
                    <td className="tbl-num font-semibold">{snap.feedToDateKg} kg</td>
                    <td className="text-neutral-500">round check-ins + feed log</td>
                  </tr>
                  <tr>
                    <td>Live birds (est.)</td>
                    <td className="tbl-num font-semibold">{snap.birdsLiveEstimate}</td>
                    <td className="text-neutral-500">initial − mortality</td>
                  </tr>
                  <tr>
                    <td>Initial batch weight</td>
                    <td className="tbl-num font-semibold">{snap.initialTotalWeightKg} kg</td>
                    <td className="text-neutral-500">at placement</td>
                  </tr>
                  {snap.currentTotalBiomassKg != null ? (
                    <tr>
                      <td>Current biomass (est.)</td>
                      <td className="tbl-num font-semibold">{snap.currentTotalBiomassKg} kg</td>
                      <td className="text-neutral-500">from latest weigh-in</td>
                    </tr>
                  ) : null}
                  {snap.weightGainedKg != null ? (
                    <tr>
                      <td>Weight gained</td>
                      <td className="tbl-num font-semibold">{snap.weightGainedKg} kg</td>
                      <td className="text-neutral-500">current − initial biomass</td>
                    </tr>
                  ) : null}
                  {snap.latestWeighDate ? (
                    <tr>
                      <td>Latest weigh-in date</td>
                      <td className="tbl-mono">{snap.latestWeighDate}</td>
                      <td className="text-neutral-500">—</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

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
