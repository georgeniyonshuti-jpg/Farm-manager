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
  const isManagerView = user?.role === "manager" || user?.role === "superuser" || user?.role === "investor";
  const isVetView = user?.role === "vet" || user?.role === "vet_manager";
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
  const [createForm, setCreateForm] = useState({
    placementDate: new Date().toISOString().slice(0, 10),
    initialCount: "",
    breedCode: "generic_broiler",
    targetWeightKg: "",
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // ENV: moved to environment variable
      const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
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
  }, [token]);

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
      showToast("success", `Flock ${name} added`);
      setCreateForm((prev) => ({ ...prev, initialCount: "", targetWeightKg: "" }));
      await load();
    } catch (e2) {
      showToast("error", e2 instanceof Error ? e2.message : "Failed to create flock");
    } finally {
      setCreateBusy(false);
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
      />
      {farmHealthScore != null ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm shadow-sm">
          <p className="font-semibold text-neutral-900">Farm health score: {farmHealthScore}/100</p>
          {!!insights.length ? <p className="mt-1 text-neutral-700">{insights[0]}</p> : null}
        </div>
      ) : null}
      {canCreateFlock ? (
        <form onSubmit={(e) => void submitCreateFlock(e)} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">Add purchased flock</p>
          <p className="mt-1 text-xs text-neutral-600">The system assigns a unique flock name (e.g. FL-000042).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              type="date"
              value={createForm.placementDate}
              onChange={(e) => setCreateForm((v) => ({ ...v, placementDate: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Initial birds"
              inputMode="numeric"
              value={createForm.initialCount}
              onChange={(e) => setCreateForm((v) => ({ ...v, initialCount: e.target.value }))}
              required
            />
            <select
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Target kg (optional)"
              inputMode="decimal"
              value={createForm.targetWeightKg}
              onChange={(e) => setCreateForm((v) => ({ ...v, targetWeightKg: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={createBusy || !createForm.placementDate || !createForm.initialCount}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold",
                focusMode ? "border-red-700 bg-red-50 text-red-900" : "border-neutral-300 text-neutral-700",
              ].join(" ")}
            >
              Focus Mode {focusMode ? "ON" : "OFF"}
            </button>
            {[
              ["all", "All"],
              ["at_risk", "At risk"],
              ["blocked", "Blocked"],
              ["needs_vet", "Needs vet"],
              ["needs_manager", "Needs manager"],
              ["overdue_checkins", "Overdue check-ins"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRiskFilter(id as typeof riskFilter)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  riskFilter === id
                    ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                    : "border-neutral-300 text-neutral-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const highest = [...visibleFlocks].sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0))[0];
                if (highest) window.location.href = `/farm/flocks/${highest.id}`;
              }}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700"
            >
              Jump to highest risk flock
            </button>
          </div>

          {!!barns.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {barns.map((b) => (
                <div key={b.barn} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-sm">
                  <p className="font-semibold text-neutral-900">{b.barn}</p>
                  <p className="text-neutral-600">{b.flockCount} active flock(s)</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <p>Avg FCR: <span className="font-semibold text-neutral-800">{b.avgFcr != null ? b.avgFcr.toFixed(2) : "—"}</span></p>
                    <p>Blocked: <span className={b.blockedFlocks > 0 ? "font-semibold text-red-700" : "font-semibold text-neutral-800"}>{b.blockedFlocks}</span></p>
                    <p>Overdue rounds: <span className={b.overdueRounds > 0 ? "font-semibold text-amber-700" : "font-semibold text-neutral-800"}>{b.overdueRounds}</span></p>
                    <p>Mortality 7d: <span className={b.mortality7d > 0 ? "font-semibold text-amber-700" : "font-semibold text-neutral-800"}>{b.mortality7d}</span></p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ul className="space-y-3 sm:hidden">
            {visibleFlocks.map((f) => (
              <li key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/farm/flocks/${f.id}`} className="font-semibold text-emerald-900 hover:underline">
                    {f.label}
                  </Link>
                  {f.checkinBadge && <CheckinUrgencyBadge badge={f.checkinBadge} />}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Day {f.ageDays ?? "—"} · {f.timeStatus?.label ?? "Updated recently"}
                </p>
                <p className="mt-1 text-xs text-neutral-700">
                  Weight: {f.latestWeightKg != null ? `${f.latestWeightKg.toFixed(2)}kg` : "—"} ({(f.weightDeviationPct ?? 0) >= 0 ? "+" : ""}{(f.weightDeviationPct ?? 0).toFixed(1)}% vs expected)
                </p>
                <p className="mt-1 text-xs text-neutral-700">
                  Mortality {f.mortalityRatePct?.toFixed(2) ?? "0.00"}% ({(f.mortality24hDeltaPct ?? 0) >= 0 ? "+" : ""}{(f.mortality24hDeltaPct ?? 0).toFixed(2)}% last 24h)
                </p>
                <p className="mt-1 text-xs text-neutral-700">
                  FCR {f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"} ({f.fcrDeviation != null ? `${f.fcrDeviation >= 0 ? "+" : ""}${f.fcrDeviation.toFixed(2)} vs target` : "vs target —"})
                </p>
                <p className="mt-1 text-xs text-neutral-700">
                  Risk {f.riskScore ?? 0} · {f.riskClass ?? "healthy"} · {f.topIssue ?? "—"}
                </p>
                {!!f.trends ? (
                  <p className="mt-1 text-xs text-neutral-600">
                    Trends: M {f.trends.mortality} · W {f.trends.weight} · FCR {f.trends.fcr}
                  </p>
                ) : null}
                {isManagerView && f.projections?.projectedHarvestWeightKg != null ? (
                  <p className="mt-1 text-xs text-emerald-800">
                    Projected harvest: {f.projections.projectedHarvestWeightKg.toFixed(2)}kg ({(f.projections.projectedHarvestDeltaPct ?? 0) >= 0 ? "+" : ""}{(f.projections.projectedHarvestDeltaPct ?? 0).toFixed(1)}% vs target)
                  </p>
                ) : null}
                {isVetView ? (
                  <p className="mt-1 text-xs text-red-800">
                    Vet priority: mortality trend {f.trends?.mortality ?? "→ stable"} · projected mortality {(f.projections?.projectedMortalityPct ?? 0).toFixed(2)}%
                  </p>
                ) : null}
                {(f.alerts?.length ?? 0) > 0 ? <p className="mt-1 text-xs text-amber-800">{f.alerts?.slice(0, 2).join(" · ")}</p> : null}
                {f.withdrawalActive ? <p className="mt-1 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {flockActionPresentation(user, "treatment.execute").mode === "enabled" ? (
                    <Link to="/farm/treatments" className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                      Resolve round
                    </Link>
                  ) : null}
                  {flockActionPresentation(user, "slaughter.schedule").mode === "enabled" ? (
                    <Link to="/farm/slaughter" className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
                      Schedule slaughter
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="institutional-table-wrapper hidden overflow-x-auto sm:block">
            <table className="institutional-table min-w-full text-sm">
              <thead>
                <tr>
                  <th>Flock</th>
                  <th>Age (days)</th>
                  <th>Interval (h)</th>
                  <th>FCR</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleFlocks.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link to={`/farm/flocks/${f.id}`} className="font-medium text-emerald-800 hover:underline">
                        {f.label}
                      </Link>
                    </td>
                    <td>{f.ageDays ?? "—"}</td>
                    <td>{f.intervalHours ?? "—"}</td>
                    <td className="text-xs">
                      {f.latestFcr != null ? `${f.latestFcr.toFixed(2)} (${f.fcrDeviation != null ? `${f.fcrDeviation >= 0 ? "+" : ""}${f.fcrDeviation.toFixed(2)} vs target` : "target —"})` : "—"}
                    </td>
                    <td className="text-xs">
                      Risk <span className="font-semibold">{f.riskScore ?? 0}</span> · {f.timeStatus?.label ?? "updated"}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : null}
                        {f.withdrawalActive ? <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</span> : null}
                        {(f.overdueRounds ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Overdue {f.overdueRounds}</span> : null}
                        <span className="text-xs text-neutral-700">
                          {(f.latestWeightKg != null ? `${f.latestWeightKg.toFixed(2)}kg` : "—")} ({(f.weightDeviationPct ?? 0) >= 0 ? "+" : ""}{(f.weightDeviationPct ?? 0).toFixed(1)}%)
                        </span>
                        {(f.alerts?.length ?? 0) > 0 ? <span className="text-xs text-amber-800">{f.alerts?.[0]}</span> : null}
                        {!f.checkinBadge && !f.withdrawalActive ? "—" : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
