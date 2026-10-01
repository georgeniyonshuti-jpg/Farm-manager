import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import {
  Button,
  DataTable,
  type DataColumn,
  Field,
  Modal,
  SegmentedControl,
  StatusPill,
  TableToolbar,
} from "../../../components/ui";
import {
  createPipelineMatch,
  fetchPipelineBuyers,
  fetchPipelineForwardSummary,
  fetchPipelineLots,
  fetchPipelineMatches,
  refreshPipelineLot,
  updatePipelineMatch,
  type PipelineBuyer,
  type PipelineLot,
  type PipelineMatch,
} from "../../../api/pipeline.api";
import { listingPhaseCopy } from "../../../lib/sellingWeek";
import {
  DEMO_BUYERS,
  DEMO_FORWARD,
  DEMO_LOTS,
  DEMO_MATCHES,
  isMarketDemoEligibleError,
} from "./demoMarketData";
import { useMarketDemoFlag } from "./useMarketDemoFlag";

type LotPhase = "all" | "visit_due" | "weighed" | "live";

function formatKg(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} kg`;
}

function formatDay(d: string | null | undefined) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

export function BookPanel() {
  const { token } = useAuth();
  const { companyHref } = useCompanyNav();
  const { showToast } = useToast();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lotPhase, setLotPhase] = useState<LotPhase>("all");
  const [view, setView] = useState<"lots" | "matches">("lots");
  const [lots, setLots] = useState<PipelineLot[]>([]);
  const [matches, setMatches] = useState<PipelineMatch[]>([]);
  const [buyers, setBuyers] = useState<PipelineBuyer[]>([]);
  const [forward, setForward] = useState<Awaited<ReturnType<typeof fetchPipelineForwardSummary>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [matchLot, setMatchLot] = useState<PipelineLot | null>(null);
  const [matchForm, setMatchForm] = useState({
    buyerId: "",
    birds: "",
    agreedPricePerKg: "",
    readyDate: "",
  });

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setForward(DEMO_FORWARD);
        setLots(DEMO_LOTS);
        setMatches(DEMO_MATCHES);
        setBuyers(DEMO_BUYERS);
        setApiFailed(false);
        return;
      }
      const [f, l, m, b] = await Promise.all([
        fetchPipelineForwardSummary(token),
        fetchPipelineLots(token),
        fetchPipelineMatches(token),
        fetchPipelineBuyers(token),
      ]);
      setApiFailed(false);
      setForward(f);
      setLots(l.lots);
      setMatches(m.matches);
      setBuyers(b.buyers);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openLots = useMemo(() => {
    const open = lots.filter((l) => l.status === "open" || l.status === "partial" || l.status === "draft");
    if (lotPhase === "all") return open;
    return open.filter((l) => l.listingPhase === lotPhase);
  }, [lots, lotPhase]);

  async function submitMatch() {
    if (!matchLot) return;
    if (demo) {
      showToast("success", "Match committed (demo)");
      setMatchLot(null);
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      await createPipelineMatch(token, {
        lotId: matchLot.id,
        buyerId: matchForm.buyerId,
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

  async function refreshLot(lot: PipelineLot) {
    if (!token || lot.source !== "managed_flock") return;
    setBusy(true);
    try {
      await refreshPipelineLot(token, lot.id);
      showToast("success", "Lot refreshed");
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

  const lotColumns: DataColumn<PipelineLot>[] = useMemo(
    () => [
      {
        key: "farm",
        header: "Lot",
        sortable: true,
        render: (lot) => (
          <div className="min-w-0">
            <p className="font-semibold text-[var(--text-primary)]">{lot.farmLabel || lot.breedCode || "Lot"}</p>
            <p className="type-caption text-[var(--text-muted)]">
              {lot.source === "managed_flock" ? "Managed" : "Scout"}
              {lot.district ? ` · ${lot.district}` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "phase",
        header: "Phase",
        badge: true,
        render: (lot) => {
          const copy = listingPhaseCopy(lot.listingPhase);
          return <StatusPill tone={copy.tone}>{copy.label}</StatusPill>;
        },
      },
      {
        key: "birds",
        header: "Birds",
        numeric: true,
        render: (lot) => lot.remainingBirds ?? lot.birdCount,
      },
      {
        key: "week",
        header: "Selling week",
        render: (lot) => (
          <span className="tabular-nums text-[var(--text-secondary)]">
            {formatDay(lot.readyFrom)} → {formatDay(lot.readyTo)}
          </span>
        ),
      },
      {
        key: "weight",
        header: "Weight",
        render: (lot) => (
          <span className="tabular-nums">
            {formatKg(lot.avgWeightKg)} → ~{formatKg(lot.expectedWeightKg)}
          </span>
        ),
      },
      {
        key: "ask",
        header: "Ask",
        numeric: true,
        render: (lot) => (lot.askPricePerKg != null ? `${lot.askPricePerKg}` : "—"),
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (lot) => (
          <div className="flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {lot.source === "managed_flock" ? (
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => void refreshLot(lot)}>
                Refresh
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                setMatchLot(lot);
                setMatchForm({
                  buyerId: buyers[0]?.id ?? "",
                  birds: String(lot.remainingBirds ?? lot.birdCount),
                  agreedPricePerKg: lot.askPricePerKg != null ? String(lot.askPricePerKg) : "",
                  readyDate: formatDay(lot.readyFrom),
                });
              }}
            >
              Match
            </Button>
          </div>
        ),
      },
    ],
    [busy, buyers]
  );

  const matchColumns: DataColumn<PipelineMatch>[] = useMemo(
    () => [
      {
        key: "buyer",
        header: "Buyer",
        render: (m) => (
          <div>
            <p className="font-semibold">{m.buyerName ?? "Buyer"}</p>
            <p className="type-caption text-[var(--text-muted)]">{m.lotFarmLabel ?? m.lotId.slice(0, 8)}</p>
          </div>
        ),
      },
      { key: "birds", header: "Birds", numeric: true, render: (m) => m.birds },
      {
        key: "price",
        header: "RWF/kg",
        numeric: true,
        render: (m) => m.agreedPricePerKg ?? "—",
      },
      {
        key: "status",
        header: "Status",
        badge: true,
        render: (m) => <StatusPill tone={m.status === "committed" ? "warning" : m.status === "delivered" ? "success" : "neutral"}>{m.status}</StatusPill>,
      },
      {
        key: "actions",
        header: "Actions",
        className: "tbl-actions",
        render: (m) =>
          m.status === "committed" ? (
            <Button size="xs" variant="dangerGhost" disabled={busy} onClick={() => void markFailed(m)}>
              Fail
            </Button>
          ) : null,
      },
    ],
    [busy]
  );

  if (loading) return <SkeletonList rows={5} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  return (
    <div className="space-y-stack">
      {(forward?.weeks?.length ?? 0) > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {forward!.weeks.map((w) => (
            <div
              key={w.key}
              className="min-w-[6.5rem] shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
            >
              <p className="type-caption text-[var(--text-muted)]">{w.label}</p>
              <p className="font-semibold tabular-nums text-[var(--text-primary)]">{w.birds}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="table-block">
        {view === "lots" ? (
          <DataTable
            flush
            columns={lotColumns}
            rows={openLots}
            rowKey={(r) => r.id}
            isFiltered={lotPhase !== "all"}
            emptyTitle="No lots on the book"
            emptyAction={
              <Link to={companyHref("/farm/pipeline/scout?mode=offplatform")}>
                <Button size="sm" variant="secondary">
                  Scout lot
                </Button>
              </Link>
            }
            toolbar={
              <TableToolbar
                filters={
                  <>
                    <SegmentedControl
                      size="sm"
                      value={view}
                      onChange={(v) => setView(v === "matches" ? "matches" : "lots")}
                      options={[
                        { value: "lots", label: "Lots" },
                        { value: "matches", label: "Matches" },
                      ]}
                    />
                    <SegmentedControl
                      size="sm"
                      value={lotPhase}
                      onChange={(v) => setLotPhase(v as LotPhase)}
                      options={[
                        { value: "all", label: "All" },
                        { value: "visit_due", label: "Visit due" },
                        { value: "weighed", label: "Weighed" },
                        { value: "live", label: "Live" },
                      ]}
                    />
                  </>
                }
                meta={`${openLots.length} lot${openLots.length === 1 ? "" : "s"}`}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => void reload()}>
                    Refresh
                  </Button>
                }
              />
            }
          />
        ) : (
          <DataTable
            flush
            columns={matchColumns}
            rows={matches}
            rowKey={(r) => r.id}
            emptyTitle="No matches yet"
            toolbar={
              <TableToolbar
                filters={
                  <SegmentedControl
                    size="sm"
                    value={view}
                    onChange={(v) => setView(v === "matches" ? "matches" : "lots")}
                    options={[
                      { value: "lots", label: "Lots" },
                      { value: "matches", label: "Matches" },
                    ]}
                  />
                }
                meta={`${matches.length} match${matches.length === 1 ? "" : "es"}`}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => void reload()}>
                    Refresh
                  </Button>
                }
              />
            }
          />
        )}
      </div>

      <Modal open={matchLot != null} title="Commit match" onClose={() => setMatchLot(null)}>
        {matchLot ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitMatch();
            }}
          >
            <p className="text-sm tabular-nums text-[var(--text-primary)]">
              {matchLot.farmLabel || "Lot"} · {matchLot.remainingBirds ?? matchLot.birdCount} birds left
            </p>
            <Field label="Buyer">
              <select
                className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
                value={matchForm.buyerId}
                onChange={(e) => setMatchForm((v) => ({ ...v, buyerId: e.target.value }))}
                required
              >
                <option value="">Select buyer</option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Birds">
              <input
                className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
                inputMode="numeric"
                value={matchForm.birds}
                onChange={(e) => setMatchForm((v) => ({ ...v, birds: e.target.value }))}
                required
              />
            </Field>
            <Field label="Agreed RWF/kg (optional)">
              <input
                className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
                inputMode="decimal"
                value={matchForm.agreedPricePerKg}
                onChange={(e) => setMatchForm((v) => ({ ...v, agreedPricePerKg: e.target.value }))}
              />
            </Field>
            <Field label="Ready date">
              <input
                type="date"
                className="h-[var(--control-h-md)] w-full rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-sm"
                value={matchForm.readyDate}
                onChange={(e) => setMatchForm((v) => ({ ...v, readyDate: e.target.value }))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMatchLot(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={busy} loading={busy}>
                Commit
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
