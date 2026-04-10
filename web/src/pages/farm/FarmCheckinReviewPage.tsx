import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";

type PendingCheckin = {
  id: string;
  flockId: string;
  laborerId: string;
  at: string;
  submissionStatus?: string;
  feedAvailable?: boolean;
  waterAvailable?: boolean;
  notes?: string;
  laborerName?: string;
  flockCode?: string;
};

export function FarmCheckinReviewPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [checkins, setCheckins] = useState<PendingCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/check-ins/pending`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setCheckins((d as { checkins?: PendingCheckin[] }).checkins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const r = await fetch(`${API_BASE_URL}/api/check-ins/${encodeURIComponent(id)}/review`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Update failed");
      showToast("success", action === "approve" ? "Check-in approved." : "Check-in rejected.");
      void load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Review round check-ins"
        subtitle="Approve laborer and junior vet submissions. Payroll is approved separately under Payroll."
        action={
          <Link
            to="/farm/payroll"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Payroll
          </Link>
        }
      />

      {loading && <SkeletonList rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && checkins.length === 0 ? (
        <p className="text-sm text-neutral-600">No check-ins pending review.</p>
      ) : null}

      {!loading && !error && checkins.length > 0 ? (
        <ul className="space-y-3">
          {checkins.map((c) => (
            <li key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">
                    {c.flockCode ?? c.flockId.slice(0, 8)} · {c.laborerName ?? c.laborerId.slice(0, 8)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-neutral-600">
                    {new Date(c.at).toLocaleString(undefined, { timeZone: "Africa/Kigali" })}
                  </p>
                  <p className="mt-2 text-neutral-700">
                    Feed: {c.feedAvailable ? "Yes" : "No"} · Water: {c.waterAvailable ? "Yes" : "No"}
                  </p>
                  {c.notes ? <p className="mt-1 text-neutral-600">{c.notes}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void review(c.id, "approve")}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void review(c.id, "reject")}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
