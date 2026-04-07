import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { useLaborerT } from "../../i18n/laborerI18n";
import { CheckinStatusBlock, type CheckinStatus } from "../farm/FarmCheckinPage";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";

export function LaborerHome() {
  const { token } = useAuth();
  const hTitle = useLaborerT("Action center");
  const hSub = useLaborerT("Daily tasks — mobile-first.");
  const linkCheckin = useLaborerT("Round check-in (photos + feed / water)");
  const linkMort = useLaborerT("Log mortality (photos anytime / emergency)");
  const linkDaily = useLaborerT("End-of-day summary (legacy daily log)");
  const linkTable = useLaborerT("Mortality history table");
  const linkInv = useLaborerT("Feed inventory");
  const linkEarnings = useLaborerT("My earnings");
  const noFlockTitle = useLaborerT("No active flock");
  const noFlockBody = useLaborerT("Check-in status appears when a flock exists on the farm.");

  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const fr = await fetch("/api/flocks", { headers: readAuthHeaders(token) });
      const fd = await fr.json();
      if (!fr.ok) throw new Error(fd.error ?? "Flocks failed");
      const id = (fd.flocks as { id: string }[])[0]?.id;
      if (!id) {
        setStatus(null);
        return;
      }
      const sr = await fetch(`/api/flocks/${id}/checkin-status`, { headers: readAuthHeaders(token) });
      const sd = await sr.json();
      if (!sr.ok) throw new Error(sd.error ?? "Status failed");
      setStatus(sd as CheckinStatus);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={hTitle} subtitle={hSub} />

      {loading && <SkeletonList rows={2} />}
      {!loading && loadError && (
        <ErrorState message={loadError} onRetry={() => void load()} />
      )}

      {!loading && !loadError && status && <CheckinStatusBlock status={status} />}
      {!loading && !loadError && !status ? (
        <EmptyState title={noFlockTitle} description={noFlockBody} />
      ) : null}

      <div className="grid gap-3">
        <Link
          to="/farm/checkin"
          className="flex min-h-[56px] items-center justify-center rounded-2xl bg-emerald-800 px-4 text-lg font-semibold text-white shadow hover:bg-emerald-900"
        >
          {linkCheckin}
        </Link>
        <Link
          to="/farm/mortality-log"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50/80 px-4 text-lg font-semibold text-red-900 hover:bg-red-50"
        >
          {linkMort}
        </Link>
        <Link
          to="/farm/daily-log"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkDaily}
        </Link>
        <Link
          to="/farm/mortality"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkTable}
        </Link>
        <Link
          to="/farm/inventory"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-lg font-medium text-neutral-900 hover:bg-neutral-50"
        >
          {linkInv}
        </Link>
        <Link
          to="/laborer/earnings"
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 text-lg font-semibold text-emerald-900 hover:bg-emerald-50"
        >
          {linkEarnings}
        </Link>
      </div>
    </div>
  );
}
