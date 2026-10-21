import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { fetchScoutFarms, type ScoutFarmRow } from "../../api/pipeline.api";
import { visitBeforeLabel } from "../../lib/sellingWeek";

const CHIP_LABEL: Record<string, string> = {
  invite_sent: "Invite sent",
  claimed: "Seller joined",
  pending_review: "Waiting for approval",
  verified: "Approved",
  live: "On the market",
  needs_review: "Needs a manager",
};

export function ScoutSellersPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const allowed = canScoutPipeline(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [farms, setFarms] = useState<ScoutFarmRow[]>([]);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchScoutFarms(token);
      setFarms(res.farms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sellers.");
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
    <div className="mx-auto max-w-lg space-y-4 pb-28 [&>.sr-only+*]:!mt-0">
      <h1 className="sr-only">Sellers</h1>
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : farms.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
          <h1 className="text-lg font-semibold">No sellers yet</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Add someone on Find. After they are approved, their flock and visit show up there too.
          </p>
          <Button type="button" className="mt-4 min-h-11" onClick={() => navigate(companyHref("/farm/pipeline/scout?mode=offplatform"))}>
            Find a seller
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {farms.map((farm) => (
            <li key={farm.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
              <p className="text-lg font-semibold text-[var(--text-primary)]">{farm.displayName}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {farm.birdCount ? `${farm.birdCount} birds` : "No flock yet"} · {farm.district || "District not set"}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {farm.scoutConfirmedAt ? "Weigh visit done" : visitBeforeLabel(farm.readyFrom)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(farm.statusChips || []).map((chip) => (
                  <span key={chip} className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-medium">
                    {CHIP_LABEL[chip] || chip}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2">
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-white"
                  to={companyHref(`/farm/pipeline/scout/handoff?farmId=${encodeURIComponent(farm.id)}`)}
                >
                  Share with seller
                </Link>
                {farm.verificationStatus === "verified" && !farm.lotId ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-color)] px-3 text-sm font-semibold"
                    to={companyHref(`/farm/pipeline/scout?mode=offplatform&task=flock&farm=${encodeURIComponent(farm.id)}`)}
                  >
                    Add flock
                  </Link>
                ) : null}
                {farm.lotId && !farm.scoutConfirmedAt ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-color)] px-3 text-sm font-semibold"
                    to={companyHref(`/farm/pipeline/scout?mode=offplatform&task=visit&farm=${encodeURIComponent(farm.id)}`)}
                  >
                    Visit
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
