import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canFlockAction } from "../../auth/permissions";
import { readAuthHeaders } from "../../lib/authHeaders";
import { CheckinUrgencyBadge, type CheckinBadge } from "../../components/farm/CheckinUrgencyBadge";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";

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
  needsRole?: string;
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
  const [flocks, setFlocks] = useState<FlockRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [barns, setBarns] = useState<BarnSummary[]>([]);
  const [riskFilter, setRiskFilter] = useState<"all" | "at_risk" | "blocked" | "needs_vet" | "needs_manager">("all");

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
            const [wr, er] = await Promise.all([
              fetch(`${API_BASE_URL}/api/weigh-ins/${encodeURIComponent(f.id)}/latest`, { headers: readAuthHeaders(token) }),
              fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(f.id)}/eligibility`, { headers: readAuthHeaders(token) }),
            ]);
            const wd = await wr.json().catch(() => ({}));
            const ed = await er.json().catch(() => ({ eligibleForSlaughter: true, blockers: [] }));
            return {
              ...f,
              latestFcr: (wd as { weighIn?: { fcr?: number | null } }).weighIn?.fcr ?? null,
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
        const bd = await br.json().catch(() => ({ barns: [] }));
        if (br.ok) {
          setBarns((bd.barns as BarnSummary[]) ?? []);
            const byFlock = new Map(
              (((bd as { flocks?: Array<{ flockId: string; overdueRounds?: number; mortality7d?: number; withdrawalBlockers?: number; latestFcr?: number | null }> }).flocks) ?? []).map((x) => [x.flockId, x])
            );
            setFlocks((prev) =>
              prev
                .map((p) => {
                  const o = byFlock.get(p.id);
                  const overdue = Number(o?.overdueRounds ?? 0);
                  const mortality = Number(o?.mortality7d ?? 0);
                  const withdrawal = Number(o?.withdrawalBlockers ?? 0) > 0 || Boolean(p.withdrawalActive);
                  const fcr = p.latestFcr ?? (o?.latestFcr ?? null);
                  const poorFcr = fcr != null && Number(fcr) >= 2.4;
                  const riskScore = (withdrawal ? 60 : 0) + overdue * 10 + Math.min(mortality, 20) + (poorFcr ? 15 : 0);
                  const topIssue = withdrawal
                    ? "Withdrawal blocker"
                    : overdue > 0
                      ? "Overdue treatment rounds"
                      : mortality > 0
                        ? "Recent mortality spike"
                        : poorFcr
                          ? "Poor FCR trend"
                          : "Stable";
                  const needsRole = withdrawal ? "vet_manager" : overdue > 0 || mortality > 0 || poorFcr ? "vet" : "laborer";
                  return {
                    ...p,
                    latestFcr: fcr,
                    overdueRounds: overdue,
                    mortality7d: mortality,
                    withdrawalActive: withdrawal,
                    riskScore,
                    topIssue,
                    needsRole,
                  };
                })
                .sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0))
            );
        } else {
          setBarns([]);
        }
      } catch {
        setBarns([]);
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

  const visibleFlocks = flocks.filter((f) => {
    if (riskFilter === "all") return true;
    if (riskFilter === "blocked") return Boolean(f.withdrawalActive);
    if (riskFilter === "at_risk") return Number(f.riskScore ?? 0) >= 25;
    if (riskFilter === "needs_vet") return f.needsRole === "vet";
    if (riskFilter === "needs_manager") return f.needsRole === "vet_manager";
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Flocks"
        subtitle="Check-in urgency from bird age and hours-between-rounds policy."
      />

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
            {[
              ["all", "All"],
              ["at_risk", "At risk"],
              ["blocked", "Blocked"],
              ["needs_vet", "Needs vet"],
              ["needs_manager", "Needs manager"],
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
                  Day {f.ageDays ?? "—"} · next due{" "}
                  {f.nextDueAt
                    ? new Date(f.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-neutral-700">FCR: {f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</p>
                <p className="mt-1 text-xs text-neutral-700">Issue: {f.topIssue ?? "—"} · Risk {f.riskScore ?? 0}</p>
                {f.withdrawalActive ? <p className="mt-1 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canFlockAction(user, "treatment.execute")}
                    title={!canFlockAction(user, "treatment.execute") ? "Requires vet or higher" : ""}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Resolve round
                  </button>
                  <button
                    type="button"
                    disabled={!canFlockAction(user, "slaughter.schedule")}
                    title={!canFlockAction(user, "slaughter.schedule") ? "Requires vet manager or manager" : ""}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    Schedule slaughter
                  </button>
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
                  <th>Next due (Kigali)</th>
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
                    <td>{f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}</td>
                    <td className="font-mono text-xs">
                      {f.nextDueAt
                        ? new Date(f.nextDueAt).toLocaleString(undefined, { timeZone: "Africa/Kigali" })
                        : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        {f.checkinBadge ? <CheckinUrgencyBadge badge={f.checkinBadge} /> : null}
                        {f.withdrawalActive ? <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">🔴 Withdrawal</span> : null}
                        {(f.overdueRounds ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Overdue {f.overdueRounds}</span> : null}
                        {(f.mortality7d ?? 0) > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Mortality7d {f.mortality7d}</span> : null}
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
