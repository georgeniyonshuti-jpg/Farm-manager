import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge } from "../../components/farm/CheckinUrgencyBadge";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import type { CheckinStatus } from "./FarmCheckinPage";

export function FlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [flockMeta, setFlockMeta] = useState<{ label: string; placementDate: string } | null>(null);
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const fr = await fetch("/api/flocks", { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error((fd as { error?: string }).error);
      const f = ((fd.flocks as { id: string; label: string; placementDate: string }[]) ?? []).find(
        (x) => x.id === id
      );
      if (!f) throw new Error("Flock not found");
      setFlockMeta({ label: f.label, placementDate: f.placementDate });

      const sr = await fetch(`/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error);
      setStatus(sd as CheckinStatus);
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
      ) : null}
    </div>
  );
}
