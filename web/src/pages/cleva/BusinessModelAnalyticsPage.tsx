import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState } from "../../components/LoadingSkeleton";
import { BusinessModelBudgetTab } from "./BusinessModelBudgetTab";
import { BusinessModelMemosTab } from "./BusinessModelMemosTab";
import { BusinessModelBroilerOpsTab } from "./BusinessModelBroilerOpsTab";

type PaygoCtl = {
  proj_months: number;
  volume_mode: string;
  custom_monthly: number[] | null;
  def_rate_pct: number;
  debt_rate_pct: number;
  device_tier_label: string;
  custom_dev_cost_rwf: number;
  customer_payback_multiple: number;
  dep_pct: number;
  disc3_pct: number;
  disc6_pct: number;
  disc12_pct: number;
  mix_p3: number;
  mix_p6: number;
  mix_p12: number;
  fixed_opex_per_device: number;
  platform_cac_per_unit: number;
  recovery_pct: number;
  ltv_pct: number;
  grace_mos: number;
  amort_mos: number;
  dscr_floor: number;
  vol_mult: number;
  investor_capital_pct: number;
  creditor_capital_pct: number;
  confidence: boolean;
  comparison: boolean;
};

type MonthlyRow = Record<string, number | null>;
type BroilerInputs = Record<string, number>;

const CUSTOM_DEVICE_TIER = "Custom (type RWF below)";
const DEVICE_TIER_OPTIONS = [
  "Budget (60k RWF)",
  "Value (85k RWF)",
  "Standard (100k RWF)",
  "Mid (120k RWF)",
  "Mid (144k RWF)",
  "Upper mid (180k RWF)",
  "High (220k RWF)",
  "Premium (300k RWF)",
  CUSTOM_DEVICE_TIER,
] as const;

const VOL_MODES = ["Conservative", "Base", "Aggressive", "Custom"] as const;

const PAYGO_CHART_KEYS = ["collections", "ebitda", "cash_end"] as const;

function fmtRwf(n: number | null | undefined, compact = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Number(n);
  if (compact && Math.abs(v) >= 1e9) return `RWF ${(v / 1e9).toFixed(2)}B`;
  if (compact && Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(1)}M`;
  if (compact && Math.abs(v) >= 1e3) return `RWF ${(v / 1e3).toFixed(0)}K`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(Number(n) * 100).toFixed(2)}%`;
}

/** Streamlit NAV_PAGES parity (+ A vs B). */
type PaygoView =
  | "summary"
  | "growth"
  | "cash"
  | "debt"
  | "units"
  | "scenario"
  | "sensitivity"
  | "data"
  | "compare";

type TabId = "paygo" | "budget" | "memos" | "broiler";

type HeatmapBlock = {
  title: string;
  yLabels: string[];
  xLabels: string[];
  z: number[][];
  cellKind?: "money" | "irr" | "month";
};

export function BusinessModelAnalyticsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabId>("paygo");
  const [paygoView, setPaygoView] = useState<PaygoView>("scenario");
  const [broilerCycleId, setBroilerCycleId] = useState("flock-1");
  const [broilerSub, setBroilerSub] = useState<"economics" | "operations">("economics");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [paygoCtl, setPaygoCtl] = useState<PaygoCtl | null>(null);
  const [paygoCtlB, setPaygoCtlB] = useState<PaygoCtl | null>(null);
  const [resolvedInputs, setResolvedInputs] = useState<Record<string, number> | null>(null);
  const [series, setSeries] = useState<MonthlyRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number | null> | null>(null);
  const [milestones, setMilestones] = useState<Record<string, number | null> | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, unknown>[] | null>(null);
  const [capitalStack, setCapitalStack] = useState<Record<string, number> | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  const [heatmaps, setHeatmaps] = useState<{
    cumulativeNetIncome: HeatmapBlock;
    irrDebtTier: HeatmapBlock;
    ebitdaBreakevenMonth: HeatmapBlock;
  } | null>(null);

  const [compareResult, setCompareResult] = useState<{
    seriesA: MonthlyRow[];
    seriesB: MonthlyRow[];
    summaryA: Record<string, number | null>;
    summaryB: Record<string, number | null>;
    deltaCumulativeNetIncome: number;
    assumptionDiffs: { assumption: string; A: unknown; B: unknown }[];
  } | null>(null);

  const [broilerInputs, setBroilerInputs] = useState<BroilerInputs | null>(null);
  const [broilerSummary, setBroilerSummary] = useState<Record<string, number> | null>(null);
  const [trajectory, setTrajectory] = useState<Record<string, number>[] | null>(null);
  const [insights, setInsights] = useState<string[] | null>(null);
  const [weeklyMortality, setWeeklyMortality] = useState<{ week: number; mortality_pct_of_week_start: number }[] | null>(
    null
  );

  const loadPaygoDefaults = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-defaults`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      const ctl = (d as { ctl: PaygoCtl }).ctl;
      setPaygoCtl(ctl);
      setPaygoCtlB({ ...ctl, def_rate_pct: Math.min(20, ctl.def_rate_pct + 2) });
      setResolvedInputs((d as { inputs: Record<string, number> }).inputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [token]);

  const loadBroilerDefaults = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/broiler-defaults`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setBroilerInputs((d as { inputs: BroilerInputs }).inputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [token]);

  useEffect(() => {
    void loadPaygoDefaults();
    void loadBroilerDefaults();
  }, [loadPaygoDefaults, loadBroilerDefaults]);

  const runPaygo = async () => {
    if (!paygoCtl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-projection`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Projection failed");
      setSeries((d as { series: MonthlyRow[] }).series);
      setSummary((d as { summary: Record<string, number | null> }).summary);
      setMilestones((d as { milestones: Record<string, number | null> }).milestones);
      setScenarios((d as { scenarios: Record<string, unknown>[] }).scenarios);
      setCapitalStack((d as { capitalStack: Record<string, number> }).capitalStack);
      setResolvedInputs((d as { inputs: Record<string, number> }).inputs);
      setHeatmaps(null);
      setPaygoView("summary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Projection failed");
    } finally {
      setBusy(false);
    }
  };

  const runHeatmaps = async () => {
    if (!paygoCtl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-heatmaps`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Heatmaps failed");
      setHeatmaps((d as { heatmaps: typeof heatmaps }).heatmaps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Heatmaps failed");
    } finally {
      setBusy(false);
    }
  };

  const runCompare = async () => {
    if (!paygoCtl || !paygoCtlB) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-compare`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctlA: paygoCtl, ctlB: paygoCtlB }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Compare failed");
      setCompareResult({
        seriesA: (d as { seriesA: MonthlyRow[] }).seriesA,
        seriesB: (d as { seriesB: MonthlyRow[] }).seriesB,
        summaryA: (d as { summaryA: Record<string, number | null> }).summaryA,
        summaryB: (d as { summaryB: Record<string, number | null> }).summaryB,
        deltaCumulativeNetIncome: (d as { deltaCumulativeNetIncome: number }).deltaCumulativeNetIncome,
        assumptionDiffs: (d as { assumptionDiffs: { assumption: string; A: unknown; B: unknown }[] }).assumptionDiffs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setBusy(false);
    }
  };

  const runBroiler = async () => {
    if (!broilerInputs) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/broiler`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ inputs: broilerInputs }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Broiler model failed");
      setBroilerSummary((d as { summary: Record<string, number> }).summary);
      setTrajectory((d as { trajectory: Record<string, number>[] }).trajectory);
      setInsights((d as { insights: string[] }).insights);
      setWeeklyMortality((d as { weeklyMortality?: { week: number; mortality_pct_of_week_start: number }[] }).weeklyMortality ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Broiler model failed");
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!series?.length) return [];
    const conf = paygoCtl?.confidence === true;
    const pct = 0.15;
    return series.map((row) => {
      const o: Record<string, number | null> = {
        month: row.month,
        collections: Number(row.collections) || 0,
        ebitda: Number(row.ebitda) || 0,
        cash_end: Number(row.cash_end) || 0,
        units_sold: Number(row.units_sold) || 0,
        closing_debt: Number(row.closing_debt) || 0,
        dscr: row.dscr != null && Number.isFinite(Number(row.dscr)) ? Number(row.dscr) : null,
      };
      if (conf) {
        for (const k of ["collections", "ebitda", "cash_end", "units_sold", "closing_debt"] as const) {
          const v = o[k] ?? 0;
          o[`${k}_hi`] = v * (1 + pct);
          o[`${k}_lo`] = v * (1 - pct);
        }
      }
      return o;
    });
  }, [series, paygoCtl?.confidence]);

  const filteredRows = useMemo(() => {
    if (!series?.length) return [];
    const q = tableFilter.trim().toLowerCase();
    if (!q) return series;
    return series.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [series, tableFilter]);

  const tableColumns = useMemo(() => {
    if (!series?.[0]) return [];
    return Object.keys(series[0]);
  }, [series]);

  const customVolSeed = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => Math.max(50, 300 + i * 350));
  }, []);

  const compareChartData = useMemo(() => {
    if (!compareResult) return [];
    let cumAE = 0;
    let cumBE = 0;
    let cumAN = 0;
    let cumBN = 0;
    return compareResult.seriesA.map((row, i) => {
      cumAE += Number(row.ebitda) || 0;
      cumBE += Number(compareResult.seriesB[i]?.ebitda) || 0;
      cumAN += Number(row.net_income) || 0;
      cumBN += Number(compareResult.seriesB[i]?.net_income) || 0;
      return { month: row.month, aE: cumAE, bE: cumBE, aN: cumAN, bN: cumBN };
    });
  }, [compareResult]);

  function updateCtl<K extends keyof PaygoCtl>(key: K, value: PaygoCtl[K]) {
    setPaygoCtl((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateCtlMix(p3: number, p6: number) {
    setPaygoCtl((prev) => {
      if (!prev) return prev;
      const m12 = Math.max(0, 100 - p3 - p6);
      return { ...prev, mix_p3: p3, mix_p6: p6, mix_p12: m12 };
    });
  }

  function updateBroiler(key: string, value: number) {
    setBroilerInputs((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function heatmapColor(t: number, lo: number, hi: number): string {
    if (!Number.isFinite(t)) return "#e2e8f0";
    const x = hi === lo ? 0.5 : (t - lo) / (hi - lo);
    const u = Math.max(0, Math.min(1, x));
    const r = Math.round(10 + u * 80);
    const g = Math.round(15 + u * 40);
    const b = Math.round(30 + u * 200);
    return `rgb(${r},${g},${b})`;
  }

  function formatHeatCell(cell: number, kind?: HeatmapBlock["cellKind"]): string {
    if (!Number.isFinite(cell)) return "—";
    if (kind === "irr") return `${cell.toFixed(1)}%`;
    if (kind === "month") return cell.toFixed(0);
    if (kind === "money" || !kind) {
      if (Math.abs(cell) >= 1e9) return `${(cell / 1e9).toFixed(2)}B`;
      if (Math.abs(cell) >= 1e6) return `${(cell / 1e6).toFixed(1)}M`;
      return cell.toFixed(0);
    }
    return String(cell);
  }

  function HeatmapTable({ block }: { block: HeatmapBlock }) {
    const flat = block.z.flat().filter((v) => Number.isFinite(v));
    const lo = flat.length ? Math.min(...flat) : 0;
    const hi = flat.length ? Math.max(...flat) : 1;
    return (
      <div className="overflow-x-auto">
        <p className="mb-2 text-xs font-medium text-neutral-700">{block.title}</p>
        <table className="institutional-table text-xs">
          <thead>
            <tr>
              <th />
              {block.xLabels.map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.z.map((row, yi) => (
              <tr key={yi}>
                <th>{block.yLabels[yi]}</th>
                {row.map((cell, xi) => (
                  <td
                    key={xi}
                    style={{
                      background: heatmapColor(cell, lo, hi),
                      color: (cell - lo) / (hi - lo + 1e-9) > 0.55 ? "#fff" : "#0f172a",
                    }}
                    className="font-mono text-center"
                  >
                    {formatHeatCell(cell, block.cellKind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <PageHeader
          title="Business model analytics"
          subtitle="Streamlit-style PAYGO workspace, SQLite budget & broiler ops, PDF memoranda, optional ±15% confidence bands, and env-based suggested actuals (CLEVA_ACTUALS_JSON)."
        />
        {error ? (
          <div className="mt-4">
            <ErrorState message={error} onRetry={() => void loadPaygoDefaults()} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
        {(
          [
            ["paygo", "PAYGO workspace"],
            ["budget", "Budget & actuals"],
            ["memos", "PDF memoranda"],
            ["broiler", "Broiler"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id
                ? "bg-emerald-800 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "paygo" ? (
        <div className="space-y-4">
          {!paygoCtl ? <p className="text-sm text-neutral-500">Loading scenario defaults…</p> : null}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["summary", "🏠 Summary"],
                ["growth", "📈 Growth"],
                ["cash", "💰 Cash"],
                ["debt", "🏦 Debt"],
                ["units", "📦 Units"],
                ["scenario", "⚡ Scenario"],
                ["sensitivity", "📊 Sensitivity"],
                ["data", "📋 Data"],
                ["compare", "A vs B"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPaygoView(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  paygoView === id ? "bg-slate-800 text-white" : "border border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {paygoCtl && paygoView === "scenario" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Core scenario</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-xs font-medium text-neutral-600">
                    Horizon (months)
                    <select
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.proj_months}
                      onChange={(e) => updateCtl("proj_months", Number(e.target.value))}
                    >
                      {[24, 36, 48, 60].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Sales volume path
                    <select
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.volume_mode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPaygoCtl((prev) => {
                          if (!prev) return prev;
                          if (v === "Custom" && (!prev.custom_monthly || prev.custom_monthly.length < 12)) {
                            return { ...prev, volume_mode: v, custom_monthly: [...customVolSeed] };
                          }
                          return { ...prev, volume_mode: v };
                        });
                      }}
                    >
                      {VOL_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Volume multiplier (path scale)
                    <input
                      type="number"
                      step="0.05"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.vol_mult}
                      onChange={(e) => updateCtl("vol_mult", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Default rate %
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.def_rate_pct}
                      onChange={(e) => updateCtl("def_rate_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Cost of debt % (annual)
                    <input
                      type="number"
                      min={8}
                      max={35}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.debt_rate_pct}
                      onChange={(e) => updateCtl("debt_rate_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Device tier
                    <select
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.device_tier_label}
                      onChange={(e) => updateCtl("device_tier_label", e.target.value)}
                    >
                      {DEVICE_TIER_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  {paygoCtl.device_tier_label === CUSTOM_DEVICE_TIER ? (
                    <label className="block text-xs font-medium text-neutral-600">
                      Device cost (RWF)
                      <input
                        type="number"
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        value={paygoCtl.custom_dev_cost_rwf}
                        onChange={(e) => updateCtl("custom_dev_cost_rwf", Number(e.target.value))}
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {paygoCtl.volume_mode === "Custom" ? (
                <div>
                  <p className="text-xs text-neutral-600">
                    Engine uses linear ramp from month 1 → 12 using M1 and M12; steady state follows M12 (same as Streamlit).
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 12 }, (_, i) => {
                      const arr = paygoCtl.custom_monthly?.length === 12 ? paygoCtl.custom_monthly : [...customVolSeed];
                      const v = arr[i] ?? customVolSeed[i];
                      return (
                        <label key={i} className="block text-xs font-medium text-neutral-600">
                          M{i + 1} units
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                            value={v}
                            onChange={(e) => {
                              const next = [...(paygoCtl.custom_monthly?.length === 12 ? paygoCtl.custom_monthly : customVolSeed)];
                              next[i] = Number(e.target.value);
                              updateCtl("custom_monthly", next);
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Advanced pricing & mix</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-xs font-medium text-neutral-600">
                    Down payment % (at contract)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.dep_pct}
                      onChange={(e) => updateCtl("dep_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Full contract vs device price (×)
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.customer_payback_multiple}
                      onChange={(e) => updateCtl("customer_payback_multiple", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    3-mo discount % (off list)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.disc3_pct}
                      onChange={(e) => updateCtl("disc3_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    6-mo discount %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.disc6_pct}
                      onChange={(e) => updateCtl("disc6_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    12-mo discount %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.disc12_pct}
                      onChange={(e) => updateCtl("disc12_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Mix 3-mo %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.mix_p3}
                      onChange={(e) => updateCtlMix(Number(e.target.value), paygoCtl.mix_p6)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Mix 6-mo %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.mix_p6}
                      onChange={(e) => updateCtlMix(paygoCtl.mix_p3, Number(e.target.value))}
                    />
                  </label>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 px-3 py-2 text-xs text-cyan-950">
                    12-mo mix (auto): <strong>{paygoCtl.mix_p12.toFixed(0)}%</strong>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Operations, capital & lender</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-xs font-medium text-neutral-600">
                    Fixed cost / device (RWF, × steady units → monthly fixed)
                    <input
                      type="number"
                      step={250}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.fixed_opex_per_device}
                      onChange={(e) => updateCtl("fixed_opex_per_device", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Platform + CAC / unit (RWF)
                    <input
                      type="number"
                      step={500}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.platform_cac_per_unit}
                      onChange={(e) => updateCtl("platform_cac_per_unit", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Recovery on defaults %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.recovery_pct}
                      onChange={(e) => updateCtl("recovery_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Investor (equity) target %
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.investor_capital_pct}
                      onChange={(e) => {
                        const inv = Number(e.target.value);
                        updateCtl("investor_capital_pct", inv);
                        updateCtl("creditor_capital_pct", 100 - inv);
                      }}
                    />
                  </label>
                  <div className="text-xs text-neutral-600">
                    Creditor target: <strong>{paygoCtl.creditor_capital_pct.toFixed(0)}%</strong>
                  </div>
                  <label className="block text-xs font-medium text-neutral-600">
                    Loan-to-value % (stricter vs down payment %)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.ltv_pct}
                      onChange={(e) => updateCtl("ltv_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Grace (interest-only months)
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.grace_mos}
                      onChange={(e) => updateCtl("grace_mos", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Amortization months
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.amort_mos}
                      onChange={(e) => updateCtl("amort_mos", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    DSCR covenant floor (memo / chart reference)
                    <input
                      type="number"
                      step={0.05}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.dscr_floor}
                      onChange={(e) => updateCtl("dscr_floor", Number(e.target.value))}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={paygoCtl.confidence}
                      onChange={(e) => updateCtl("confidence", e.target.checked)}
                    />
                    Show ±15% confidence bands on charts (collections / EBITDA / cash)
                  </label>
                </div>
              </div>

              {resolvedInputs ? (
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer font-medium text-neutral-700">Resolved engine inputs (read-only)</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 font-mono text-[10px]">
                    {JSON.stringify(resolvedInputs, null, 0)}
                  </pre>
                </details>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runPaygo()}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  {busy ? "Running…" : "Run PAYGO model"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadPaygoDefaults()}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                >
                  Reset defaults
                </button>
              </div>
            </div>
          ) : null}

          {paygoView === "summary" ? (
            <div className="space-y-4">
              {capitalStack && summary ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-950">
                  <h3 className="font-semibold text-violet-950">Capital stack (memo view)</h3>
                  <div className="mt-2 flex h-8 max-w-xl overflow-hidden rounded-lg border border-cyan-300/40">
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-white"
                      style={{
                        width: `${capitalStack.investor_pct}%`,
                        background: "linear-gradient(90deg,#7c3aed,#a78bfa)",
                        minWidth: "56px",
                      }}
                    >
                      {capitalStack.investor_pct.toFixed(0)}% equity
                    </div>
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-slate-900"
                      style={{
                        width: `${capitalStack.creditor_pct}%`,
                        background: "linear-gradient(90deg,#0369a1,#00D4FF)",
                        minWidth: "56px",
                      }}
                    >
                      {capitalStack.creditor_pct.toFixed(0)}% debt
                    </div>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>Implied total funding envelope: {fmtRwf(capitalStack.implied_total_capital, false)}</li>
                    <li>Equity ticket: {fmtRwf(capitalStack.implied_equity_raise, false)}</li>
                    <li>Creditor tranche at peak: {fmtRwf(capitalStack.creditor_tranche_peak, false)}</li>
                  </ul>
                </div>
              ) : null}
              {summary ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Peak debt", fmtRwf(summary.peak_debt)],
                    ["Ending cash", fmtRwf(summary.ending_cash)],
                    ["Cum. EBITDA", fmtRwf(summary.cum_ebitda)],
                    ["Cum. net income", fmtRwf(summary.cum_ni)],
                    ["NPV (FCF)", fmtRwf(summary.npv_fcf)],
                    ["IRR (annual)", summary.irr_annualized != null ? fmtPct(summary.irr_annualized) : "—"],
                    ["Min DSCR", summary.min_dscr != null ? summary.min_dscr.toFixed(2) : "—"],
                    ["Gross contract / device", fmtRwf(summary.gross_contract)],
                    [
                      "Breakeven devices/mo",
                      summary.breakeven_devices_mo != null && Number.isFinite(summary.breakeven_devices_mo)
                        ? summary.breakeven_devices_mo.toFixed(0)
                        : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
                      <p className="text-xs font-medium text-emerald-900">{k}</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-950">{v}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Run the model from the Scenario tab to see KPIs.</p>
              )}
              {milestones ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
                  <h3 className="font-semibold text-neutral-900">Milestones (months)</h3>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2 text-neutral-700">
                    <li>First operating profit: month {milestones.first_operating_profit_month ?? "—"}</li>
                    <li>First net profit: month {milestones.first_net_profit_month ?? "—"}</li>
                    <li>Cumulative net positive: month {milestones.first_cumulative_net_positive_month ?? "—"}</li>
                    <li>Strongest EBITDA: month {milestones.strongest_ebitda_month ?? "—"}</li>
                  </ul>
                </div>
              ) : null}
              {chartData.length > 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-900">
                    Collections, EBITDA & cash{paygoCtl?.confidence ? " (±15% dashed)" : ""}
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                        <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} />
                        <Legend />
                        {paygoCtl?.confidence
                          ? PAYGO_CHART_KEYS.flatMap((k) => [
                              <Line
                                key={`${k}-lo`}
                                type="monotone"
                                dataKey={`${k}_lo`}
                                stroke="#94a3b8"
                                dot={false}
                                strokeWidth={1}
                                strokeDasharray="4 3"
                                name={`${k} −15%`}
                              />,
                              <Line
                                key={`${k}-hi`}
                                type="monotone"
                                dataKey={`${k}_hi`}
                                stroke="#94a3b8"
                                dot={false}
                                strokeWidth={1}
                                strokeDasharray="4 3"
                                name={`${k} +15%`}
                              />,
                            ])
                          : null}
                        {PAYGO_CHART_KEYS.map((k, i) => (
                          <Line
                            key={k}
                            type="monotone"
                            dataKey={k}
                            stroke={["#0d9488", "#6366f1", "#ca8a04"][i]}
                            dot={false}
                            strokeWidth={2}
                            name={k === "cash_end" ? "Cash end" : k === "ebitda" ? "EBITDA" : "Collections"}
                          />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {paygoView === "growth" && chartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Growth — units sold & collections</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {paygoCtl?.confidence ? (
                      <>
                        <Line yAxisId="l" type="monotone" dataKey="collections_lo" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" />
                        <Line yAxisId="l" type="monotone" dataKey="collections_hi" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" />
                        <Line yAxisId="r" type="monotone" dataKey="units_sold_lo" stroke="#fecaca" dot={false} strokeDasharray="3 3" />
                        <Line yAxisId="r" type="monotone" dataKey="units_sold_hi" stroke="#fecaca" dot={false} strokeDasharray="3 3" />
                      </>
                    ) : null}
                    <Line yAxisId="l" type="monotone" dataKey="collections" name="Collections (RWF)" stroke="#0d9488" dot={false} />
                    <Line yAxisId="r" type="monotone" dataKey="units_sold" name="Units sold" stroke="#6366f1" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {paygoView === "cash" && chartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Cash — ending balance</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} />
                    {paygoCtl?.confidence ? (
                      <>
                        <Line type="monotone" dataKey="cash_end_lo" stroke="#94a3b8" dot={false} strokeDasharray="4 3" />
                        <Line type="monotone" dataKey="cash_end_hi" stroke="#94a3b8" dot={false} strokeDasharray="4 3" />
                      </>
                    ) : null}
                    <Line type="monotone" dataKey="cash_end" name="Cash end" stroke="#ca8a04" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {paygoView === "debt" && chartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Debt & DSCR</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="d" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                    <Tooltip />
                    <Legend />
                    {paygoCtl?.confidence ? (
                      <>
                        <Line yAxisId="d" type="monotone" dataKey="closing_debt_lo" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" />
                        <Line yAxisId="d" type="monotone" dataKey="closing_debt_hi" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" />
                      </>
                    ) : null}
                    <Line yAxisId="d" type="monotone" dataKey="closing_debt" name="Closing debt" stroke="#0f172a" dot={false} />
                    <Line yAxisId="s" type="monotone" dataKey="dscr" name="DSCR" stroke="#7c3aed" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {paygoCtl ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Covenant floor reference: <strong>{paygoCtl.dscr_floor.toFixed(2)}</strong>× (from scenario ctl).
                </p>
              ) : null}
            </div>
          ) : null}

          {paygoView === "units" && summary ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm space-y-2">
              <h3 className="font-semibold text-neutral-900">Unit economics</h3>
              <ul className="list-disc space-y-1 pl-5 text-neutral-700">
                <li>Gross contract / device: {fmtRwf(summary.gross_contract)}</li>
                <li>Deposit vs device: {fmtPct(summary.deposit_vs_device)}</li>
                <li>Contribution / device (model): {fmtRwf(summary.contribution_per_device)}</li>
                <li>Expected cash / device: {fmtRwf(summary.expected_cash_per_device)}</li>
                <li>Breakeven devices / month: {summary.breakeven_devices_mo != null ? summary.breakeven_devices_mo.toFixed(1) : "—"}</li>
              </ul>
            </div>
          ) : null}

          {paygoView === "scenario" && scenarios?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">Scenario levers (after last run)</h3>
              <div className="institutional-table-wrapper mt-3 overflow-x-auto">
                <table className="institutional-table min-w-[48rem] text-sm">
                  <thead>
                    <tr>
                      {Object.keys(scenarios[0]).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j}>{v == null ? "—" : String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {paygoView === "data" && series?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">Full monthly data</h3>
                <label className="text-xs font-medium text-neutral-600">
                  Filter rows
                  <input
                    className="ml-2 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                    placeholder="any column substring"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Showing {filteredRows.length} of {series.length} rows
              </p>
              <div className="institutional-table-wrapper mt-3 max-h-[480px] overflow-auto">
                <table className="institutional-table min-w-[64rem] text-xs">
                  <thead>
                    <tr>
                      {tableColumns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, idx) => (
                      <tr key={idx}>
                        {tableColumns.map((c) => (
                          <td key={c} className="font-mono">
                            {row[c] == null ? "—" : typeof row[c] === "number" ? Number(row[c]).toFixed(2) : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {paygoView === "sensitivity" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
              <p className="text-sm text-neutral-600">
                Grids re-run the projection across default rate × volume, debt × tier, and deposit × 12-mo mix — same as the
                Streamlit “Sensitivity” page (may take a few seconds).
              </p>
              <button
                type="button"
                disabled={busy || !paygoCtl}
                onClick={() => void runHeatmaps()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Computing…" : "Compute heatmaps"}
              </button>
              {heatmaps ? (
                <div className="grid gap-6 lg:grid-cols-1">
                  <HeatmapTable block={heatmaps.cumulativeNetIncome} />
                  <HeatmapTable block={heatmaps.irrDebtTier} />
                  <HeatmapTable block={heatmaps.ebitdaBreakevenMonth} />
                </div>
              ) : (
                <p className="text-xs text-neutral-500">No heatmaps yet.</p>
              )}
            </div>
          ) : null}

          {paygoView === "compare" && paygoCtl && paygoCtlB ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
              <p className="text-sm text-neutral-600">
                Scenario A is the current builder. Edit B (or reset B from A), then run. Charts show cumulative EBITDA and net income.
              </p>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                onClick={() => paygoCtl && setPaygoCtlB({ ...paygoCtl })}
              >
                Copy A → B
              </button>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-xs font-medium text-neutral-700">
                  B — Default rate %
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.def_rate_pct}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, def_rate_pct: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Cost of debt %
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.debt_rate_pct}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, debt_rate_pct: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Payback multiple (×)
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.customer_payback_multiple}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, customer_payback_multiple: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Volume path
                  <select
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.volume_mode}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, volume_mode: e.target.value })}
                  >
                    {VOL_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Device tier
                  <select
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.device_tier_label}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, device_tier_label: e.target.value })}
                  >
                    {DEVICE_TIER_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Investor equity %
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.investor_capital_pct}
                    onChange={(e) => {
                      const inv = Number(e.target.value);
                      setPaygoCtlB({ ...paygoCtlB, investor_capital_pct: inv, creditor_capital_pct: 100 - inv });
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runCompare()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Run A vs B
              </button>
              {compareResult ? (
                <>
                  {compareResult.assumptionDiffs.length ? (
                    <div>
                      <h4 className="text-sm font-semibold">Assumption differences</h4>
                      <div className="institutional-table-wrapper mt-2 overflow-x-auto">
                        <table className="institutional-table text-xs">
                          <thead>
                            <tr>
                              <th>Assumption</th>
                              <th>A</th>
                              <th>B</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareResult.assumptionDiffs.map((r, i) => (
                              <tr key={i}>
                                <td>{r.assumption}</td>
                                <td>{String(r.A)}</td>
                                <td>{String(r.B)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  <p className="text-sm text-emerald-900">
                    Δ cumulative net income (B − A): <strong>{fmtRwf(compareResult.deltaCumulativeNetIncome, true)}</strong>
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }} data={compareChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
                        <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} />
                        <Legend />
                        <Line type="monotone" dataKey="aE" name="A cum EBITDA" stroke="#0d9488" dot={false} />
                        <Line type="monotone" dataKey="bE" name="B cum EBITDA" stroke="#6366f1" strokeDasharray="4 4" dot={false} />
                        <Line type="monotone" dataKey="aN" name="A cum NI" stroke="#ca8a04" dot={false} />
                        <Line type="monotone" dataKey="bN" name="B cum NI" stroke="#db2777" strokeDasharray="4 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "budget" ? (
        <BusinessModelBudgetTab token={token} paygoCtl={paygoCtl as unknown as Record<string, unknown> | null} />
      ) : null}

      {tab === "memos" ? (
        <BusinessModelMemosTab token={token} paygoCtl={paygoCtl as unknown as Record<string, unknown> | null} />
      ) : null}

      {tab === "broiler" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["economics", "Batch economics"],
                ["operations", "Operations cockpit"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBroilerSub(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  broilerSub === id ? "bg-slate-800 text-white" : "border border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {broilerSub === "operations" ? (
            <BusinessModelBroilerOpsTab
              token={token}
              broilerInputs={broilerInputs}
              cycleId={broilerCycleId}
              onCycleIdChange={setBroilerCycleId}
            />
          ) : null}

          {broilerSub === "economics" ? (
            <>
          {broilerInputs ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["chicks", "Chicks placed"],
                  ["cost_per_chick", "Cost / chick (RWF)"],
                  ["mortality_pct", "Mortality % (cycle)"],
                  ["cycle_days", "Cycle days"],
                  ["finish_weight_kg", "Finish weight (kg)"],
                  ["price_per_kg", "Price / kg (RWF)"],
                  ["feed_price_per_kg", "Feed / kg (RWF)"],
                  ["fcr", "FCR"],
                  ["feed_kg_total", "Feed kg total (0=derive)"],
                  ["med_vaccine_total", "Med / vaccine (RWF)"],
                  ["labor_total", "Labor (RWF)"],
                  ["utilities_total", "Utilities (RWF)"],
                  ["transport_total", "Transport (RWF)"],
                  ["overhead_fixed", "Overhead fixed (RWF)"],
                  ["mortality_curve_exponent", "Mortality curve exp"],
                ].map(([key, label]) => (
                  <label key={key} className="block text-xs font-medium text-neutral-600">
                    {label}
                    <input
                      type="number"
                      step="any"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={broilerInputs[key] ?? ""}
                      onChange={(e) => updateBroiler(key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runBroiler()}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  {busy ? "Running…" : "Run broiler model"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadBroilerDefaults()}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                >
                  Reset defaults
                </button>
              </div>
            </div>
          ) : null}

          {broilerSummary && broilerSub === "economics" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Net profit", fmtRwf(broilerSummary.net_profit_rwf)],
                ["Gross profit", fmtRwf(broilerSummary.gross_profit_rwf)],
                ["Revenue", fmtRwf(broilerSummary.revenue_rwf)],
                ["Total cost", fmtRwf(broilerSummary.total_cost_rwf)],
                ["Birds harvested", broilerSummary.birds_end.toFixed(0)],
                ["Effective FCR", broilerSummary.effective_fcr.toFixed(3)],
                ["Break-even price/kg", fmtRwf(broilerSummary.break_even_price_per_kg, false)],
                ["ROI (cycle)", Number.isFinite(broilerSummary.roi_cycle) ? fmtPct(broilerSummary.roi_cycle) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                  <p className="text-xs font-medium text-neutral-500">{k}</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">{v}</p>
                </div>
              ))}
            </div>
          ) : null}

          {broilerSub === "economics" && weeklyMortality?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
              <h3 className="font-semibold text-neutral-900">Weekly mortality %</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {weeklyMortality.map((w) => (
                  <li key={w.week} className="rounded border border-neutral-200 px-2 py-1 text-xs">
                    W{w.week}: {w.mortality_pct_of_week_start.toFixed(2)}%
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {broilerSub === "economics" && insights?.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
              <h3 className="font-semibold">Insights</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {insights.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {broilerSub === "economics" && trajectory?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Birds alive & cumulative cost</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trajectory.map((r) => ({
                      day: r.day,
                      birds: r.birds_alive,
                      cost: r.cost_cum_rwf / 1e6,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="birds" name="Birds alive" stroke="#0d9488" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost (M RWF)" stroke="#6366f1" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
