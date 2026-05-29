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
import type { ReactNode } from "react";
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
import { useOdooConnection } from "../../context/OdooConnectionContext";
import { useCompanyNav } from "../../hooks/useCompanyNav";

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

function SectionHeader({ label, sub, action, num }: { label: string; sub?: string; action?: ReactNode; num: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2 pb-1 border-b border-[var(--border-color)] mb-1">
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className="section-num shrink-0">{num}</span>
        <h2 className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">{label}</h2>
        {sub && <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] truncate">{sub}</span>}
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

function OdooStatusPill() {
  const { companyHref } = useCompanyNav();
  const { status, loading } = useOdooConnection();
  if (loading && !status) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-card)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
        title="Checking Odoo connection"
      >
        Odoo…
      </span>
    );
  }
  const ok = status?.connected === true;
  const err = status?.error?.trim() || null;
  return (
    <Link
      to={companyHref("farm/odoo-setup")}
      className={
        ok
          ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/15"
          : "inline-flex max-w-[min(20rem,55vw)] items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/15"
      }
      title={ok ? "Odoo integration is connected" : err || "Odoo is not connected — open settings"}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span className="min-w-0 truncate">{ok ? "Odoo connected" : "Odoo not connected"}</span>
    </Link>
  );
}

// ─── Finance card helpers ──────────────────────────────────────────────────────

function FinanceCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] p-5 flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
      {children}
    </div>
  );
}

function FinanceLockedCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] bg-[var(--surface-card)] p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)] opacity-60 shrink-0">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{reason}</p>
    </div>
  );
}

function FinanceBarPlaceholder({ bars, color = "var(--primary-color)" }: { bars: number[]; color?: string }) {
  return (
    <div className="mt-3 flex items-end gap-1 h-10">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm opacity-25"
          style={{ height: `${Math.round(h * 100)}%`, background: color }}
        />
      ))}
    </div>
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

const SYNC_POLL_MS = 5 * 60 * 1000;

export function ManagementHome() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { data, loading, error, reload } = useOpsBoardData(token);
  const isSuperuser = user?.role === "superuser";
  const role = user?.role ?? "manager";
  const canOpenAccountingApprovals = user?.role === "manager" || user?.role === "superuser";
  const [outboxNotSentCount, setOutboxNotSentCount] = useState<number | null>(null);

  const { visible, configOpen, setConfigOpen, draft, toggle, save, saving } = useWidgetVisibility(token, isSuperuser);
  const show = (id: string) => visible.includes(id);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/accounting-reconciliation/sync-health`, {
          headers: readAuthHeaders(token),
        });
        const d = r.ok ? ((await r.json()) as { notSentToOdoo?: number }) : null;
        if (cancelled) return;
        setOutboxNotSentCount(typeof d?.notSentToOdoo === "number" ? d.notSentToOdoo : null);
      } catch {
        if (!cancelled) setOutboxNotSentCount(null);
      }
    };
    void run();
    const id = window.setInterval(() => void run(), SYNC_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

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
      <div className="flex flex-col gap-3 pt-2 pb-5 mb-6 border-b border-[var(--border-color)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight leading-none"
              style={{ background: "var(--primary-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Command Center
            </h1>
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)] flex items-center gap-2">
              <span className="live-dot" />
              Cross-unit KPIs — Clevafarm operations and finance
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              to={`${companyHref("farm/reports")}?type=farm_operations`}
              className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Reports
            </Link>
            <OdooStatusPill />
            <LiveBadge />
            <button onClick={reload}
              className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors">
              Refresh
            </button>
            {isSuperuser && (
              <button onClick={() => setConfigOpen(true)}
                className="rounded-[var(--radius-md)] border border-[var(--primary-color)]/30 bg-[var(--primary-color)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--primary-color)] hover:bg-[var(--primary-color)]/15 transition-colors">
                Widgets
              </button>
            )}
          </div>
        </div>
      </div>

      {outboxNotSentCount != null && outboxNotSentCount > 0 && (
        <div
          role="status"
          className="mb-6 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text-primary)] sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="min-w-0">
            <span className="font-semibold text-amber-200">{outboxNotSentCount}</span>
            {outboxNotSentCount === 1
              ? " accounting transaction is not yet in Odoo."
              : " accounting transactions are not yet in Odoo."}
            {!canOpenAccountingApprovals && (
              <span className="text-[var(--text-muted)]"> A manager can sync or retry them from Accounting approvals.</span>
            )}
          </p>
          {canOpenAccountingApprovals ? (
            <Link
              to={`${companyHref("farm/accounting-approvals")}?tab=action`}
              className="shrink-0 font-medium text-[var(--primary-color)] underline decoration-[var(--primary-color)]/40 underline-offset-2 hover:decoration-[var(--primary-color)]"
            >
              Open Accounting approvals
            </Link>
          ) : null}
        </div>
      )}

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
          <SectionHeader num="01" label="Executive overview" sub="Live farm operations snapshot" />
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
          <SectionHeader num="02" label="Farm health" />
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
          <SectionHeader num="03" label="Risk intelligence" sub="Flock distribution and priority ranking" />
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
          <SectionHeader num="04" label="Ops trends" sub="Mortality and FCR performance over time" />
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
          <SectionHeader num="05" label="Operational blockers" sub="Overdue rounds and withdrawal blockers per flock"
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
          <SectionHeader num="06" label="Flock scanner" sub="Live status of all active flocks"
            action={<Link to={companyHref("farm/flocks")} className="text-xs text-[var(--primary-color)] hover:underline font-medium">View all →</Link>}
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
                        <Link to={companyHref(`farm/flocks/${f.flockId}`)}
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
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] max-w-[240px] truncate" title={f.topIssue || undefined}>{f.topIssue || "—"}</td>
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
          <SectionHeader num="07" label="Financial pulse" sub="Financial metrics (subject to permissions)" />
          <div className="grid gap-4 lg:grid-cols-3">
            <PermissionGuard
              permission="view_net_profit"
              fallback={<FinanceLockedCard label="Net margin" reason="Financial clearance required." />}
            >
              <FinanceCard label="Net profit outlook">
                <p className="font-mono-data text-2xl font-bold text-[var(--text-muted)]">Pending</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Ledger consolidation in progress.</p>
                <FinanceBarPlaceholder bars={[0.4, 0.6, 0.5, 0.7, 0.55, 0.8, 0.65]} />
              </FinanceCard>
            </PermissionGuard>

            <FinanceCard label="Finance portfolio">
              <p className="text-sm text-[var(--text-secondary)]">Exposure and PAR summary</p>
              <FinanceBarPlaceholder bars={[0.9, 0.7, 0.8, 0.6, 0.75, 0.85, 0.7]} color="var(--secondary-color)" />
            </FinanceCard>

            <PermissionGuard permission="view_bank_balances"
              fallback={<FinanceLockedCard label="Liquidity" reason="Bank balances require clearance." />}
            >
              <FinanceCard label="Liquidity">
                <p className="text-sm text-[var(--text-secondary)]">Bank balances available with clearance.</p>
                <FinanceBarPlaceholder bars={[0.5, 0.6, 0.7, 0.65, 0.8, 0.75, 0.9]} color="var(--primary-color)" />
              </FinanceCard>
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
