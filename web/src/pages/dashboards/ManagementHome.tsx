import { PageHeader } from "../../components/PageHeader";
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
} from "../../lib/dashboardAdapters";

export function ManagementHome() {
  const { token, user } = useAuth();
  const { data, loading, error } = useOpsBoardData(token);
  const role = user?.role ?? "manager";
  const flocks = data?.flocks ?? [];
  const criticalCount = flocks.filter((f) => f.riskClass === "critical").length;
  const watchCount = flocks.filter((f) => f.riskClass === "watch" || f.riskClass === "at_risk").length;
  const avgRisk = flocks.length
    ? Math.round(flocks.reduce((s, f) => s + Number(f.riskScore || 0), 0) / flocks.length)
    : 0;
  const avgMortalityDelta = flocks.length
    ? Number(
        (
          flocks.reduce((s, f) => s + Number(f.mortality24hDeltaPct || 0), 0) / flocks.length
        ).toFixed(2),
      )
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      <PageHeader
        title="Command center"
        subtitle="Cross-unit KPIs — Clevafarm operations and finance (subject to permissions)."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Active flocks" value={flocks.length} />
        <MiniStat label="Critical flocks" value={criticalCount} tone={criticalCount > 0 ? "bad" : "good"} />
        <MiniStat label="Average risk" value={`${avgRisk}/100`} tone={avgRisk > 65 ? "bad" : avgRisk > 35 ? "warn" : "good"} />
        <MiniStat
          label="Mortality 24h delta"
          value={`${avgMortalityDelta >= 0 ? "+" : ""}${avgMortalityDelta}%`}
          tone={avgMortalityDelta > 0.5 ? "bad" : avgMortalityDelta > 0.1 ? "warn" : "good"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <ChartPanel
          title="Flock risk distribution"
          subtitle="Healthy vs watch vs at-risk vs critical"
          loading={loading}
          error={error}
          empty={!loading && !error && flocks.length === 0}
        >
          <RiskDonut data={riskClassCount(flocks)} />
        </ChartPanel>
        <ChartPanel
          title="Top risk flocks"
          subtitle="Highest priority flocks by risk score"
          loading={loading}
          error={error}
          empty={!loading && !error && flocks.length === 0}
          className="lg:col-span-2"
        >
          <TopRiskBars data={topRiskSeries(flocks, 8)} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel
          title="Mortality trend"
          subtitle="Recent mortality level trend (farm average)"
          loading={loading}
          error={error}
          empty={!loading && !error && flocks.length === 0}
        >
          <MortalityTrendLine data={mortalityTrendPseudoDaily(flocks)} />
        </ChartPanel>
        <ChartPanel
          title="FCR vs target"
          subtitle="Latest measured FCR compared to target max"
          loading={loading}
          error={error}
          empty={!loading && !error && fcrVsTargetSeries(flocks).length === 0}
        >
          <FcrTargetBars data={fcrVsTargetSeries(flocks, 10)} />
        </ChartPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel
          title="Operational blockers"
          subtitle="Overdue rounds and withdrawal blockers"
          loading={loading}
          error={error}
          empty={!loading && !error && flocks.length === 0}
        >
          <BlockersStacked data={blockersSeries(flocks, 10)} />
        </ChartPanel>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Role focus summary</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Dashboard sections tuned for your role: <span className="font-semibold text-neutral-700">{role}</span>
          </p>
          <ul className="mt-3 space-y-2 text-sm text-neutral-700">
            {role === "procurement_officer" ? (
              <>
                <li>- Prioritize barns with rising mortality and overdue interventions.</li>
                <li>- Watch blockers before restocking medicines and feed logistics.</li>
              </>
            ) : null}
            {role === "sales_coordinator" ? (
              <>
                <li>- Focus on risk and FCR deviations affecting market readiness.</li>
                <li>- Track flocks with improving weight and stable mortality.</li>
              </>
            ) : null}
            {role === "manager" || role === "superuser" ? (
              <>
                <li>- Monitor critical flocks, blockers, and trend direction daily.</li>
                <li>- Use risk + FCR charts to prioritize farm-level interventions.</li>
              </>
            ) : null}
            {watchCount > 0 ? <li>- {watchCount} flocks are in watch/at-risk states and need follow-up.</li> : null}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <section className="flex h-full min-h-[10.5rem] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Farm FCR vs target</h2>
          <p className="mt-2 text-sm text-neutral-600">Now powered by live ops-board and FCR snapshots.</p>
          <p className="mt-auto text-xs text-neutral-500">Use FCR chart above for actionable outliers.</p>
        </section>
        <section className="flex h-full min-h-[10.5rem] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Clevafarm finance portfolio</h2>
          <p className="mt-2 text-sm text-neutral-600">Exposure and PAR summary.</p>
          <div className="flex-1" aria-hidden />
        </section>
        <PermissionGuard
          permission="view_net_profit"
          fallback={
            <section className="flex h-full min-h-[10.5rem] flex-col rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm text-neutral-600">Net margin requires financial clearance.</p>
            </section>
          }
        >
          <section className="flex h-full min-h-[10.5rem] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-800">Net profit outlook</h2>
            <p className="mt-2 font-mono text-2xl text-emerald-800">Restricted</p>
            <p className="mt-auto text-xs text-neutral-500">Sample — wire ledger consolidation.</p>
          </section>
        </PermissionGuard>
      </div>
      <PermissionGuard permission="view_bank_balances">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Liquidity</h2>
          <p className="mt-1 text-sm text-neutral-600">Bank balances visible with clearance.</p>
        </section>
      </PermissionGuard>
    </div>
  );
}
