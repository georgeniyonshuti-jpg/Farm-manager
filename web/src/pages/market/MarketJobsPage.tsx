import { useCallback, useEffect, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { PageTabs, StatusPill } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { FulfillmentCard } from "../../components/market/FulfillmentCard";
import {
  confirmBuyerPayment,
  fetchMarketJobs,
  fetchMarketSettlements,
  markFarmPaid,
  type FulfillmentJob,
} from "../../api/pipeline.api";
import { useToast } from "../../components/Toast";
import { formatRwf } from "../../lib/marketQuote";

export function MarketJobsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [tab, setTab] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<FulfillmentJob[]>([]);
  const [settlements, setSettlements] = useState<
    Awaited<ReturnType<typeof fetchMarketSettlements>>["settlements"]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const moneyTab = tab === "money" || tab === "in" || tab === "out";

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      if (moneyTab) {
        const queue = tab === "money" ? "open" : tab;
        const res = await fetchMarketSettlements(token, queue);
        setSettlements(res.settlements);
      } else {
        const res = await fetchMarketJobs(token, tab);
        setJobs(res.jobs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs");
    } finally {
      setLoading(false);
    }
  }, [allowed, token, tab, moneyTab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      showToast("success", ok);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <div className="store-wrap space-y-3 pb-8">
        <MarketPageHead title="Jobs" />
        <p className="text-sm text-[var(--store-muted)]">Market ops only.</p>
      </div>
    );
  }

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="Jobs"
        action={
          <button type="button" className="store-btn store-btn-ghost" onClick={() => void reload()}>
            Refresh
          </button>
        }
      />
      <PageTabs
        value={moneyTab ? "money" : tab}
        onChange={setTab}
        options={[
          { value: "open", label: "Open" },
          { value: "money", label: "Money" },
          { value: "all", label: "All" },
        ]}
      />
      {moneyTab ? (
        <PageTabs
          value={tab === "in" || tab === "out" ? tab : "money"}
          onChange={setTab}
          options={[
            { value: "money", label: "Open cash" },
            { value: "in", label: "Collect" },
            { value: "out", label: "Pay farms" },
          ]}
        />
      ) : null}
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : moneyTab ? (
        settlements.length === 0 ? (
          <EmptyState title="No money movements waiting" />
        ) : (
          <ul className="space-y-3">
            {settlements.map((row) => {
              const collect = row.buyerPaymentStatus !== "paid";
              const payFarm = row.buyerPaymentStatus === "paid" && row.farmerPayoutStatus !== "paid";
              return (
                <li key={row.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {row.birds} birds · {row.lotDistrict || "Lot"}
                        {row.publicRef ? ` · ${row.publicRef}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.buyerName}</p>
                    </div>
                    <StatusPill tone={collect ? "warning" : payFarm ? "info" : "success"}>
                      {collect ? row.buyerPaymentStatus : row.farmerPayoutStatus}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Buyer {row.buyerPaidRwf != null ? formatRwf(Number(row.buyerPaidRwf)) : "—"}
                    {row.buyerPaymentRef ? ` · ${row.buyerPaymentRef}` : ""}
                    {" · "}Farm {row.farmerPaidRwf != null ? formatRwf(Number(row.farmerPaidRwf)) : "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {collect ? (
                      <button
                        type="button"
                        className="store-btn store-btn-ember"
                        disabled={busyId === row.id}
                        onClick={() =>
                          void act(row.id, () => confirmBuyerPayment(token, row.id), "Buyer payment confirmed")
                        }
                      >
                        Confirm buyer payment
                      </button>
                    ) : null}
                    {payFarm ? (
                      <button
                        type="button"
                        className="store-btn store-btn-ghost"
                        disabled={busyId === row.id}
                        onClick={() => void act(row.id, () => markFarmPaid(token, row.id), "Farm paid")}
                      >
                        Pay farm
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : jobs.length === 0 ? (
        <EmptyState title={tab === "open" ? "No open handovers" : "No trades yet"} />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <FulfillmentCard key={job.id} job={job} viewer="ops" token={token} onChanged={() => void reload()} />
          ))}
        </ul>
      )}
    </div>
  );
}
