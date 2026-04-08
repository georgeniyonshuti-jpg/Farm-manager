import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge, type CheckinBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";

type FlockRow = {
  id: string;
  label: string;
  placementDate: string;
  checkinBadge?: CheckinBadge;
  nextDueAt?: string;
  ageDays?: number;
  intervalHours?: number;
  latestFcr?: number | null;
  withdrawalActive?: boolean;
};

export function FlockListPage() {
  const { token } = useAuth();
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // ENV: moved to environment variable
      const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      const base = (d.flocks as FlockRow[]) ?? [];
      const enriched = await Promise.all(
        base.map(async (f) => {
          try {
            const [wr, er] = await Promise.all([
              fetch(`${API_BASE_URL}/api/weigh-ins/${encodeURIComponent(f.id)}/latest`, { headers: readAuthHeaders(token) }),
              fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(f.id)}/eligibility`, { headers: readAuthHeaders(token) }),
            ]);
            const wd = await wr.json().catch(() => ({}));
            const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
            return {
              ...f,
              latestFcr: (wd as { weighIn?: { fcr?: number | null } }).weighIn?.fcr ?? null,
              withdrawalActive: !Boolean((ed as { eligibleForSlaughter?: boolean }).eligibleForSlaughter ?? true),
            };
          } catch {
            return { ...f, latestFcr: null, withdrawalActive: false };
          }
        })
      );
      setFlocks(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Flocks"
        subtitle="Check-in urgency from bird age and hours-between-rounds policy."
      />

      {loading && <SkeletonList rows={4} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && flocks.length === 0 && (
        <EmptyState
          title="No flocks yet"
          description="Add your first flock to get started."
        />
      )}

      {!loading && !error && flocks.length > 0 ? (
        <>
          <ul className="space-y-3 sm:hidden">
            {flocks.map((f) => (
              <li key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/farm/flocks/${f.id}`} className="font-semibold text-emerald-900 hover:underline">
                    {f.label}
                  </Link>
                  {f.checkinBadge && <CheckinUrgencyBadge badge={f.checkinBadge} />}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Day {f.ageDays ?? "—"} · next due{" "}
                  {f.nextDueAt
                    ? new Date(f.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-neutral-700">FCR: {f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</p>
                {f.withdrawalActive ? <p className="mt-1 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</p> : null}
              </li>
            ))}
          </ul>

          <div className="institutional-table-wrapper hidden overflow-x-auto sm:block">
            <table className="institutional-table min-w-full text-sm">
              <thead>
                <tr>
                  <th>Flock</th>
                  <th>Age (days)</th>
                  <th>Interval (h)</th>
                  <th>FCR</th>
                  <th>Next due (Kigali)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {flocks.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link to={`/farm/flocks/${f.id}`} className="font-medium text-emerald-800 hover:underline">
                        {f.label}
                      </Link>
                    </td>
                    <td>{f.ageDays ?? "—"}</td>
                    <td>{f.intervalHours ?? "—"}</td>
                    <td>{f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</td>
                    <td className="font-mono text-xs">
                      {f.nextDueAt
                        ? new Date(f.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                        : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : null}
                        {f.withdrawalActive ? <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</span> : null}
                        {!f.checkinBadge && !f.withdrawalActive ? "—" : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
