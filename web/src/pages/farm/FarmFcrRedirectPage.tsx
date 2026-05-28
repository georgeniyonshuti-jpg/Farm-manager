import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { ErrorState } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";

type FlockRow = { id: string; label: string };

/**
 * Cycle FCR hub — defaults to all flocks; pick one to open its FCR page.
 */
export function FarmFcrRedirectPage() {
  const { token } = useAuth();
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [flockId, setFlockId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? "Failed to load flocks");
        if (!cancelled) {
          setFlocks(
            ((d as { flocks?: FlockRow[] }).flocks ?? []).map((f) => ({
              id: f.id,
              label: f.label,
            }))
          );
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (flockId) {
    return <Navigate to={`/farm/flocks/${encodeURIComponent(flockId)}/fcr`} replace />;
  }

  if (err) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Cycle FCR" subtitle="Could not load flocks." />
        <ErrorState message={err} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 sm:max-w-3xl sm:px-0">
      <PageHeader
        title="Cycle FCR"
        subtitle="Feed conversion by batch — select a flock or browse all batches below."
      />

      {loading ? (
        <p className="text-sm text-neutral-600">Loading flocks…</p>
      ) : (
        <>
          <label className="block text-sm font-medium text-neutral-700">
            Flock
            <select
              className="mt-1 w-full max-w-md min-h-[44px] rounded-lg border border-neutral-300 px-3 text-base"
              value={flockId}
              onChange={(e) => setFlockId(e.target.value)}
            >
              <option value="">All flocks</option>
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {flocks.length > 0 ? (
            <ul className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              {flocks.map((f) => (
                <li key={f.id}>
                  <Link
                    to={`/farm/flocks/${encodeURIComponent(f.id)}/fcr`}
                    className="text-sm font-semibold text-emerald-800 underline hover:text-emerald-950"
                  >
                    {f.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-600">No active flocks.</p>
          )}
        </>
      )}
    </div>
  );
}
