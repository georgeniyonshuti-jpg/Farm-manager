import { useCallback, useEffect, useState } from "react";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { Button, PageTabs } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk, canScoutPipeline } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import {
  fetchMyCommissions,
  fetchOpsCommissions,
  markCommissionPaid,
  voidCommission,
  type CommissionMine,
} from "../../api/pipeline.api";
import { formatRwf } from "../../lib/formatRwf";

export function MarketCommissionsPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isOps = canAccessPipelineDesk(user);
  const allowed = canScoutPipeline(user) || isOps;
  const [tab, setTab] = useState<"mine" | "ops">(isOps ? "ops" : "mine");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<CommissionMine | null>(null);
  const [opsRows, setOpsRows] = useState<
    Awaited<ReturnType<typeof fetchOpsCommissions>>["commissions"]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "mine" || !isOps) {
        setMine(await fetchMyCommissions(token));
      }
      if (tab === "ops" && isOps) {
        const res = await fetchOpsCommissions(token, "accrued");
        setOpsRows(res.commissions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load commissions");
    } finally {
      setLoading(false);
    }
  }, [allowed, token, tab, isOps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function pay(id: string, kind: "visit" | "trade" = "trade") {
    setBusyId(id);
    try {
      await markCommissionPaid(token, id, undefined, kind);
      showToast("success", "Marked paid");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusyId(null);
    }
  }

  async function voidRow(id: string, kind: "visit" | "trade" = "trade") {
    setBusyId(id);
    try {
      await voidCommission(token, id, "Voided by ops", kind);
      showToast("success", "Voided");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Void failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-3 pb-8">
        <FieldNavHeader title="Commissions" variant="hub" showAccount />
        <p className="text-sm text-[var(--text-secondary)]">Scout or ops only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <FieldNavHeader
        title="Commissions"
        variant="hub"
        showAccount={!isOps}
        action={
          <Button type="button" size="sm" variant="ghost" onClick={() => void reload()}>
            Refresh
          </Button>
        }
      />

      {isOps ? (
        <PageTabs
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: "mine", label: "My earnings" },
            { value: "ops", label: "Unpaid ledger" },
          ]}
        />
      ) : null}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : tab === "ops" && isOps ? (
        <ul className="space-y-2">
          {opsRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No unpaid commissions.</p>
          ) : (
            opsRows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {formatRwf(Number(r.commissionAmountRwf || 0))} · {r.kind === "visit" ? "Visit" : "Trade"} ·{" "}
                  {r.scoutName || "Scout"}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {r.lotDistrict || r.lotFarmLabel}
                  {r.kind === "visit" ? "" : ` · ${r.buyerName || ""}`}
                  {r.birds ? ` · ${r.birds} birds` : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void pay(r.id, r.kind === "visit" ? "visit" : "trade")}
                  >
                    Mark paid
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => void voidRow(r.id, r.kind === "visit" ? "visit" : "trade")}
                  >
                    Void
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Could earn</p>
              <p className="text-sm font-semibold tabular-nums">{formatRwf(mine?.couldEarn ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Unpaid</p>
              <p className="text-sm font-semibold tabular-nums">{formatRwf(mine?.accruedUnpaid ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Paid MTD</p>
              <p className="text-sm font-semibold tabular-nums">{formatRwf(mine?.paidThisMonth ?? 0)}</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Trade {mine?.ratePct ?? 2}% plus visit fee · visit accrues on weigh-in
          </p>
          <ul className="space-y-2">
            {(mine?.rows ?? []).length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No commission rows yet.</p>
            ) : (
              (mine?.rows ?? []).map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3"
                >
                  <p className="font-medium text-[var(--text-primary)]">
                    {formatRwf(Number(r.commissionAmountRwf || 0))} · {r.kind === "visit" ? "Visit" : "Trade"} ·{" "}
                    {r.commissionStatus}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {r.lotDistrict || r.lotFarmLabel}
                    {r.kind === "visit" ? "" : ` · ${r.buyerName || ""}`}
                    {r.birds ? ` · ${r.birds} birds` : ""}
                    {r.commissionPaidAt
                      ? ` · paid ${String(r.commissionPaidAt).slice(0, 10)}`
                      : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
