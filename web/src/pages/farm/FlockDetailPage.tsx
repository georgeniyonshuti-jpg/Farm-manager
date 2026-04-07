import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import type { CheckinStatus } from "./FarmCheckinPage";

export function FlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [flockMeta, setFlockMeta] = useState<{ label: string; placementDate: string } | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<{ feedToDateKg: number; fcr: number | null; birdsLiveEstimate: number } | null>(null);
  const [treatments, setTreatments] = useState<Array<{ at: string; medicineName: string; withdrawalDays: number }>>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      // ENV: moved to environment variable
      const fr = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error);
      const f = ((fd.flocks as { id: string; label: string; placementDate: string }[]) ?? []).find(
        (x) => x.id === id
      );
      if (!f) throw new Error("Flock not found");
      setFlockMeta({ label: f.label, placementDate: f.placementDate });

      // ENV: moved to environment variable
      const sr = await fetch(`${API_BASE_URL}/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error);
      setStatus(sd as CheckinStatus);
      const pr = await fetch(`${API_BASE_URL}/api/flocks/${id}/performance-summary`, { headers: readAuthHeaders(token) });
      const pd = await pr.json();
      if (!pr.ok) throw new Error((pd as { error?: string }).error);
      setPerformance(pd as { feedToDateKg: number; fcr: number | null; birdsLiveEstimate: number });
      const tr = await fetch(`${API_BASE_URL}/api/flocks/${id}/treatments`, { headers: readAuthHeaders(token) });
      const td = await tr.json();
      if (!tr.ok) throw new Error((td as { error?: string }).error);
      setTreatments(((td as { treatments?: Array<{ at: string; medicineName: string; withdrawalDays: number }> }).treatments ?? []).slice(0, 5));
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
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={flockMeta?.label ?? "Flock"}
        subtitle={flockMeta ? <>Placement {flockMeta.placementDate}</> : undefined}
        action={
          <Link to="/farm/flocks" className="text-sm font-medium text-emerald-800 hover:underline">
            ← All flocks
          </Link>
        }
      />

      {loading && <SkeletonList rows={3} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {flockMeta && status && !loading && !error ? (
        <div className="space-y-4">
          {performance ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">Feed to date</p><p className="font-semibold">{performance.feedToDateKg} kg</p></div>
              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">Live estimate</p><p className="font-semibold">{performance.birdsLiveEstimate}</p></div>
              <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm"><p className="text-neutral-500">FCR</p><p className="font-semibold">{performance.fcr != null ? performance.fcr.toFixed(2) : "-"}</p></div>
            </div>
          ) : null}
          {!!treatments.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-neutral-800">Withdrawal compliance</p>
              <div className="space-y-1">
                {treatments.map((t, i) => {
                  const endsAt = new Date(new Date(t.at).getTime() + t.withdrawalDays * 24 * 60 * 60 * 1000).getTime();
                  const left = Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000));
                  return (
                    <p key={`${t.at}-${i}`} className={left > 0 ? "text-amber-700" : "text-emerald-700"}>
                      {t.medicineName}: {left > 0 ? `${left} day(s) left` : "cleared"}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
            <p className="text-sm font-medium text-neutral-800">Round check-in</p>
            <CheckinUrgencyBadge badge={status.checkinBadge} />
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Bird age</dt>
              <dd className="font-medium text-neutral-900">Day {status.ageDays}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Check-in every</dt>
              <dd className="font-medium text-neutral-900">{status.intervalHours} h</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Last check-in</dt>
              <dd className="font-mono text-xs text-neutral-900">
                {status.lastCheckinAt
                  ? new Date(status.lastCheckinAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Next due (Kigali)</dt>
              <dd className="font-mono text-xs text-neutral-900">
                {new Date(status.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
              </dd>
            </div>
          </dl>
        </div>
        </div>
      ) : null}
    </div>
  );
}
