/**
 * Command Center — premium analytics dashboard
 *
 * Sections (superuser-configurable visibility):
 *   exec_kpis   — Executive KPI strip
 *   health_score — Farm health gauge + insights
 *   risk_intel  — Risk distribution + top risk bars
 *   ops_trends  — Mortality trend + FCR vs target
 *   blockers    — Operational blockers
 *   flock_table — Live flock scanner table
 *   finance     — Financial pulse (permission-gated)
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PermissionGuard } from "../../components/PermissionGuard";
import { useAuth } from "../../auth/AuthContext";
import { ChartPanel } from "../../components/dashboard/ChartPanel";
import { MiniStat } from "../../components/dashboard/MiniStat";
import {
  BlockersStacked,
  FcrTargetBars,
  MortalityTrendLine,
  RiskDonut,
  TopRiskBars,
} from "../../components/dashboard/charts/OpsCharts";
import { useOpsBoardData } from "../../hooks/useOpsBoardData";
import {
  blockersSeries,
  fcrVsTargetSeries,
  mortalityTrendPseudoDaily,
  riskClassCount,
  topRiskSeries,
  type OpsBoardFlock,
} from "../../lib/dashboardAdapters";
import { readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

// ─── Widget definitions ────────────────────────────────────────────────────────

const ALL_WIDGETS = [
  { id: "exec_kpis", label: "Executive KPIs" },
  { id: "health_score", label: "Farm health score" },
  { id: "risk_intel", label: "Risk intelligence" },
  { id: "ops_trends", label: "Ops trends (mortality & FCR)" },
  { id: "blockers", label: "Operational blockers" },
  { id: "flock_table", label: "Flock scanner table" },
  { id: "finance", label: "Financial pulse" },
];

const DEFAULT_VISIBLE = ALL_WIDGETS.map(w => w.id);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskBadge(rc: OpsBoardFlock["riskClass"]) {
  const m: Record<string, string> = {
    healthy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    watch: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    at_risk: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    critical: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return m[rc] ?? "bg-[var(--surface-subtle)] text-[var(--text-muted)]";
}

function riskLabel(rc: OpsBoardFlock["riskClass"]) {
  return { healthy: "Healthy", watch: "Watch", at_risk: "At risk", critical: "Critical" }[rc] ?? rc;
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, sub, action }: { label: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-2 pb-1">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</h2>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5 opacity-70">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Live badge ────────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--primary-color)]">
      <span className="live-dot" />
      LIVE
    </span>
  );
}

// ─── Widget config hook ────────────────────────────────────────────────────────

function useWidgetVisibility(token: string | null, _isSuperuser: boolean) {
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string[]>(DEFAULT_VISIBLE);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/dashboard-widgets`, { headers: readAuthHeaders(token) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.widgets && Array.isArray(d.widgets)) {
          setVisible(d.widgets);
          setDraft(d.widgets);
        }
      })
      .catch(() => {});
  }, [token]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/admin/dashboard-widgets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ widgets: draft }),
      });
      setVisible(draft);
      setConfigOpen(false);
    } catch {}
    setSaving(false);
  }

  function toggle(id: string) {
    setDraft(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
  }

  return { visible, configOpen, setConfigOpen, draft, toggle, save, saving };
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ManagementHome() {
  const { token, user } = useAuth();
  const { data, loading, error, reload } = useOpsBoardData(token);
  const isSuperuser = user?.role === "superuser";
  const role = user?.role ?? "manager";

  const { visible, configOpen, setConfigOpen, draft, toggle, save, saving } = useWidgetVisibility(token, isSuperuser);
  const show = (id: string) => visible.includes(id);

  const flocks = data?.flocks ?? [];
  const insights = data?.insights ?? [];
  const farmScore = data?.farmHealthScore ?? null;

  const criticalCount = flocks.filter(f => f.riskClass === "critical").length;
  const watchCount = flocks.filter(f => f.riskClass === "watch" || f.riskClass === "at_risk").length;
  const healthyCount = flocks.filter(f => f.riskClass === "healthy").length;
  const avgRisk = flocks.length ? Math.round(flocks.reduce((s, f) => s + Number(f.riskScore || 0), 0) / flocks.length) : 0;
  const avgMortDelta = flocks.length ? Number((flocks.reduce((s, f) => s + Number(f.mortality24hDeltaPct || 0), 0) / flocks.length).toFixed(2)) : 0;
  const totalBlockers = flocks.reduce((s, f) => s + f.overdueRounds + f.withdrawalBlockers, 0);

  const sortedFlocks = [...flocks].sort((a, b) => b.riskScore - a.riskScore);
  const mortalityData = mortalityTrendPseudoDaily(flocks);
  const fcrData = fcrVsTargetSeries(flocks, 10);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-0 pb-12">

      {/* ── Page header strip ── */}
      <div className="flex items-center justify-between py-4 border-b border-[var(--border-color)] mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Command Center</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Cross-unit KPIs — Clevafarm operations and finance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LiveBadge />
          <button onClick={reload}
            className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors">
            Refresh
          </button>
          {isSuperuser && (
            <button onClick={() => setConfigOpen(true)}
              className="rounded-[var(--radius-md)] border border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/15 transition-colors">
              Widgets ⚙
            </button>
          )}
        </div>
      </div>

      {/* ── Widget config panel ── */}
      {configOpen && isSuperuser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-elevated)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Dashboard widgets</h2>
              <button onClick={() => setConfigOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">Choose which sections appear on the Command Center for all users.</p>
            <div className="space-y-2">
              {ALL_WIDGETS.map(w => (
                <label key={w.id} className="flex items-center gap-3 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 hover:bg-[var(--surface-elevated)] transition-colors">
                  <input type="checkbox" checked={draft.includes(w.id)} onChange={() => toggle(w.id)}
                    className="h-4 w-4 rounded accent-[var(--primary-color)]" />
                  <span className="text-sm text-[var(--text-primary)]">{w.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setConfigOpen(false)} className="rounded-[var(--radius-md)] border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-card)]">Cancel</button>
              <button onClick={save} disabled={saving} className="rounded-[var(--radius-md)] bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ EXEC KPIs ══════════════ */}
      {show("exec_kpis") && (
        <section className="space-y-3 mb-8">
          <SectionHeader label="Executive overview" sub="Live farm operations snapshot" />
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat label="Active flocks" value={loading ? "…" : flocks.length} icon="🐔" glow />
            <MiniStat label="Healthy" value={loading ? "…" : healthyCount} tone="good" icon="✓" glow />
            <MiniStat label="Watch/At risk" value={loading ? "…" : watchCount} tone={watchCount > 0 ? "warn" : "good"} icon="⚠" glow={watchCount > 0} />
            <MiniStat label="Critical" value={loading ? "…" : criticalCount} tone={criticalCount > 0 ? "bad" : "good"} icon="🚨" glow={criticalCount > 0} />
            <MiniStat label="Avg risk score" value={loading ? "…" : `${avgRisk}/100`} tone={avgRisk > 65 ? "bad" : avgRisk > 35 ? "warn" : "good"} icon="📊" />
            <MiniStat
              label="Mortality 24h Δ"
              value={loading ? "…" : `${avgMortDelta >= 0 ? "+" : ""}${avgMortDelta}%`}
              tone={avgMortDelta > 0.5 ? "bad" : avgMortDelta > 0.1 ? "warn" : "good"}
              change={totalBlockers > 0 ? `${totalBlockers} blockers` : undefined}
              icon="📉"
            />
          </div>
        </section>
      )}

      {/* ══════════════ FARM HEALTH SCORE ══════════════ */}
      {show("health_score") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Farm health" />
          <div className="grid gap-4 md:grid-cols-3">
            {/* Score card */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5 flex flex-col items-center justify-center gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Farm health score</p>
              {loading ? (
                <div className="skeleton-shimmer h-16 w-24 rounded-lg" />
              ) : (
                <>
                  <div
                    className="text-6xl font-extrabold tabular-nums animate-count"
                    style={{
                      color: farmScore == null ? "var(--text-muted)" :
                        farmScore >= 75 ? "#22c78a" : farmScore >= 50 ? "#fbbf24" : "#f87171"
                    }}
                  >
                    {farmScore ?? "—"}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">/ 100</div>
                  {farmScore != null && (
                    <div className={["text-xs font-semibold px-3 py-1 rounded-full border",
                      farmScore >= 75 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                      farmScore >= 50 ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                      "bg-red-500/15 text-red-400 border-red-500/20"
                    ].join(" ")}>
                      {farmScore >= 75 ? "Good standing" : farmScore >= 50 ? "Needs attention" : "Critical — action required"}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Insights */}
            <div className="md:col-span-2 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">AI Insights</p>
                <LiveBadge />
              </div>
              {loading ? (
                <div className="space-y-2">
                  <div className="skeleton-shimmer h-4 w-full rounded" />
                  <div className="skeleton-shimmer h-4 w-4/5 rounded" />
                  <div className="skeleton-shimmer h-4 w-3/5 rounded" />
                </div>
              ) : insights.length > 0 ? (
                <ul className="space-y-2">
                  {insights.slice(0, 5).map((ins, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <span className="mt-0.5 shrink-0 text-[var(--primary-color)] font-bold text-xs">›</span>
                      {ins}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2">
                  {role === "manager" || role === "superuser" ? (
                    <>
                      <p className="text-sm text-[var(--text-secondary)] flex items-start gap-2"><span className="text-[var(--primary-color)] font-bold text-xs mt-0.5">›</span> Monitor critical flocks, blockers, and trend direction daily.</p>
                      <p className="text-sm text-[var(--text-secondary)] flex items-start gap-2"><span className="text-[var(--primary-color)] font-bold text-xs mt-0.5">›</span> Use risk + FCR charts to prioritize farm-level interventions.</p>
                    </>
                  ) : null}
                  {watchCount > 0 && <p className="text-sm text-amber-400 flex items-start gap-2"><span className="font-bold text-xs mt-0.5">›</span> {watchCount} flock{watchCount !== 1 ? "s" : ""} in watch/at-risk state.</p>}
                  {criticalCount > 0 && <p className="text-sm text-red-400 flex items-start gap-2"><span className="font-bold text-xs mt-0.5">›</span> {criticalCount} critical flock{criticalCount !== 1 ? "s" : ""} require immediate action.</p>}
                  {insights.length === 0 && flocks.length === 0 && <p className="text-sm text-[var(--text-muted)]">No flock data loaded yet.</p>}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════ RISK INTELLIGENCE ══════════════ */}
      {show("risk_intel") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Risk intelligence" sub="Flock distribution and priority ranking" />
          <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
            <ChartPanel title="Risk distribution" subtitle="Healthy vs watch vs at-risk vs critical" loading={loading} error={error} empty={!loading && !error && flocks.length === 0}>
              <RiskDonut data={riskClassCount(flocks)} />
            </ChartPanel>
            <ChartPanel title="Top risk flocks" subtitle="Highest priority flocks by risk score" loading={loading} error={error} empty={!loading && !error && flocks.length === 0} className="lg:col-span-2">
              <TopRiskBars data={topRiskSeries(flocks, 8)} />
            </ChartPanel>
          </div>
        </section>
      )}

      {/* ══════════════ OPS TRENDS ══════════════ */}
      {show("ops_trends") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Ops trends" sub="Mortality and FCR performance over time" />
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Mortality trend" subtitle="7-day farm average mortality rate" loading={loading} error={error} empty={!loading && !error && flocks.length === 0}>
              <MortalityTrendLine data={mortalityData} />
            </ChartPanel>
            <ChartPanel title="FCR vs target" subtitle="Latest FCR — red = above target" loading={loading} error={error} empty={!loading && !error && fcrData.length === 0} emptyLabel="No FCR data available yet">
              <FcrTargetBars data={fcrData} />
            </ChartPanel>
          </div>
        </section>
      )}

      {/* ══════════════ BLOCKERS ══════════════ */}
      {show("blockers") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Operational blockers" sub="Overdue rounds and withdrawal blockers per flock"
            action={
              totalBlockers > 0 ? (
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">{totalBlockers} active</span>
              ) : (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">All clear</span>
              )
            }
          />
          <ChartPanel title="Blockers by flock" subtitle="Overdue rounds + withdrawal blockers" loading={loading} error={error} empty={!loading && !error && flocks.length === 0}>
            <BlockersStacked data={blockersSeries(flocks, 10)} />
          </ChartPanel>
        </section>
      )}

      {/* ══════════════ FLOCK SCANNER TABLE ══════════════ */}
      {show("flock_table") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Flock scanner" sub="Live status of all active flocks"
            action={<Link to="/farm/flocks" className="text-xs text-[var(--primary-color)] hover:underline font-medium">View all →</Link>}
          />
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] text-left text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--table-header-bg)]">
                    <th className="px-4 py-3">Flock</th>
                    <th className="px-4 py-3">Barn</th>
                    <th className="px-4 py-3 text-center">Age</th>
                    <th className="px-4 py-3 text-right">Risk</th>
                    <th className="px-4 py-3 text-right">FCR</th>
                    <th className="px-4 py-3 text-right">Mortality 7d</th>
                    <th className="px-4 py-3 text-center">Blockers</th>
                    <th className="px-4 py-3">Issue</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--text-muted)] animate-pulse">Loading flock data…</td>
                    </tr>
                  )}
                  {!loading && sortedFlocks.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No active flocks found.</td>
                    </tr>
                  )}
                  {sortedFlocks.map(f => (
                    <tr key={f.flockId}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--table-row-hover)] transition-colors group">
                      <td className="px-4 py-2.5">
                        <Link to={`/farm/flocks/${f.flockId}`}
                          className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary-color)] transition-colors">
                          {f.label}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{f.barn}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-[var(--text-secondary)] tabular-nums">{f.ageDays}d</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-bold tabular-nums text-xs" style={{
                            color: f.riskScore >= 75 ? "#f87171" : f.riskScore >= 50 ? "#f97316" : f.riskScore >= 25 ? "#fbbf24" : "#22c78a"
                          }}>{Math.round(f.riskScore)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {f.latestFcr != null ? (
                          <span style={{ color: f.latestFcr > f.expectedFcrRange.max ? "#f87171" : "var(--text-secondary)" }}>
                            {Number(f.latestFcr).toFixed(2)}
                          </span>
                        ) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        <span style={{ color: f.mortality7d > 2 ? "#f87171" : f.mortality7d > 0.5 ? "#fbbf24" : "var(--text-secondary)" }}>
                          {Number(f.mortality7d).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {f.overdueRounds + f.withdrawalBlockers > 0 ? (
                          <span className="rounded-full bg-red-500/15 text-red-400 text-[11px] font-bold px-2 py-0.5 border border-red-500/20">
                            {f.overdueRounds + f.withdrawalBlockers}
                          </span>
                        ) : (
                          <span className="text-emerald-500 text-xs">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] max-w-[160px] truncate">{f.topIssue || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={["text-[11px] font-semibold border px-2 py-0.5 rounded-full", riskBadge(f.riskClass)].join(" ")}>
                          {riskLabel(f.riskClass)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════ FINANCIAL PULSE ══════════════ */}
      {show("finance") && (
        <section className="mb-8 space-y-3">
          <SectionHeader label="Financial pulse" sub="Financial metrics (subject to permissions)" />
          <div className="grid gap-4 lg:grid-cols-3">
            <PermissionGuard
              permission="view_net_profit"
              fallback={
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] bg-[var(--surface-card)] p-5 flex flex-col gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Net margin</p>
                  <p className="text-sm text-[var(--text-muted)]">Financial clearance required to view net profit data.</p>
                </div>
              }
            >
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Net profit outlook</p>
                <p className="font-mono text-2xl font-bold text-[var(--text-muted)]">Restricted</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Wire ledger consolidation pending.</p>
              </div>
            </PermissionGuard>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Clevafarm Finance portfolio</p>
              <p className="text-sm text-[var(--text-secondary)]">Exposure and PAR summary</p>
              <div className="flex-1" />
            </div>

            <PermissionGuard permission="view_bank_balances" fallback={
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] bg-[var(--surface-card)] p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Liquidity</p>
                <p className="text-sm text-[var(--text-muted)]">Bank balances require clearance.</p>
              </div>
            }>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Liquidity</p>
                <p className="text-sm text-[var(--text-secondary)]">Bank balances visible with clearance.</p>
              </div>
            </PermissionGuard>
          </div>
        </section>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
