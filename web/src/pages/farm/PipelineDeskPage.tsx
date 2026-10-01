import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { PageTabs } from "../../components/ui/PageTabs";
import { Button, Field, Modal, SegmentedControl, StatusPill } from "../../components/ui";
import { DistrictSelect } from "../../components/DistrictSelect";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk, isPipelineSalesRole } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import {
  createPipelineDemand,
  createPipelineMatch,
  fetchMarketOpsSummary,
  fetchPipelineBuyers,
  fetchPipelineDemands,
  fetchPipelineForwardSummary,
  fetchPipelineLots,
  fetchPipelineMatches,
  refreshPipelineLot,
  updatePipelineMatch,
  type PipelineBuyer,
  type PipelineDemand,
  type PipelineLot,
  type PipelineMatch,
} from "../../api/pipeline.api";
import { formatRwf } from "../../lib/formatRwf";
import { listingPhaseCopy } from "../../lib/sellingWeek";

function formatKg(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} kg`;
}

function formatDay(d: string | null | undefined) {
  if (!d) return "?";
  return String(d).slice(0, 10);
}

function sourceLabel(source: string) {
  return source === "managed_flock" ? "Managed" : "Scout";
}

function statusLabel(status: string) {
  if (status === "partial") return "Partial";
  if (status === "draft") return "Draft";
  if (status === "open") return "Open";
  return status;
}

function matchStatusLabel(status: string) {
  if (status === "committed") return "Committed";
  if (status === "delivered") return "Delivered";
  if (status === "failed") return "Failed";
  return status;
}

export function PipelineDeskPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const salesShell = isPipelineSalesRole(user);

  const [tab, setTab] = useState<"lots" | "demand" | "matches">("lots");
  const [lotPhase, setLotPhase] = useState<"all" | "visit_due" | "weighed" | "live">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forward, setForward] = useState<Awaited<ReturnType<typeof fetchPipelineForwardSummary>> | null>(
    null
  );
  const [opsSummary, setOpsSummary] = useState<{
    openLotBirds: number;
    committedThisWeek: number;
    accruedUnpaidRwf: number;
    newLeads?: number;
    openExceptions?: number;
  } | null>(null);
  const [lots, setLots] = useState<PipelineLot[]>([]);
  const [demands, setDemands] = useState<PipelineDemand[]>([]);
  const [matches, setMatches] = useState<PipelineMatch[]>([]);
  const [buyers, setBuyers] = useState<PipelineBuyer[]>([]);

  const [matchLot, setMatchLot] = useState<PipelineLot | null>(null);
  const [matchForm, setMatchForm] = useState({
    buyerId: "",
    demandId: "",
    birds: "",
    agreedPricePerKg: "",
    readyDate: "",
  });
  const [demandOpen, setDemandOpen] = useState(false);
  const [demandForm, setDemandForm] = useState({
    buyerId: "",
    birdsNeeded: "",
    weightKgMin: "",
    weightKgMax: "",
    neededFrom: "",
    neededTo: "",
    districtPreference: "",
    rawNotes: "",
    channel: "whatsapp",
  });
  const [deliverMatch, setDeliverMatch] = useState<PipelineMatch | null>(null);
  const [deliverForm, setDeliverForm] = useState({ avgWeightKg: "", learningNotes: "" });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [f, l, d, m, b, ops] = await Promise.all([
        fetchPipelineForwardSummary(token),
        fetchPipelineLots(token),
        fetchPipelineDemands(token),
        fetchPipelineMatches(token),
        fetchPipelineBuyers(token),
        fetchMarketOpsSummary(token).catch(() => null),
      ]);
      setForward(f);
      setLots(l.lots);
      setDemands(d.demands);
      setMatches(m.matches);
      setBuyers(b.buyers);
      setOpsSummary(ops);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline.");
    } finally {
      setLoading(false);
    }
  }, [token, allowed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openLots = useMemo(() => {
    const open = lots.filter((l) => l.status === "open" || l.status === "partial" || l.status === "draft");
    if (lotPhase === "all") return open;
    return open.filter((l) => l.listingPhase === lotPhase);
  }, [lots, lotPhase]);
  const openDemands = useMemo(
    () => demands.filter((d) => d.status === "open" || d.status === "partial"),
    [demands]
  );

  async function submitMatch() {
    if (!token || !matchLot) return;
    setBusy(true);
    try {
      await createPipelineMatch(token, {
        lotId: matchLot.id,
        buyerId: matchForm.buyerId,
        demandId: matchForm.demandId || null,
        birds: Number(matchForm.birds),
        agreedPricePerKg: matchForm.agreedPricePerKg ? Number(matchForm.agreedPricePerKg) : null,
        readyDate: matchForm.readyDate || null,
      });
      showToast("success", "Match committed");
      setMatchLot(null);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitDemand() {
    if (!token) return;
    setBusy(true);
    try {
      await createPipelineDemand(token, {
        buyerId: demandForm.buyerId,
        birdsNeeded: Number(demandForm.birdsNeeded),
        weightKgMin: demandForm.weightKgMin ? Number(demandForm.weightKgMin) : null,
        weightKgMax: demandForm.weightKgMax ? Number(demandForm.weightKgMax) : null,
        neededFrom: demandForm.neededFrom || null,
        neededTo: demandForm.neededTo || null,
        districtPreference: demandForm.districtPreference || null,
        rawNotes: demandForm.rawNotes || null,
        channel: demandForm.channel,
      });
      showToast("success", "Demand recorded");
      setDemandOpen(false);
      setTab("demand");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not create demand");
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered() {
    if (!token || !deliverMatch) return;
    if (deliverMatch.lotSource === "managed_flock" && !deliverForm.avgWeightKg) {
      showToast("error", "Avg weight kg is required to create a sales order for managed lots.");
      return;
    }
    setBusy(true);
    try {
      await updatePipelineMatch(token, deliverMatch.id, {
        status: "delivered",
        avgWeightKg: deliverForm.avgWeightKg ? Number(deliverForm.avgWeightKg) : null,
        learningNotes: deliverForm.learningNotes || null,
      });
      showToast(
        "success",
        deliverMatch.lotSource === "managed_flock"
          ? "Settled — sales order created"
          : "Trade settled (ops override)"
      );
      setDeliverMatch(null);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshLot(lot: PipelineLot) {
    if (!token || lot.source !== "managed_flock") return;
    setBusy(true);
    try {
      await refreshPipelineLot(token, lot.id);
      showToast("success", "Lot refreshed from flock");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function markFailed(m: PipelineMatch) {
    if (!token) return;
    setBusy(true);
    try {
      await updatePipelineMatch(token, m.id, { status: "failed" });
      showToast("success", "Match marked failed");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: ReactNode) => (
    <div className="mx-auto w-full max-w-lg space-y-4 pb-6">{children}</div>
  );

  if (!allowed) {
    return shell(
      <>
        <FieldNavHeader title="Supply pipeline" variant="hub" showAccount={!salesShell} />
        <p className="text-sm text-[var(--text-muted)]">Sales coordinator or superuser access required.</p>
      </>
    );
  }

  return shell(
    <>
      <FieldNavHeader
        title="Supply pipeline"
        variant="hub"
        showAccount={!salesShell}
        action={
          <Button type="button" size="sm" variant="ghost" onClick={() => void reload()}>
            Refresh
          </Button>
        }
      />

      <p className="text-sm text-[var(--text-secondary)]">
        Live market overview. Buyers book in-app — verify accounts and lots under Verify.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(forward?.weeks ?? []).map((w) => (
          <div
            key={w.key}
            className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {w.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
              {w.birds}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">birds ready</p>
          </div>
        ))}
        <div className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Open market
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {opsSummary?.openLotBirds ?? "—"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">birds left</p>
        </div>
        <div className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Booked
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {opsSummary?.committedThisWeek ?? "—"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">this week</p>
        </div>
        <div className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Unpaid
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-[var(--text-primary)]">
            {opsSummary != null ? formatRwf(opsSummary.accruedUnpaidRwf) : "—"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">commissions</p>
        </div>
        <Link
          to={companyHref("/market/jobs")}
          className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Exceptions
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {opsSummary?.openExceptions ?? "—"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">open handovers</p>
        </Link>
        <Link
          to={companyHref("/market/leads")}
          className="min-w-[7.5rem] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            New leads
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {opsSummary?.newLeads ?? "—"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">public requests</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to={companyHref("/market/verify")}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[var(--primary-color)] px-3 text-sm font-semibold text-white"
        >
          Verify queue
        </Link>
        <Link
          to={companyHref("/market/jobs")}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)]"
        >
          Jobs
        </Link>
        <Link
          to={companyHref("/market/leads")}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)]"
        >
          Leads
        </Link>
        <Link
          to={companyHref("/market/rates")}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)]"
        >
          Rates
        </Link>
        <Button type="button" className="min-h-12" variant="secondary" onClick={() => setDemandOpen(true)}>
          Legacy demand
        </Button>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <PageTabs
            value={tab}
            onChange={(v) => setTab(v as typeof tab)}
            options={[
              { value: "lots", label: "Lots", badge: openLots.length },
              { value: "demand", label: "Demand", badge: openDemands.length },
              { value: "matches", label: "Matches", badge: matches.length },
            ]}
          />

          {tab === "lots" && (
            <div className="space-y-3">
              <SegmentedControl
                label="Forward book"
                value={lotPhase}
                options={[
                  { value: "all", label: "All" },
                  { value: "visit_due", label: "Visit due" },
                  { value: "weighed", label: "Weighed" },
                  { value: "live", label: "Live" },
                ]}
                onChange={(v) => setLotPhase(v as typeof lotPhase)}
              />
              {openLots.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-[var(--border-color)] p-4 text-sm text-[var(--text-muted)]">
                  <p>No open lots yet. Scout inventory or wait for a farm to opt in.</p>
                  <Link
                    to={companyHref("/farm/pipeline/scout?mode=offplatform")}
                    className="inline-flex min-h-12 items-center font-semibold text-[var(--primary-color-dark)]"
                  >
                    Scout off-platform →
                  </Link>
                </div>
              ) : (
                openLots.map((lot) => {
                  const rem = lot.remainingBirds ?? lot.birdCount;
                  return (
                    <article
                      key={lot.id}
                      className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
                            {lot.farmLabel || lot.breedCode || "Lot"}
                          </h2>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {sourceLabel(lot.source)} · {statusLabel(lot.status)}
                            {lot.district ? ` · ${lot.district}` : ""}
                          </p>
                          <div className="mt-1">
                            <StatusPill tone={listingPhaseCopy(lot.listingPhase).tone}>
                              {listingPhaseCopy(lot.listingPhase).label}
                            </StatusPill>
                          </div>
                        </div>
                        <p className="shrink-0 text-right">
                          <span className="block text-xl font-semibold tabular-nums text-[var(--text-primary)]">
                            {rem}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)]">birds</span>
                        </p>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <dt className="text-[11px] text-[var(--text-muted)]">Selling week</dt>
                          <dd className="font-medium text-[var(--text-primary)]">
                            {formatDay(lot.readyFrom)} → {formatDay(lot.readyTo)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-[var(--text-muted)]">Weight</dt>
                          <dd className="font-medium text-[var(--text-primary)]">
                            {formatKg(lot.avgWeightKg)} → ~{formatKg(lot.expectedWeightKg)}
                          </dd>
                        </div>
                        {lot.askPricePerKg != null ? (
                          <div className="col-span-2">
                            <dt className="text-[11px] text-[var(--text-muted)]">Ask</dt>
                            <dd className="font-medium text-[var(--text-primary)]">
                              RWF {lot.askPricePerKg}/kg
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      {(lot.farmerCanSlaughter || lot.deliveryAvailable) && (
                        <p className="mt-2 text-xs text-[var(--text-secondary)]">
                          {[
                            lot.farmerCanSlaughter ? "Can slaughter" : null,
                            lot.deliveryAvailable ? "Delivery available" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}

                      <div className="mt-3 flex gap-2">
                        {lot.source === "managed_flock" ? (
                          <Button
                            type="button"
                            className="min-h-12 flex-1"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void refreshLot(lot)}
                          >
                            Refresh
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          className="min-h-12 flex-1"
                          onClick={() => {
                            setMatchLot(lot);
                            setMatchForm({
                              buyerId: buyers[0]?.id ?? "",
                              demandId: "",
                              birds: String(rem),
                              agreedPricePerKg:
                                lot.askPricePerKg != null ? String(lot.askPricePerKg) : "",
                              readyDate: formatDay(lot.readyFrom),
                            });
                          }}
                        >
                          Match
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {tab === "demand" && (
            <div className="space-y-3">
              {openDemands.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No open demand. Log a WhatsApp ask above.
                </p>
              ) : (
                openDemands.map((d) => (
                  <article
                    key={d.id}
                    className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold text-[var(--text-primary)]">{d.buyerName}</h2>
                      <p className="text-right">
                        <span className="block text-xl font-semibold tabular-nums">{d.birdsNeeded}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">needed</span>
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {[
                        d.districtPreference,
                        d.weightKgMin != null || d.weightKgMax != null
                          ? `${d.weightKgMin ?? "?"}–${d.weightKgMax ?? "?"} kg`
                          : null,
                        d.neededFrom || d.neededTo
                          ? `${formatDay(d.neededFrom)} → ${formatDay(d.neededTo)}`
                          : null,
                        d.filledBirds ? `${d.filledBirds} filled` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {d.rawNotes ? (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                        {d.rawNotes}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          )}

          {tab === "matches" && (
            <div className="space-y-3">
              {matches.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No matches yet.</p>
              ) : (
                matches.map((m) => (
                  <article
                    key={m.id}
                    className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4"
                  >
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      {m.buyerName}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {m.lotFarmLabel || m.lotDistrict || "Lot"} · {m.birds} birds
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {matchStatusLabel(m.status)}
                      {m.agreedPricePerKg != null ? ` · RWF ${m.agreedPricePerKg}/kg` : ""}
                    </p>
                    {m.status === "committed" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          className="min-h-12 flex-1"
                          onClick={() => {
                            setDeliverMatch(m);
                            setDeliverForm({ avgWeightKg: "", learningNotes: "" });
                          }}
                        >
                          Delivered
                        </Button>
                        <Button
                          type="button"
                          className="min-h-12 flex-1"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void markFailed(m)}
                        >
                          Failed
                        </Button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!matchLot}
        onClose={() => setMatchLot(null)}
        title="Commit match"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setMatchLot(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !matchForm.buyerId || !matchForm.birds}
              onClick={() => void submitMatch()}
            >
              {busy ? "Saving…" : "Commit"}
            </Button>
          </>
        }
      >
        {matchLot && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {matchLot.farmLabel || "Lot"} · {matchLot.remainingBirds ?? matchLot.birdCount} birds ·
              ready {formatDay(matchLot.readyFrom)} → {formatDay(matchLot.readyTo)} ·{" "}
              {formatKg(matchLot.avgWeightKg)}
            </p>
            <Field label="Buyer">
              <select
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={matchForm.buyerId}
                onChange={(e) => setMatchForm((f) => ({ ...f, buyerId: e.target.value }))}
              >
                <option value="">Select…</option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.district ? ` (${b.district})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Link demand (optional)">
              <select
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={matchForm.demandId}
                onChange={(e) => setMatchForm((f) => ({ ...f, demandId: e.target.value }))}
              >
                <option value="">None</option>
                {openDemands.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.buyerName} — {d.birdsNeeded} birds
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Birds">
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={matchForm.birds}
                onChange={(e) => setMatchForm((f) => ({ ...f, birds: e.target.value }))}
              />
            </Field>
            <Field label="Agreed RWF/kg">
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={matchForm.agreedPricePerKg}
                onChange={(e) => setMatchForm((f) => ({ ...f, agreedPricePerKg: e.target.value }))}
              />
            </Field>
            <Field label="Ready date">
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={matchForm.readyDate}
                onChange={(e) => setMatchForm((f) => ({ ...f, readyDate: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={demandOpen}
        onClose={() => setDemandOpen(false)}
        title="Log buyer demand"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDemandOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !demandForm.buyerId || !demandForm.birdsNeeded}
              onClick={() => void submitDemand()}
            >
              {busy ? "Saving…" : "Save demand"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Buyer">
            <select
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={demandForm.buyerId}
              onChange={(e) => setDemandForm((f) => ({ ...f, buyerId: e.target.value }))}
            >
              <option value="">Select…</option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-[var(--text-muted)]">
            Need a new buyer?{" "}
            <Link to={companyHref("/farm/pipeline/buyers")} className="underline">
              Open Buyer CRM
            </Link>
          </p>
          <Field label="Birds needed">
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={demandForm.birdsNeeded}
              onChange={(e) => setDemandForm((f) => ({ ...f, birdsNeeded: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Weight min kg">
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={demandForm.weightKgMin}
                onChange={(e) => setDemandForm((f) => ({ ...f, weightKgMin: e.target.value }))}
              />
            </Field>
            <Field label="Weight max kg">
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={demandForm.weightKgMax}
                onChange={(e) => setDemandForm((f) => ({ ...f, weightKgMax: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Needed from">
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={demandForm.neededFrom}
                onChange={(e) => setDemandForm((f) => ({ ...f, neededFrom: e.target.value }))}
              />
            </Field>
            <Field label="Needed to">
              <input
                type="date"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={demandForm.neededTo}
                onChange={(e) => setDemandForm((f) => ({ ...f, neededTo: e.target.value }))}
              />
            </Field>
          </div>
          <DistrictSelect
            value={demandForm.districtPreference}
            onChange={(districtPreference) => setDemandForm((f) => ({ ...f, districtPreference }))}
          />
          <Field label="WhatsApp / call notes">
            <textarea
              rows={3}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={demandForm.rawNotes}
              onChange={(e) => setDemandForm((f) => ({ ...f, rawNotes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!deliverMatch}
        onClose={() => setDeliverMatch(null)}
        title="Settle trade"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeliverMatch(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                busy || (deliverMatch?.lotSource === "managed_flock" && !deliverForm.avgWeightKg)
              }
              onClick={() => void markDelivered()}
            >
              {busy ? "Saving…" : "Confirm delivered"}
            </Button>
          </>
        }
      >
        {deliverMatch && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {deliverMatch.buyerName} · {deliverMatch.birds} birds
              {deliverMatch.lotSource === "managed_flock"
                ? " — will create a poultry sales order."
                : " — scout lot (no sales order)."}
            </p>
            {deliverMatch.lotSource === "managed_flock" && (
              <Field label="Avg weight kg (for sales order)">
                <input
                  type="number"
                  step="0.01"
                  min={0.1}
                  required
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                  value={deliverForm.avgWeightKg}
                  onChange={(e) => setDeliverForm((f) => ({ ...f, avgWeightKg: e.target.value }))}
                />
              </Field>
            )}
            <Field label="Learning notes (transport, no-show, variance)">
              <textarea
                rows={3}
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={deliverForm.learningNotes}
                onChange={(e) => setDeliverForm((f) => ({ ...f, learningNotes: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
