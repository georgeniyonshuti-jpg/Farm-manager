import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction, flockActionPresentation } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge, type CheckinBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";
import { useToast } from "../../components/Toast";
import { useReferenceOptions } from "../../hooks/useReferenceOptions";

const FALLBACK_BREED_OPTIONS = [
  { value: "generic_broiler", label: "generic_broiler" },
  { value: "cobb_500", label: "cobb_500" },
  { value: "ross_308", label: "ross_308" },
];

type FlockRow = {
  id: string;
  label: string;
  placementDate: string;
  status?: string;
  checkinBadge?: CheckinBadge;
  nextDueAt?: string;
  ageDays?: number;
  intervalHours?: number;
  latestFcr?: number | null;
  withdrawalActive?: boolean;
  overdueRounds?: number;
  mortality7d?: number;
  topIssue?: string;
  riskScore?: number;
  riskClass?: "healthy" | "watch" | "at_risk" | "critical";
  needsRole?: string;
  latestWeightKg?: number | null;
  expectedWeightKg?: number;
  weightDeviationPct?: number;
  mortalityRatePct?: number;
  mortality24hDeltaPct?: number;
  expectedFcrRange?: { min: number; max: number };
  fcrDeviation?: number | null;
  dataFreshnessScore?: number;
  timeStatus?: { label: string; severity: "healthy" | "warning" | "critical" | "watch"; overdueHours: number };
  trends?: { mortality: string; weight: string; fcr: string };
  alerts?: string[];
  failedReason?: string;
  projections?: {
    projectedHarvestWeightKg?: number | null;
    projectedHarvestDeltaPct?: number | null;
    projectedMortalityPct?: number;
  };
};
type BarnSummary = {
  barn: string;
  flockCount: number;
  blockedFlocks: number;
  overdueRounds: number;
  mortality7d: number;
  avgFcr: number | null;
};

export function FlockListPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const breedOptions = useReferenceOptions("breed", token, FALLBACK_BREED_OPTIONS);
  const canCreateFlock = canFlockAction(user, "flock.create");
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [barns, setBarns] = useState<BarnSummary[]>([]);
  const [riskFilter, setRiskFilter] = useState<"all" | "at_risk" | "blocked" | "needs_vet" | "needs_manager" | "overdue_checkins">("all");
  const [focusMode, setFocusMode] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [farmHealthScore, setFarmHealthScore] = useState<number | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [showCreateFlock, setShowCreateFlock] = useState(false);
  const [purgeBusyId, setPurgeBusyId] = useState<string | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [retryBusyId, setRetryBusyId] = useState<string | null>(null);
  const [deleteFailedBusyId, setDeleteFailedBusyId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    placementDate: new Date().toISOString().slice(0, 10),
    initialCount: "",
    breedCode: "generic_broiler",
    targetWeightKg: "",
    purchaseCostRwf: "",
    purchaseSupplier: "",
    purchaseDate: "",
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const listQ =
        user?.role === "superuser" || user?.role === "manager" || user?.role === "vet_manager"
          ? `?includeArchived=true${user?.role === "superuser" ? "&includeFailed=true" : ""}`
          : "";
      const r = await fetch(`${API_BASE_URL}/api/flocks${listQ}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      const base = (d.flocks as FlockRow[]) ?? [];
      const enriched = await Promise.all(
        base.map(async (f) => {
          try {
            const er = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(f.id)}/eligibility`, {
              headers: readAuthHeaders(token),
            });
            const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
            return {
              ...f,
              latestFcr: null,
              withdrawalActive: !Boolean((ed as { eligibleForSlaughter?: boolean }).eligibleForSlaughter ?? true),
              overdueRounds: 0,
              mortality7d: 0,
              topIssue: "",
              riskScore: 0,
              needsRole: "vet",
            };
          } catch {
            return { ...f, latestFcr: null, withdrawalActive: false };
          }
        })
      );
      setFlocks(enriched);
      try {
        const br = await fetch(`${API_BASE_URL}/api/farm/ops-board`, { headers: readAuthHeaders(token) });
        const bd = await br.json().catch(() => ({ barns: [], flocks: [], insights: [] }));
        if (br.ok) {
          setBarns((bd.barns as BarnSummary[]) ?? []);
          setInsights(((bd as { insights?: string[] }).insights) ?? []);
          setFarmHealthScore((bd as { farmHealthScore?: number }).farmHealthScore ?? null);
          type OpsRow = {
            flockId: string;
            label?: string;
            ageDays?: number;
            latestFcr?: number | null;
            latestWeightKg?: number | null;
            expectedWeightKg?: number;
            weightDeviationPct?: number;
            mortalityRatePct?: number;
            mortality24hDeltaPct?: number;
            overdueRounds?: number;
            withdrawalBlockers?: number;
            mortality7d?: number;
            expectedFcrRange?: { min: number; max: number };
            fcrDeviation?: number | null;
            riskScore?: number;
            riskClass?: "healthy" | "watch" | "at_risk" | "critical";
            topIssue?: string;
            needsRole?: string;
            dataFreshnessScore?: number;
            timeStatus?: FlockRow["timeStatus"];
            trends?: FlockRow["trends"];
            alerts?: string[];
            projections?: FlockRow["projections"];
          };
          const boardFlocks = (((bd as { flocks?: OpsRow[] }).flocks) ?? []);
          const byFlock = new Map(boardFlocks.map((x) => [x.flockId, x]));
          setFlocks((prev) => {
            const merged = prev.map((p) => {
              const o = byFlock.get(p.id);
              if (!o) return p;
              return {
                ...p,
                label: o.label ?? p.label,
                ageDays: o.ageDays ?? p.ageDays,
                latestFcr: p.latestFcr ?? (o.latestFcr ?? null),
                latestWeightKg: o.latestWeightKg ?? null,
                expectedWeightKg: o.expectedWeightKg,
                weightDeviationPct: o.weightDeviationPct,
                mortalityRatePct: o.mortalityRatePct,
                mortality24hDeltaPct: o.mortality24hDeltaPct,
                overdueRounds: Number(o.overdueRounds ?? 0),
                mortality7d: Number(o.mortality7d ?? 0),
                withdrawalActive: Number(o.withdrawalBlockers ?? 0) > 0 || Boolean(p.withdrawalActive),
                expectedFcrRange: o.expectedFcrRange,
                fcrDeviation: o.fcrDeviation ?? null,
                riskScore: o.riskScore ?? 0,
                riskClass: o.riskClass,
                topIssue: o.topIssue ?? p.topIssue ?? "Stable",
                needsRole: o.needsRole ?? p.needsRole ?? "laborer",
                dataFreshnessScore: o.dataFreshnessScore,
                timeStatus: o.timeStatus,
                trends: o.trends,
                alerts: o.alerts ?? [],
                projections: o.projections,
              } as FlockRow;
            });
            const seen = new Set(merged.map((m) => m.id));
            for (const o of boardFlocks) {
              if (seen.has(o.flockId)) continue;
              merged.push({
                id: o.flockId,
                label: o.label ?? `Flock ${o.flockId.slice(0, 8)}`,
                placementDate: "",
                ageDays: o.ageDays,
                latestFcr: o.latestFcr ?? null,
                latestWeightKg: o.latestWeightKg ?? null,
                expectedWeightKg: o.expectedWeightKg,
                weightDeviationPct: o.weightDeviationPct,
                mortalityRatePct: o.mortalityRatePct,
                mortality24hDeltaPct: o.mortality24hDeltaPct,
                overdueRounds: Number(o.overdueRounds ?? 0),
                mortality7d: Number(o.mortality7d ?? 0),
                withdrawalActive: Number(o.withdrawalBlockers ?? 0) > 0,
                expectedFcrRange: o.expectedFcrRange,
                fcrDeviation: o.fcrDeviation ?? null,
                riskScore: o.riskScore ?? 0,
                riskClass: o.riskClass,
                topIssue: o.topIssue ?? "Stable",
                needsRole: o.needsRole ?? "laborer",
                dataFreshnessScore: o.dataFreshnessScore,
                timeStatus: o.timeStatus,
                trends: o.trends,
                alerts: o.alerts ?? [],
                projections: o.projections,
              });
            }
            return merged.sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0));
          });
        } else {
          setBarns([]);
          setInsights([]);
          setFarmHealthScore(null);
        }
      } catch {
        setBarns([]);
        setInsights([]);
        setFarmHealthScore(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreateFlock(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreateFlock) return;
    setCreateBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          placementDate: createForm.placementDate,
          initialCount: Number(createForm.initialCount),
          breedCode: createForm.breedCode.trim().toLowerCase(),
          targetWeightKg: createForm.targetWeightKg ? Number(createForm.targetWeightKg) : null,
          status: "active",
          purchaseCostRwf: createForm.purchaseCostRwf ? Number(createForm.purchaseCostRwf) : undefined,
          purchaseSupplier: createForm.purchaseSupplier.trim() || undefined,
          purchaseDate: createForm.purchaseDate || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = (d as { error?: string; detail?: string }).error ?? "Failed to create flock";
        const detail = (d as { detail?: string }).detail;
        throw new Error(detail ? `${err} — ${detail}` : err);
      }
      const created = d as { flock?: { label?: string; code?: string | null } };
      const name = created.flock?.label ?? created.flock?.code ?? "Flock";
      const costMsg = createForm.purchaseCostRwf
        ? " Biological asset opening is being posted to Odoo under IAS 41."
        : "";
      showToast("success", `Flock ${name} added.${costMsg}`);
      setCreateForm((prev) => ({ ...prev, initialCount: "", targetWeightKg: "", purchaseCostRwf: "", purchaseSupplier: "", purchaseDate: "" }));
      setShowCreateFlock(false);
      await load();
    } catch (e2) {
      showToast("error", e2 instanceof Error ? e2.message : "Failed to create flock");
    } finally {
      setCreateBusy(false);
    }
  }

  async function archiveFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    if (!window.confirm(`Archive flock ${label}? It will be hidden from field staff selectors.`)) return;
    setArchiveBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/archive`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Archive failed");
      showToast("success", `${label} archived`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Archive failed");
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function purgeFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    const confirmPhrase = window.prompt(`Type PURGE to permanently delete ${label}`);
    if (confirmPhrase !== "PURGE") return;
    setPurgeBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/purge`, {
        method: "DELETE",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Purge failed");
      showToast("success", `${label} purged`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Purge failed");
    } finally {
      setPurgeBusyId(null);
    }
  }

  async function retryFailedFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    setRetryBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/retry-create`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Retry create failed");
      showToast("success", `${label} retried and recreated`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Retry create failed");
    } finally {
      setRetryBusyId(null);
    }
  }

  async function deleteFailedFlock(flockId: string, label: string) {
    if (user?.role !== "superuser") return;
    const confirmPhrase = window.prompt(`Type DELETE FAILED to remove ${label}`);
    if (confirmPhrase !== "DELETE FAILED") return;
    setDeleteFailedBusyId(flockId);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/failed`, {
        method: "DELETE",
        headers: jsonAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Delete failed flock failed");
      showToast("success", `${label} removed`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Delete failed flock failed");
    } finally {
      setDeleteFailedBusyId(null);
    }
  }

  const visibleFlocks = flocks.filter((f) => {
    if (riskFilter === "all") return true;
    if (riskFilter === "blocked") return Boolean(f.withdrawalActive);
    if (riskFilter === "at_risk") return Number(f.riskScore ?? 0) > 60;
    if (riskFilter === "needs_vet") return f.needsRole === "vet";
    if (riskFilter === "needs_manager") return f.needsRole === "vet_manager";
    if (riskFilter === "overdue_checkins") return (f.timeStatus?.overdueHours ?? 0) > 0;
    return true;
  }).filter((f) => (focusMode ? Number(f.riskScore ?? 0) > 60 : true))
    .sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Flocks"
        subtitle="Real-time flock risk prioritization with explainable alerts."
        action={
          <a
            href={`${API_BASE_URL}/api/reports/flocks.csv`}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            download
          >
            Export CSV
          </a>
        }
      />
      {farmHealthScore != null ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 text-sm shadow-[var(--shadow-sm)]">
          <p className="font-semibold text-[var(--text-primary)]">Farm health score: {farmHealthScore}/100</p>
          {!!insights.length ? <p className="mt-1 text-[var(--text-secondary)]">{insights[0]}</p> : null}
        </div>
      ) : null}
      {canCreateFlock ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreateFlock((v) => !v)}
            className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)]"
          >
            {showCreateFlock ? "Close" : "Create new flock"}
          </button>
        </div>
      ) : null}

      {canCreateFlock && showCreateFlock ? (
        <form onSubmit={(e) => void submitCreateFlock(e)} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Add purchased flock</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">The system assigns a unique flock name (e.g. FL-000042).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              type="date"
              value={createForm.placementDate}
              onChange={(e) => setCreateForm((v) => ({ ...v, placementDate: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Initial birds"
              inputMode="numeric"
              value={createForm.initialCount}
              onChange={(e) => setCreateForm((v) => ({ ...v, initialCount: e.target.value }))}
              required
            />
            <select
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              value={createForm.breedCode}
              onChange={(e) => setCreateForm((v) => ({ ...v, breedCode: e.target.value }))}
            >
              {breedOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Target kg (optional)"
              inputMode="decimal"
              value={createForm.targetWeightKg}
              onChange={(e) => setCreateForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
            />
          </div>
          <p className="mt-4 text-xs font-semibold text-[var(--text-secondary)]">Biological asset cost (IAS 41 — optional)</p>
          <p className="text-xs text-[var(--text-muted)]">Enter total purchase cost only. Cost per chick is computed automatically and posted to Odoo.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Total purchase cost (RWF)"
              inputMode="decimal"
              value={createForm.purchaseCostRwf}
              onChange={(e) => setCreateForm((v) => ({ ...v, purchaseCostRwf: e.target.value }))}
            />
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="Supplier / hatchery"
              value={createForm.purchaseSupplier}
              onChange={(e) => setCreateForm((v) => ({ ...v, purchaseSupplier: e.target.value }))}
            />
            <input
              className="rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
              type="date"
              title="Purchase date"
              value={createForm.purchaseDate}
              onChange={(e) => setCreateForm((v) => ({ ...v, purchaseDate: e.target.value }))}
            />
          </div>
          {createForm.purchaseCostRwf && createForm.initialCount ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Estimated cost per chick:{" "}
              <strong>
                {(Number(createForm.purchaseCostRwf) / Math.max(1, Number(createForm.initialCount))).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                RWF
              </strong>
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={createBusy || !createForm.placementDate || !createForm.initialCount}
              className="rounded-lg bg-[var(--primary-color)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
            >
              {createBusy ? "Saving..." : "Add flock"}
            </button>
          </div>
        </form>
      ) : null}

      {loading && <SkeletonList rows={4} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && flocks.length === 0 && (
        <EmptyState
          title="No flocks yet"
          description="Add your first flock to get started."
        />
      )}

      {!loading && !error && flocks.length > 0 ? (
        <>
          {!!barns.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {barns.map((b) => (
                <div key={b.barn} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)] text-xs">
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{b.barn}</p>
                  <p className="text-[var(--text-muted)]">{b.flockCount} active flock(s)</p>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <span className="text-[var(--text-muted)]">Avg FCR</span>
                    <span className="font-semibold text-right tabular-nums">{b.avgFcr != null ? b.avgFcr.toFixed(2) : "—"}</span>
                    <span className="text-[var(--text-muted)]">Blocked</span>
                    <span className={["font-semibold text-right", b.blockedFlocks > 0 ? "text-red-400" : ""].join(" ")}>{b.blockedFlocks}</span>
                    <span className="text-[var(--text-muted)]">Overdue rounds</span>
                    <span className={["font-semibold text-right", b.overdueRounds > 0 ? "text-amber-400" : ""].join(" ")}>{b.overdueRounds}</span>
                    <span className="text-[var(--text-muted)]">Mortality 7d</span>
                    <span className={["font-semibold text-right", b.mortality7d > 0 ? "text-amber-400" : ""].join(" ")}>{b.mortality7d}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="table-block">
            <div className="table-toolbar">
              <button
                type="button"
                onClick={() => setFocusMode((v) => !v)}
                className={[
                  "rounded border px-2.5 py-1.5 text-xs font-semibold",
                  focusMode
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-[var(--border-color)] bg-[var(--surface-input)] text-[var(--text-secondary)]",
                ].join(" ")}
              >
                Focus Mode {focusMode ? "ON" : "OFF"}
              </button>
              {([
                ["all", "All"],
                ["at_risk", "At risk"],
                ["blocked", "Blocked"],
                ["needs_vet", "Needs vet"],
                ["needs_manager", "Needs manager"],
                ["overdue_checkins", "Overdue check-ins"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRiskFilter(id as typeof riskFilter)}
                  className={[
                    "rounded border px-2.5 py-1.5 text-xs font-semibold",
                    riskFilter === id
                      ? "border-[var(--primary-color)] bg-[var(--primary-color-soft)] text-[var(--primary-color-dark)]"
                      : "border-[var(--border-color)] bg-[var(--surface-input)] text-[var(--text-secondary)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">{visibleFlocks.length} flocks</span>
                <button
                  type="button"
                  onClick={() => {
                    const highest = [...visibleFlocks].sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0))[0];
                    if (highest) window.location.href = `/farm/flocks/${highest.id}`;
                  }}
                  className="rounded border border-[var(--border-color)] bg-[var(--surface-input)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                >
                  Jump to highest risk
                </button>
              </span>
            </div>

            <div className="institutional-table-wrapper">
              <table className="institutional-table min-w-[72rem]">
                <thead>
                  <tr>
                    <th>Flock</th>
                    <th className="tbl-num">Age (d)</th>
                    <th className="tbl-num">Interval (h)</th>
                    <th className="tbl-num">FCR</th>
                    <th className="tbl-num">FCR vs target</th>
                    <th className="tbl-num">Risk score</th>
                    <th className="tbl-num">Wt (kg)</th>
                    <th className="tbl-num">Wt dev %</th>
                    <th className="tbl-num">Mort. 7d</th>
                    <th>Check-in</th>
                    <th>Flags</th>
                    <th className="tbl-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFlocks.map((f) => (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap">
                        {f.status === "failed" ? (
                          <span className="font-semibold text-red-300" title={f.failedReason ?? "Creation failed"}>
                            {f.label}
                          </span>
                        ) : (
                          <Link to={`/farm/flocks/${f.id}`} className="font-semibold text-emerald-800 hover:underline">
                            {f.label}
                          </Link>
                        )}
                      </td>
                      <td className="tbl-num">{f.ageDays ?? "—"}</td>
                      <td className="tbl-num">{f.intervalHours ?? "—"}</td>
                      <td className="tbl-num">{f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</td>
                      <td className={["tbl-num", f.fcrDeviation != null && f.fcrDeviation > 0.2 ? "text-red-400 font-semibold" : ""].join(" ")}>
                        {f.fcrDeviation != null ? `${f.fcrDeviation >= 0 ? "+" : ""}${f.fcrDeviation.toFixed(2)}` : "—"}
                      </td>
                      <td className={["tbl-num font-semibold", Number(f.riskScore ?? 0) > 60 ? "text-red-400" : Number(f.riskScore ?? 0) > 30 ? "text-amber-400" : "text-emerald-400"].join(" ")}>
                        {f.riskScore ?? 0}
                      </td>
                      <td className="tbl-num">{f.latestWeightKg != null ? f.latestWeightKg.toFixed(2) : "—"}</td>
                      <td className={["tbl-num", (f.weightDeviationPct ?? 0) < -5 ? "text-red-400 font-semibold" : ""].join(" ")}>
                        {f.weightDeviationPct != null ? `${(f.weightDeviationPct >= 0 ? "+" : "")}${f.weightDeviationPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className={["tbl-num", (f.mortality7d ?? 0) > 0 ? "text-amber-400 font-semibold" : ""].join(" ")}>
                        {f.mortality7d ?? 0}
                      </td>
                      <td className="tbl-badge">
                        {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {f.status === "archived" ? (
                            <span className="inline-flex rounded-full border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                              Archived
                            </span>
                          ) : null}
                          {f.status === "failed" ? (
                            <span className="inline-flex rounded-full border border-red-500/35 bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                              Failed create
                            </span>
                          ) : null}
                          {f.withdrawalActive ? <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">Withdrawal</span> : null}
                          {(f.overdueRounds ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Overdue ×{f.overdueRounds}</span> : null}
                          {(f.alerts?.length ?? 0) > 0 ? <span className="text-[10px] text-amber-800">{f.alerts?.[0]}</span> : null}
                          {!f.withdrawalActive && !(f.overdueRounds) && !(f.alerts?.length) && f.status !== "archived" && f.status !== "failed" ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tbl-actions">
                        <div className="flex flex-wrap gap-2 justify-center">
                          {flockActionPresentation(user, "treatment.execute").mode === "enabled" ? (
                            <Link to="/farm/treatments" className="text-xs font-medium text-emerald-800 hover:underline">
                              Resolve
                            </Link>
                          ) : null}
                          {flockActionPresentation(user, "slaughter.schedule").mode === "enabled" ? (
                            <Link to="/farm/slaughter" className="text-xs font-medium text-emerald-800 hover:underline">
                              Slaughter
                            </Link>
                          ) : null}
                          {user?.role === "superuser" && f.status !== "archived" && f.status !== "failed" ? (
                            <button
                              type="button"
                              disabled={archiveBusyId === f.id}
                              onClick={() => void archiveFlock(f.id, f.label)}
                              className="rounded border border-amber-500/35 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
                            >
                              {archiveBusyId === f.id ? "…" : "Archive"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" ? (
                            <button
                              type="button"
                              disabled={purgeBusyId === f.id || f.status === "failed"}
                              onClick={() => void purgeFlock(f.id, f.label)}
                              className="rounded border border-red-500/35 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              {purgeBusyId === f.id ? "…" : "Purge"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" && f.status === "failed" ? (
                            <button
                              type="button"
                              disabled={retryBusyId === f.id}
                              onClick={() => void retryFailedFlock(f.id, f.label)}
                              className="rounded border border-emerald-500/35 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                            >
                              {retryBusyId === f.id ? "…" : "Retry create"}
                            </button>
                          ) : null}
                          {user?.role === "superuser" && f.status === "failed" ? (
                            <button
                              type="button"
                              disabled={deleteFailedBusyId === f.id}
                              onClick={() => void deleteFailedFlock(f.id, f.label)}
                              className="rounded border border-red-500/35 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              {deleteFailedBusyId === f.id ? "…" : "Delete failed"}
                            </button>
                          ) : null}
                          {flockActionPresentation(user, "treatment.execute").mode !== "enabled" &&
                          flockActionPresentation(user, "slaughter.schedule").mode !== "enabled" &&
                          user?.role !== "superuser" ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
