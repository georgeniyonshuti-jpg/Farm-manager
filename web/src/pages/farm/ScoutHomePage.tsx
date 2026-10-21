import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline, isScoutApplicant } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { fetchCrmSellers, fetchMyCommissions, fetchScoutFarms, type CrmSellerRow, type ScoutFarmRow } from "../../api/pipeline.api";
import { formatRwf } from "../../lib/formatRwf";

const CHIP_LABEL: Record<string, string> = {
  invite_sent: "Invite sent",
  claimed: "Joined",
  pending_review: "Waiting",
  verified: "Approved",
  live: "On market",
  needs_review: "Needs a manager",
};

export function ScoutHomePage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const allowed = canScoutPipeline(user);
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<ScoutFarmRow[] | null>(null);
  const [unpaid, setUnpaid] = useState<number | null>(null);
  const [couldEarn, setCouldEarn] = useState<number | null>(null);
  const [crmSellers, setCrmSellers] = useState<CrmSellerRow[] | null>(null);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    const [farmRes, payRes, crmRes] = await Promise.allSettled([
      fetchScoutFarms(token),
      fetchMyCommissions(token),
      fetchCrmSellers(token),
    ]);
    setFarms(farmRes.status === "fulfilled" ? farmRes.value.farms : null);
    setCrmSellers(crmRes.status === "fulfilled" ? crmRes.value.sellers : null);
    if (payRes.status === "fulfilled") {
      setUnpaid(payRes.value.accruedUnpaid ?? 0);
      setCouldEarn(payRes.value.couldEarn ?? 0);
    } else {
      setUnpaid(null);
      setCouldEarn(null);
    }
    setLoading(false);
  }, [allowed, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to scout.</p>;
  }

  const list = farms ?? [];
  const flocksDue = farms ? list.filter((farm) => farm.verificationStatus === "verified" && !farm.lotId).length : null;
  const visitsDue = farms ? list.filter((farm) => farm.lotId && !farm.scoutConfirmedAt).length : null;
  const next = [...list].sort((a, b) => {
    const aw = (a.statusChips || []).includes("pending_review") ? 0 : 1;
    const bw = (b.statusChips || []).includes("pending_review") ? 0 : 1;
    return aw - bw;
  }).slice(0, 3);

  const figure = (value: number | null) => (loading || value == null ? "—" : String(value));
  const introPending = isScoutApplicant(user);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      {introPending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Intro call pending — you can find sellers now. Commission payouts unlock after your onboarding call.
        </div>
      ) : null}
      <Link
        to={companyHref("/market/commissions")}
        className="block rounded-2xl bg-[var(--primary-color)] px-5 py-5 text-white shadow-[var(--shadow-sm)]"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Unpaid</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {loading || unpaid == null ? "—" : formatRwf(unpaid)}
        </p>
        <p className="mt-2 text-sm text-white/80">
          If they sell {loading || couldEarn == null ? "—" : formatRwf(couldEarn)}
        </p>
      </Link>

      <div className="grid grid-cols-3 gap-2">
        <StatLink to={companyHref("/farm/pipeline/sellers")} label="Sellers" value={figure(farms ? list.length : null)} />
        <StatLink to={companyHref("/farm/pipeline/scout?mode=offplatform#flocks")} label="Flocks" value={figure(flocksDue)} />
        <StatLink to={companyHref("/farm/pipeline/scout?mode=offplatform#visits")} label="Visits" value={figure(visitsDue)} />
      </div>

      {crmSellers && crmSellers.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Assigned to me</h2>
            <Link to={companyHref("/farm/pipeline/crm-sellers")} className="text-sm font-medium text-[var(--primary-color)]">
              See all
            </Link>
          </div>
          <ul className="space-y-2">
            {crmSellers.slice(0, 3).map((row) => (
              <li key={row.id}>
                <Link
                  to={companyHref(`/farm/pipeline/crm-sellers?id=${encodeURIComponent(row.id)}`)}
                  className="block rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
                >
                  <span className="block font-semibold">{row.contactName}</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {row.district || "Seller"}
                    {row.birdCount ? ` · ${row.birdCount} birds` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Button
        type="button"
        className="min-h-12 w-full text-base"
        onClick={() => navigate(companyHref("/farm/pipeline/scout?mode=offplatform"))}
      >
        Find a seller
      </Button>

      {next.length > 0 ? (
        <ul className="space-y-2">
          {next.map((farm) => {
            const chip = (farm.statusChips || [])[0];
            return (
              <li key={farm.id}>
                <Link
                  to={companyHref(`/farm/pipeline/scout/handoff?farmId=${encodeURIComponent(farm.id)}`)}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
                >
                  <span>
                    <span className="block font-semibold text-[var(--text-primary)]">{farm.displayName}</span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {farm.birdCount ? `${farm.birdCount} birds` : farm.district || "Seller"}
                    </span>
                  </span>
                  {chip ? (
                    <span className="shrink-0 rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium">
                      {CHIP_LABEL[chip] || chip}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-4">
          <Link
            to={companyHref("/farm/pipeline/crm-sellers")}
            className="text-sm font-medium text-[var(--text-muted)]"
          >
            Assigned sellers
          </Link>
          <Link
            to={companyHref("/farm/pipeline/how-it-works")}
            className="text-sm font-medium text-[var(--text-muted)]"
          >
            How it works
          </Link>
        </div>
        {farms == null && !loading ? (
          <button type="button" className="text-sm font-medium text-[var(--primary-color)]" onClick={() => void reload()}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatLink({ to, label, value }: { to: string; label: string; value: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
    </Link>
  );
}
