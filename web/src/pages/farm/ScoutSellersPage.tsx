import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { fetchMyScoutFlocks, type MyScoutFlock } from "../../api/pipeline.api";

export function ScoutSellersPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const allowed = canScoutPipeline(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(true);
  const [flocks, setFlocks] = useState<MyScoutFlock[]>([]);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMyScoutFlocks(token);
      setReady(res.ready);
      setFlocks(res.flocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load flocks.");
    } finally {
      setLoading(false);
    }
  }, [allowed, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to scout.</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">My flocks</h1>
      {loading ? <SkeletonList rows={3} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {!loading && !error && !ready ? (
        <p className="text-sm text-[var(--text-secondary)]">You are waiting for Cleva.</p>
      ) : null}
      {!loading && !error && ready && flocks.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No flocks are assigned to you yet.</p>
      ) : null}
      {!loading && !error && ready ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => navigate(companyHref("/farm/pipeline/scout?mode=offplatform"))}
        >
          Register a friend's flock
        </Button>
      ) : null}
      <ul className="space-y-3">
        {flocks.map((flock) => {
          const mine = Boolean(flock.assignedToMe);
          const waiting = !mine;
          return (
            <li key={flock.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {flock.farmLabel || flock.district || "Flock"}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {flock.birdCount ? `${flock.birdCount} birds` : "Birds not set"} · {flock.district || "District not set"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {flock.scoutConfirmedAt
                  ? "Visit done"
                  : waiting
                    ? "Waiting for Cleva"
                    : flock.verificationStatus === "verified"
                      ? "Assigned to you"
                      : "Waiting for Cleva"}
              </p>
              {mine && !flock.scoutConfirmedAt && flock.verificationStatus === "verified" ? (
                <Button
                  type="button"
                  className="mt-3 min-h-11"
                  onClick={() => navigate(companyHref(`/farm/pipeline/weigh/${flock.id}`))}
                >
                  Visit
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
