import { useCallback, useEffect, useState } from "react";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { Button, Input, PageTabs } from "../../components/ui";
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
    <div className={isOps ? "space-y-4 pb-8" : "mx-auto max-w-lg space-y-3 pb-28 [&>.sr-only+*]:!mt-0"}>
      {isOps ? (
        <FieldNavHeader
          title="Commissions"
          variant="hub"
          action={
            <Button type="button" size="sm" variant="ghost" onClick={() => void reload()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <h1 className="sr-only">Earnings</h1>
      )}

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
      ) : error && isOps ? (
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
                  {formatRwf(Number(r.commissionAmountRwf || 0))} · Sale · {r.scoutName || "Scout"}
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
          <ScoutEarnings mine={error ? null : mine} unavailable={Boolean(error)} />
          {error ? (
            <button type="button" className="px-1 text-sm font-medium text-[var(--primary-color)]" onClick={() => void reload()}>
              Try again
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ScoutEarnings({ mine, unavailable = false }: { mine: CommissionMine | null; unavailable?: boolean }) {
  const unpaid = mine?.accruedUnpaid ?? 0;
  const forecast = mine?.forecast ?? [];
  const sales = (mine?.rows ?? []).filter((row) => row.kind !== "visit");
  const owed = sales.filter((row) => row.commissionStatus === "accrued");
  const paid = sales.filter((row) => row.commissionStatus === "paid");
  const rate = mine?.ratePct;
  const money = (amount: number) => (unavailable ? "—" : formatRwf(amount));

  return (
    <>
      <section className="rounded-2xl bg-[var(--primary-color)] px-5 py-5 text-white shadow-[var(--shadow-sm)]">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Unpaid</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{money(unpaid)}</p>
        <p className="mt-2 text-sm text-white/80">
          {!unavailable && mine?.paidThisMonth ? `Paid this month ${formatRwf(mine.paidThisMonth)}` : "From flocks that have sold"}
        </p>
      </section>

      {owed.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)]">
          {owed.map((row) => (
            <li key={row.id} className="border-b border-[var(--border-color)] px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">
                    {row.lotFarmLabel || row.lotDistrict || "Sale"}
                  </span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {row.birds ? `${row.birds} birds` : "Sold"}
                    {row.buyerName ? ` · ${row.buyerName}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatRwf(Number(row.commissionAmountRwf || 0))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ProductionBoard
        forecast={forecast}
        ratePct={rate ?? 2}
        guidePricePerKg={mine?.guidePricePerKg ?? null}
        unavailable={unavailable}
      />

      {paid.length > 0 ? (
        <ul className="space-y-2">
          {paid.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-1 py-1 text-sm">
              <span className="text-[var(--text-muted)]">
                {row.lotFarmLabel || row.lotDistrict || "Sale"}
                {row.commissionPaidAt ? ` · ${String(row.commissionPaidAt).slice(0, 10)}` : ""}
              </span>
              <span className="tabular-nums text-[var(--text-secondary)]">{formatRwf(Number(row.commissionAmountRwf || 0))}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function flockSale(flock: NonNullable<CommissionMine["forecast"]>[number]) {
  const birds = Number(flock.birds);
  const kg = Number(flock.avgKg);
  const price = Number(flock.pricePerKg);
  if (!(birds > 0) || !(kg > 0) || !(price > 0)) return 0;
  return Math.round(birds * kg * price);
}

function shareOf(sale: number, ratePct: number) {
  return Math.round((sale * ratePct) / 100);
}

function ProductionBoard({
  forecast,
  ratePct,
  guidePricePerKg,
  unavailable,
}: {
  forecast: NonNullable<CommissionMine["forecast"]>;
  ratePct: number;
  guidePricePerKg: number | null;
  unavailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [moreBirds, setMoreBirds] = useState("");
  const [moreKg, setMoreKg] = useState("");
  const [morePrice, setMorePrice] = useState(guidePricePerKg ? String(guidePricePerKg) : "");

  useEffect(() => {
    setPicked((current) => {
      const next = { ...current };
      for (const flock of forecast) {
        if (next[flock.lotId] == null) next[flock.lotId] = true;
      }
      return next;
    });
  }, [forecast]);

  const bookSale = forecast.reduce((sum, flock) => sum + flockSale(flock), 0);
  const moreSale = (() => {
    const birds = Number(moreBirds);
    const kg = Number(moreKg);
    const price = Number(morePrice);
    if (!(birds > 0) || !(kg > 0) || !(price > 0)) return 0;
    return Math.round(birds * kg * price);
  })();
  const pickedSale = forecast.reduce((sum, flock) => (picked[flock.lotId] === false ? sum : sum + flockSale(flock)), 0);
  const estimate = shareOf(pickedSale + moreSale, ratePct);

  if (open) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)]">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button type="button" className="text-sm font-semibold text-[var(--text-muted)]" onClick={() => setOpen(false)}>
            Back
          </button>
          <span className="min-w-0 flex-1 text-right">
            <span className="block text-sm text-[var(--text-muted)]">{ratePct}% of what you select</span>
            <span className="block text-3xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
              {formatRwf(estimate)}
            </span>
          </span>
        </div>
        {forecast.length > 0 ? (
          <ul className="border-t border-[var(--border-color)]">
            {forecast.map((flock) => {
              const on = picked[flock.lotId] !== false;
              const share = shareOf(flockSale(flock), ratePct);
              return (
                <li key={flock.lotId} className="border-b border-[var(--border-color)]">
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setPicked((current) => ({ ...current, [flock.lotId]: !on }))}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        on
                          ? "border-[var(--primary-color)] bg-[var(--primary-color)] text-white"
                          : "border-[var(--border-color)]"
                      }`}
                      aria-hidden
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[var(--text-primary)]">{flock.label}</span>
                      <span className="block text-sm text-[var(--text-muted)]">
                        {flock.birds} birds
                        {flock.avgKg ? ` · ${flock.avgKg} kg` : ""}
                        {flock.pricePerKg ? ` · ${formatRwf(flock.pricePerKg)}/kg` : " · no price yet"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">
                      {share > 0 ? formatRwf(share) : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-t border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-muted)]">
            No flocks on the book yet.
          </p>
        )}
        <div className="border-t border-[var(--border-color)] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">If you find more</p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">A guess. It does not add a flock.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Birds
              <Input className="mt-1" inputMode="numeric" value={moreBirds} onChange={(e) => setMoreBirds(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Kg
              <Input className="mt-1" inputMode="decimal" value={moreKg} onChange={(e) => setMoreKg(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              RWF/kg
              <Input className="mt-1" inputMode="numeric" value={morePrice} onChange={(e) => setMorePrice(e.target.value)} />
            </label>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)]">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--text-primary)]">On the book</span>
          <span className="block text-sm text-[var(--text-muted)]">{ratePct}% if these flocks sell</span>
        </span>
        <span className="text-3xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
          {unavailable ? "—" : formatRwf(shareOf(bookSale, ratePct))}
        </span>
      </div>
      {forecast.length > 0 ? (
        <ul className="border-t border-[var(--border-color)]">
          {forecast.map((flock) => {
            const share = shareOf(flockSale(flock), ratePct);
            return (
              <li key={flock.lotId} className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">{flock.label}</span>
                  <span className="block text-sm text-[var(--text-muted)]">
                    {flock.birds} birds
                    {flock.pricePerKg ? ` · ${formatRwf(flock.pricePerKg)}/kg` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">
                  {share > 0 ? formatRwf(share) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-[var(--border-color)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Flocks show here after a seller is approved and a flock is added.
        </p>
      )}
      <div className="border-t border-[var(--border-color)] px-4 py-3">
        <Button type="button" variant="secondary" className="min-h-11 w-full" onClick={() => setOpen(true)}>
          Estimate
        </Button>
      </div>
    </section>
  );
}
