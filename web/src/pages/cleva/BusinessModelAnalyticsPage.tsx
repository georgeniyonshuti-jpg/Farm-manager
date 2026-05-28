import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
type LiveActualRow = { month: number; kpi_key: string; value: number; source: string; date_label: string };

type HeatmapBlock = {
  title: string;
  yLabels: string[];
  xLabels: string[];
  z: number[][];
  cellKind?: "money" | "irr" | "month";
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

const CHART_COLORS = {
  collections: "#0d9488",
  ebitda: "#6366f1",
  cash_end: "#ca8a04",
  units_sold: "#7c3aed",
  closing_debt: "#dc2626",
  net_income: "#16a34a",
  dscr: "#0369a1",
};

/** Per-KPI explanations shown in the explanation panel */
const METRIC_META: Record<string, { label: string; formula: string; interpretation: string; risk: string; unit: string }> = {
  peak_debt: {
    label: "Peak Debt",
    unit: "RWF",
    formula: "max(closing_debt) across all months",
    interpretation:
      "The largest single-month facility balance. This is the size of credit line required. " +
      "The capital stack investor/creditor split determines how much of this is equity-backed vs debt-funded.",
    risk: "Larger peak debt increases interest burden and lender concentration risk.",
  },
  ending_cash: {
    label: "Ending Cash",
    unit: "RWF",
    formula: "cash_end in final projection month",
    interpretation:
      "Cash on hand at the end of the modeled horizon. Positive values indicate the business has not consumed " +
      "its reserves. Should remain above the minimum cash floor (RWF 50M) at all times.",
    risk: "If ending cash is low, the model is running on minimum reserve — any shortfall triggers more drawdowns.",
  },
  cum_ebitda: {
    label: "Cumulative EBITDA",
    unit: "RWF",
    formula: "∑ EBITDA across all months",
    interpretation:
      "Total operational cash generation before financing costs. Positive cumulative EBITDA means the business " +
      "earns enough from operations to cover costs. Negative values mean fixed costs have not yet been absorbed.",
    risk: "Slow volume ramp or high default rates are the primary drivers of negative cumulative EBITDA.",
  },
  cum_ni: {
    label: "Cumulative Net Income",
    unit: "RWF",
    formula: "∑ net_income = ∑ (EBITDA − interest − tax)",
    interpretation:
      "Total profit after interest and tax across the full horizon. The key metric for equity investors — " +
      "positive cumulative NI means the business has more than paid back the cost of money over the period.",
    risk: "High debt costs or long grace/amortization periods compress NI even when EBITDA is positive.",
  },
  npv_fcf: {
    label: "NPV of Free Cash Flow",
    unit: "RWF",
    formula: "∑ FCF_t / (1 + hurdle/12)^t  at 15% annual hurdle",
    interpretation:
      "The present value of all future free cash flows, discounted to today. " +
      "A positive NPV means the business creates value above the required return rate. " +
      "This is the primary go/no-go decision metric for equity investors.",
    risk: "NPV is sensitive to the hurdle rate assumption and the terminal cash flow profile.",
  },
  irr_annualized: {
    label: "IRR (annualized)",
    unit: "%",
    formula: "(1 + monthly_IRR)^12 − 1  [bisection on FCF stream]",
    interpretation:
      "The annualized rate of return implied by the full free cash flow stream. " +
      "Above the hurdle rate (15%) indicates value creation. " +
      "Very high IRR (>50%) often indicates the model is running with low upfront capital needs.",
    risk: "IRR is highly sensitive to early cash flows — front-loaded losses sharply reduce it.",
  },
  min_dscr: {
    label: "Minimum DSCR",
    unit: "×",
    formula: "min(EBITDA / (interest + principal)) across months with debt service",
    interpretation:
      "The tightest month for debt coverage. The DSCR covenant floor (typically 1.15×) must not be breached. " +
      "A DSCR of 1.0× means EBITDA exactly covers debt service — any lower means cash shortfall.",
    risk: "Volume dips in months with high debt service create covenant breach risk.",
  },
  gross_contract: {
    label: "Gross Contract / Device",
    unit: "RWF",
    formula: "base_repay × (1 − discount) weighted by 3/6/12-month plan mix",
    interpretation:
      "The weighted-average total revenue expected per device sold, before accounting for defaults. " +
      "Higher mix of 12-month plans and lower discounts increase this figure.",
    risk: "Default rate erodes realized collections below this theoretical maximum.",
  },
  contribution_per_device: {
    label: "Contribution / Device",
    unit: "RWF",
    formula: "expected_cash_per_device − (device cost + all variable costs per unit)",
    interpretation:
      "The net cash margin generated per device after all variable costs. " +
      "Must be positive and high enough to cover the share of fixed monthly opex.",
    risk: "Device cost increases or higher default rates quickly erode per-unit contribution.",
  },
  breakeven_devices_mo: {
    label: "Breakeven Volume",
    unit: "units/month",
    formula: "fixed_monthly_opex / contribution_per_device",
    interpretation:
      "The minimum number of devices that must be sold every month to keep EBITDA non-negative at steady state. " +
      "The ramp path determines how quickly this threshold is crossed.",
    risk: "Fixed opex is largely fixed regardless of volume; missing this breakeven extends the loss period.",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRwf(n: number | null | undefined, compact = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Number(n);
  if (compact && Math.abs(v) >= 1e9) return `RWF ${(v / 1e9).toFixed(2)}B`;
  if (compact && Math.abs(v) >= 1e6) return `RWF ${(v / 1e6).toFixed(1)}M`;
  if (compact && Math.abs(v) >= 1e3) return `RWF ${(v / 1e3).toFixed(0)}K`;
  return `RWF ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(Number(n) * 100).toFixed(decimals)}%`;
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PaygoView =
  | "summary"
  | "growth"
  | "cash"
  | "debt"
  | "units"
  | "scenario"
  | "sensitivity"
  | "data"
  | "compare"
  | "live";

type TabId = "paygo" | "budget" | "memos" | "broiler";

// ─── Sub-components ──────────────────────────────────────────────────────────

function DataSourceBadge({ source }: { source: "model" | "live_db" | "csv_import" | "manual" | "cleva_feed" }) {
  const cfg = {
    model: { label: "Model", cls: "bg-indigo-100 text-indigo-800" },
    live_db: { label: "Live DB", cls: "bg-emerald-100 text-emerald-800" },
    csv_import: { label: "CSV import", cls: "bg-amber-100 text-amber-800" },
    manual: { label: "Manual", cls: "bg-slate-100 text-slate-700" },
    cleva_feed: { label: "Env feed", cls: "bg-cyan-100 text-cyan-800" },
  }[source] ?? { label: source, cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  metaKey,
  expanded,
  onToggle,
  color = "emerald",
}: {
  label: string;
  value: string;
  metaKey?: string;
  expanded?: boolean;
  onToggle?: () => void;
  color?: string;
}) {
  const meta = metaKey ? METRIC_META[metaKey] : null;
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-100 bg-emerald-50/80",
    violet: "border-violet-100 bg-violet-50/80",
    amber: "border-amber-100 bg-amber-50/80",
    red: "border-red-100 bg-red-50/80",
    slate: "border-neutral-200 bg-white",
    blue: "border-blue-100 bg-blue-50/80",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] ?? colorMap.slate}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-neutral-700">{label}</p>
        {meta && onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            title="Explain this metric"
            className="shrink-0 rounded-full border border-neutral-300 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500 hover:bg-neutral-100"
          >
            {expanded ? "▲" : "?"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold text-neutral-900">{value}</p>
      {expanded && meta ? (
        <div className="mt-2 space-y-1.5 border-t border-neutral-200 pt-2">
          <p className="text-[10px] font-mono text-neutral-500">Formula: {meta.formula}</p>
          <p className="text-[11px] text-neutral-600">{meta.interpretation}</p>
          <p className="text-[10px] text-amber-700">
            <span className="font-semibold">Risk: </span>
            {meta.risk}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ExportCsvButton({
  label,
  onClick,
  busy,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
    >
      <span>↓</span>
      {busy ? "Exporting…" : label}
    </button>
  );
}

function SensitivitySliders({
  paygoCtl,
  onCtlChange,
  summary,
  busy,
  onRun,
}: {
  paygoCtl: PaygoCtl;
  onCtlChange: <K extends keyof PaygoCtl>(k: K, v: PaygoCtl[K]) => void;
  summary: Record<string, number | null> | null;
  busy: boolean;
  onRun: () => void;
}) {
  const sliders: { key: keyof PaygoCtl; label: string; min: number; max: number; step: number; display: (v: number) => string }[] = [
    { key: "def_rate_pct", label: "Default rate %", min: 1, max: 25, step: 0.5, display: (v) => `${v}%` },
    { key: "debt_rate_pct", label: "Cost of debt %", min: 8, max: 35, step: 0.5, display: (v) => `${v}%` },
    { key: "vol_mult", label: "Volume multiplier", min: 0.3, max: 3.0, step: 0.1, display: (v) => `${v.toFixed(1)}×` },
    { key: "customer_payback_multiple", label: "Payback multiple", min: 1.2, max: 3.0, step: 0.05, display: (v) => `${v.toFixed(2)}×` },
    { key: "dep_pct", label: "Down payment %", min: 10, max: 60, step: 1, display: (v) => `${v}%` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-neutral-800">Interactive sensitivity sliders</p>
        <p className="text-xs text-neutral-500">Drag a lever, then re-run to see impact.</p>
        <button
          type="button"
          disabled={busy}
          onClick={onRun}
          className="ml-auto rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Running…" : "Re-run model"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sliders.map(({ key, label, min, max, step, display }) => {
          const val = Number(paygoCtl[key] ?? 0);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-700">{label}</span>
                <span className="text-sm font-bold text-emerald-900">{display(val)}</span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => onCtlChange(key, Number(e.target.value) as PaygoCtl[typeof key])}
                className="mt-2 w-full accent-emerald-700"
              />
              <div className="mt-0.5 flex justify-between text-[9px] text-neutral-400">
                <span>{display(min)}</span>
                <span>{display(max)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {summary ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-emerald-900">Quick KPI preview (last run)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Cum EBITDA", fmtRwf(summary.cum_ebitda)],
              ["Cum NI", fmtRwf(summary.cum_ni)],
              ["Peak debt", fmtRwf(summary.peak_debt)],
              ["IRR", summary.irr_annualized != null ? fmtPct(summary.irr_annualized, 1) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="text-center">
                <p className="text-[10px] text-emerald-700">{k}</p>
                <p className="text-sm font-bold text-emerald-950">{v}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeatmapTable({ block }: { block: HeatmapBlock }) {
  const flat = block.z.flat().filter((v) => Number.isFinite(v));
  const lo = flat.length ? Math.min(...flat) : 0;
  const hi = flat.length ? Math.max(...flat) : 1;

  function heatmapColor(t: number): string {
    if (!Number.isFinite(t)) return "#e2e8f0";
    const x = hi === lo ? 0.5 : (t - lo) / (hi - lo);
    const u = Math.max(0, Math.min(1, x));
    return `hsl(${140 - u * 120}, ${60 + u * 30}%, ${25 + u * 30}%)`;
  }

  function fmtCell(cell: number): string {
    if (!Number.isFinite(cell)) return "—";
    if (block.cellKind === "irr") return `${cell.toFixed(1)}%`;
    if (block.cellKind === "month") return cell.toFixed(0);
    if (Math.abs(cell) >= 1e9) return `${(cell / 1e9).toFixed(2)}B`;
    if (Math.abs(cell) >= 1e6) return `${(cell / 1e6).toFixed(1)}M`;
    return cell.toFixed(0);
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs font-semibold text-neutral-700">{block.title}</p>
      <p className="mb-2 text-[10px] text-neutral-500">
        Darker = higher value. Each cell re-runs the full model with those axis assumptions.
      </p>
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
                  style={{ background: heatmapColor(cell), color: "#fff" }}
                  className="font-mono text-center"
                >
                  {fmtCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveDataPanel({
  liveActuals,
  loadedAt,
  onLoad,
  busy,
  series,
}: {
  liveActuals: LiveActualRow[] | null;
  loadedAt: string | null;
  onLoad: () => void;
  busy: boolean;
  series: MonthlyRow[] | null;
}) {
  const byKpi = useMemo(() => {
    if (!liveActuals?.length) return new Map<string, LiveActualRow[]>();
    const m = new Map<string, LiveActualRow[]>();
    for (const r of liveActuals) {
      if (!m.has(r.kpi_key)) m.set(r.kpi_key, []);
      m.get(r.kpi_key)!.push(r);
    }
    return m;
  }, [liveActuals]);

  const collectionsRows = byKpi.get("collections") ?? [];

  const chartData = useMemo(() => {
    if (!collectionsRows.length && !series?.length) return [];
    const modelMap = new Map(series?.map((r) => [Number(r.month), Number(r.collections) || 0]) ?? []);
    const months = new Set([...collectionsRows.map((r) => r.month), ...Array.from(modelMap.keys())]);
    return [...months]
      .sort((a, b) => a - b)
      .map((m) => ({
        month: `M${m}`,
        model: modelMap.get(m) ?? null,
        actual: collectionsRows.find((r) => r.month === m)?.value ?? null,
        label: collectionsRows.find((r) => r.month === m)?.date_label ?? `M${m}`,
      }));
  }, [collectionsRows, series]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm font-semibold text-neutral-800">Live farm operations data</p>
          <p className="text-xs text-neutral-500">
            Pulls slaughter revenue, birds sold, and feed costs from the live farm DB — maps to PAYGO actuals format.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onLoad}
          className="ml-auto rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Loading…" : "Pull live data"}
        </button>
      </div>

      {loadedAt ? (
        <p className="text-[10px] text-neutral-400">
          Last pulled: {new Date(loadedAt).toLocaleString()}
        </p>
      ) : null}

      {liveActuals?.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["collections", "units_sold", "yield_per_active", "active_flocks"] as const).map((kpi) => {
              const rows = byKpi.get(kpi) ?? [];
              const latest = rows[rows.length - 1];
              return (
                <div key={kpi} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <p className="text-xs font-medium text-neutral-500 capitalize">{kpi.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">
                    {latest ? (kpi === "collections" || kpi === "yield_per_active" ? fmtRwf(latest.value) : fmtNum(latest.value, 0)) : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-neutral-400">{latest?.date_label ?? "No data"}</p>
                  <DataSourceBadge source="live_db" />
                </div>
              );
            })}
          </div>

          {chartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <h4 className="mb-2 text-sm font-semibold text-neutral-800">
                Collections — Model vs Farm actuals (RWF)
              </h4>
              <p className="mb-3 text-xs text-neutral-500">
                Model line shows projected PAYGO collections. Bars show actual farm revenue from slaughter events in the live DB.
                Gaps indicate months with no slaughter activity.
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} />
                    <Legend />
                    <Bar dataKey="actual" name="Farm actual (live DB)" fill="#0d9488" opacity={0.8} />
                    <Line type="monotone" dataKey="model" name="PAYGO model" stroke="#6366f1" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h4 className="mb-2 text-sm font-semibold text-neutral-800">All live actuals ({liveActuals.length} rows)</h4>
            <div className="institutional-table-wrapper max-h-64 overflow-auto">
              <table className="institutional-table text-xs">
                <thead>
                  <tr>
                    <th>Model month</th>
                    <th>Date</th>
                    <th>KPI</th>
                    <th className="tbl-num">Value</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {liveActuals.map((r, i) => (
                    <tr key={i}>
                      <td className="tbl-mono">M{r.month}</td>
                      <td>{r.date_label}</td>
                      <td>{r.kpi_key.replace(/_/g, " ")}</td>
                      <td className="tbl-num">
                        {r.kpi_key === "collections" || r.kpi_key === "yield_per_active" || r.kpi_key === "feed_cost_rwf"
                          ? fmtRwf(r.value)
                          : fmtNum(r.value, 0)}
                      </td>
                      <td>
                        <DataSourceBadge source={r.source as "live_db"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm text-neutral-500">Click "Pull live data" to load farm operations actuals.</p>
          <p className="mt-1 text-xs text-neutral-400">
            Requires slaughter events with price_per_kg and avg_carcass_weight_kg populated.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function BusinessModelAnalyticsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabId>("paygo");
  const [paygoView, setPaygoView] = useState<PaygoView>("scenario");
  const [broilerCycleId, setBroilerCycleId] = useState("flock-1");
  const [broilerSub, setBroilerSub] = useState<"economics" | "operations">("economics");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  // PAYGO model state
  const [paygoCtl, setPaygoCtl] = useState<PaygoCtl | null>(null);
  const [paygoCtlB, setPaygoCtlB] = useState<PaygoCtl | null>(null);
  const [resolvedInputs, setResolvedInputs] = useState<Record<string, number> | null>(null);
  const [series, setSeries] = useState<MonthlyRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number | null> | null>(null);
  const [milestones, setMilestones] = useState<Record<string, number | null> | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, unknown>[] | null>(null);
  const [capitalStack, setCapitalStack] = useState<Record<string, number> | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [runTimestamp, setRunTimestamp] = useState<string | null>(null);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

  // Heatmaps & comparison
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

  // Live data
  const [liveActuals, setLiveActuals] = useState<LiveActualRow[] | null>(null);
  const [liveLoadedAt, setLiveLoadedAt] = useState<string | null>(null);

  // Broiler state
  const [broilerInputs, setBroilerInputs] = useState<BroilerInputs | null>(null);
  const [broilerSummary, setBroilerSummary] = useState<Record<string, number> | null>(null);
  const [trajectory, setTrajectory] = useState<Record<string, number>[] | null>(null);
  const [insights, setInsights] = useState<string[] | null>(null);
  const [weeklyMortality, setWeeklyMortality] = useState<
    { week: number; mortality_pct_of_week_start: number }[] | null
  >(null);

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
      setRunTimestamp(new Date().toISOString());
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
      setWeeklyMortality(
        (d as { weeklyMortality?: { week: number; mortality_pct_of_week_start: number }[] }).weeklyMortality ?? null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Broiler model failed");
    } finally {
      setBusy(false);
    }
  };

  const loadLiveActuals = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/live-actuals`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setLiveActuals((d as { rows: LiveActualRow[] }).rows);
      setLiveLoadedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load live data");
    } finally {
      setBusy(false);
    }
  };

  const exportProjectionCsv = async () => {
    if (!paygoCtl) return;
    setExportBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/export-csv/projection`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      downloadCsv(text, "cleva-paygo-projection.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const exportVarianceCsv = async () => {
    if (!paygoCtl) return;
    setExportBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/export-csv/variance`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      downloadCsv(text, "cleva-budget-variance.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const exportHeatmapsCsv = async () => {
    if (!paygoCtl) return;
    setExportBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/export-csv/heatmaps`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      downloadCsv(text, "cleva-sensitivity-heatmaps.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  const exportCompareCsv = async () => {
    if (!paygoCtl || !paygoCtlB) return;
    setExportBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/export-csv/compare`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctlA: paygoCtl, ctlB: paygoCtlB }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      downloadCsv(text, "cleva-scenario-compare.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  };

  // Derived chart data
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
        net_income: Number(row.net_income) || 0,
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

  const customVolSeed = useMemo(() => Array.from({ length: 12 }, (_, i) => Math.max(50, 300 + i * 350)), []);

  const compareChartData = useMemo(() => {
    if (!compareResult) return [];
    let cumAE = 0, cumBE = 0, cumAN = 0, cumBN = 0;
    return compareResult.seriesA.map((row, i) => {
      cumAE += Number(row.ebitda) || 0;
      cumBE += Number(compareResult.seriesB[i]?.ebitda) || 0;
      cumAN += Number(row.net_income) || 0;
      cumBN += Number(compareResult.seriesB[i]?.net_income) || 0;
      return { month: row.month, aE: cumAE, bE: cumBE, aN: cumAN, bN: cumBN };
    });
  }, [compareResult]);

  const cumulativeChartData = useMemo(() => {
    if (!series?.length) return [];
    let cumEbitda = 0, cumNi = 0;
    return series.map((row) => {
      cumEbitda += Number(row.ebitda) || 0;
      cumNi += Number(row.net_income) || 0;
      return { month: row.month, cumEbitda, cumNi, collections: Number(row.collections) || 0 };
    });
  }, [series]);

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

  function toggleMetric(key: string) {
    setExpandedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateBroiler(key: string, value: number) {
    setBroilerInputs((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <PageHeader
          title="Business model analytics"
          subtitle="Hybrid PAYGO workspace — live DB actuals + CSV uploads + manual overrides. Interactive scenario analysis, sensitivity heatmaps, detailed exports, and report-grade PDFs."
        />
        {runTimestamp ? (
          <p className="mt-2 text-xs text-neutral-400">
            Last run: {new Date(runTimestamp).toLocaleString()} ·{" "}
            {liveActuals?.length ? (
              <span className="inline-flex items-center gap-1">
                <DataSourceBadge source="live_db" />
                <span>{liveActuals.length} live actuals loaded</span>
              </span>
            ) : (
              "No live actuals loaded"
            )}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4">
            <ErrorState message={error} onRetry={() => void loadPaygoDefaults()} />
          </div>
        ) : null}
      </div>

      {/* Main tabs */}
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

      {/* ── PAYGO workspace ── */}
      {tab === "paygo" ? (
        <div className="space-y-4">
          {!paygoCtl ? <p className="text-sm text-neutral-500">Loading scenario defaults…</p> : null}

          {/* Sub-view tabs */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["summary", "Summary"],
                ["growth", "Growth"],
                ["cash", "Cash"],
                ["debt", "Debt"],
                ["units", "Unit econ."],
                ["scenario", "Scenario"],
                ["sensitivity", "Sensitivity"],
                ["data", "Data"],
                ["compare", "A vs B"],
                ["live", "Live data"],
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

          {/* ── Scenario builder (always shown when on scenario view) ── */}
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
                        <option key={m} value={m}>{m}</option>
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
                      {VOL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Volume multiplier
                    <input
                      type="number" step="0.05"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.vol_mult}
                      onChange={(e) => updateCtl("vol_mult", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Default rate %
                    <input
                      type="number" min={1} max={20}
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtl.def_rate_pct}
                      onChange={(e) => updateCtl("def_rate_pct", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Cost of debt % (annual)
                    <input
                      type="number" min={8} max={35}
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
                      {DEVICE_TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
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
                  <p className="text-xs text-neutral-600">Custom monthly volume (M1–M12 ramp, steady state follows M12).</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 12 }, (_, i) => {
                      const arr = paygoCtl.custom_monthly?.length === 12 ? paygoCtl.custom_monthly : [...customVolSeed];
                      return (
                        <label key={i} className="block text-xs font-medium text-neutral-600">
                          M{i + 1} units
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                            value={arr[i] ?? customVolSeed[i]}
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
                    Down payment %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.dep_pct} onChange={(e) => updateCtl("dep_pct", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Full contract vs device price (×)
                    <input type="number" step="0.01" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.customer_payback_multiple} onChange={(e) => updateCtl("customer_payback_multiple", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    3-mo discount %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.disc3_pct} onChange={(e) => updateCtl("disc3_pct", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    6-mo discount %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.disc6_pct} onChange={(e) => updateCtl("disc6_pct", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    12-mo discount %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.disc12_pct} onChange={(e) => updateCtl("disc12_pct", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Mix 3-mo %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.mix_p3} onChange={(e) => updateCtlMix(Number(e.target.value), paygoCtl.mix_p6)} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Mix 6-mo %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.mix_p6} onChange={(e) => updateCtlMix(paygoCtl.mix_p3, Number(e.target.value))} />
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
                    Fixed cost / device (RWF)
                    <input type="number" step={250} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.fixed_opex_per_device} onChange={(e) => updateCtl("fixed_opex_per_device", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Platform + CAC / unit (RWF)
                    <input type="number" step={500} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.platform_cac_per_unit} onChange={(e) => updateCtl("platform_cac_per_unit", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Recovery on defaults %
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.recovery_pct} onChange={(e) => updateCtl("recovery_pct", Number(e.target.value))} />
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
                    Grace (interest-only months)
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.grace_mos} onChange={(e) => updateCtl("grace_mos", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    Amortization months
                    <input type="number" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.amort_mos} onChange={(e) => updateCtl("amort_mos", Number(e.target.value))} />
                  </label>
                  <label className="block text-xs font-medium text-neutral-600">
                    DSCR covenant floor
                    <input type="number" step={0.05} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" value={paygoCtl.dscr_floor} onChange={(e) => updateCtl("dscr_floor", Number(e.target.value))} />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-700 sm:col-span-2">
                    <input type="checkbox" checked={paygoCtl.confidence} onChange={(e) => updateCtl("confidence", e.target.checked)} />
                    Show ±15% confidence bands on charts
                  </label>
                </div>
              </div>

              {resolvedInputs ? (
                <details className="text-xs text-neutral-500">
                  <summary className="cursor-pointer font-medium text-neutral-700">Resolved engine inputs (read-only)</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 font-mono text-[10px]">
                    {JSON.stringify(resolvedInputs, null, 2)}
                  </pre>
                </details>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button" disabled={busy} onClick={() => void runPaygo()}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  {busy ? "Running…" : "Run PAYGO model"}
                </button>
                <button
                  type="button" onClick={() => void loadPaygoDefaults()}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                >
                  Reset defaults
                </button>
                <ExportCsvButton label="Export projection CSV" onClick={() => void exportProjectionCsv()} busy={exportBusy} disabled={!paygoCtl} />
              </div>
            </div>
          ) : null}

          {/* ── Summary view ── */}
          {paygoView === "summary" ? (
            <div className="space-y-4">
              {/* Methodology strip */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                <strong>How to read this:</strong> Run the model from the Scenario tab. Summary shows final KPIs — click the{" "}
                <span className="rounded bg-neutral-200 px-1 font-mono">?</span> on any card for formula, interpretation, and risk
                notes.
              </div>

              {capitalStack && summary ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-950">
                  <h3 className="font-semibold">Capital stack (memo view)</h3>
                  <div className="mt-2 flex h-8 max-w-xl overflow-hidden rounded-lg border border-cyan-300/40">
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ width: `${capitalStack.investor_pct}%`, background: "linear-gradient(90deg,#7c3aed,#a78bfa)", minWidth: "56px" }}
                    >
                      {capitalStack.investor_pct.toFixed(0)}% equity
                    </div>
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-slate-900"
                      style={{ width: `${capitalStack.creditor_pct}%`, background: "linear-gradient(90deg,#0369a1,#00D4FF)", minWidth: "56px" }}
                    >
                      {capitalStack.creditor_pct.toFixed(0)}% debt
                    </div>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    <li>Total capital envelope: {fmtRwf(capitalStack.implied_total_capital, false)}</li>
                    <li>Equity ticket: {fmtRwf(capitalStack.implied_equity_raise, false)}</li>
                    <li>Creditor tranche at peak: {fmtRwf(capitalStack.creditor_tranche_peak, false)}</li>
                  </ul>
                </div>
              ) : null}

              {summary ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["Peak debt", fmtRwf(summary.peak_debt), "peak_debt", "violet"],
                      ["Ending cash", fmtRwf(summary.ending_cash), "ending_cash", "emerald"],
                      ["Cum. EBITDA", fmtRwf(summary.cum_ebitda), "cum_ebitda", "emerald"],
                      ["Cum. net income", fmtRwf(summary.cum_ni), "cum_ni", summary.cum_ni != null && summary.cum_ni >= 0 ? "emerald" : "red"],
                      ["NPV (FCF)", fmtRwf(summary.npv_fcf), "npv_fcf", "blue"],
                      ["IRR (annual)", summary.irr_annualized != null ? fmtPct(summary.irr_annualized, 1) : "—", "irr_annualized", "blue"],
                      ["Min DSCR", summary.min_dscr != null ? `${summary.min_dscr.toFixed(2)}×` : "—", "min_dscr", "slate"],
                      ["Gross contract / device", fmtRwf(summary.gross_contract), "gross_contract", "slate"],
                      ["Contribution / device", fmtRwf(summary.contribution_per_device), "contribution_per_device", "slate"],
                      ["Breakeven devices/mo", summary.breakeven_devices_mo != null && Number.isFinite(summary.breakeven_devices_mo) ? summary.breakeven_devices_mo.toFixed(0) : "—", "breakeven_devices_mo", "amber"],
                    ] as const
                  ).map(([k, v, metaKey, color]) => (
                    <MetricCard
                      key={k}
                      label={k}
                      value={v}
                      metaKey={metaKey}
                      expanded={expandedMetrics.has(metaKey)}
                      onToggle={() => toggleMetric(metaKey)}
                      color={color}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Run the model from the Scenario tab to see KPIs.</p>
              )}

              {milestones ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="font-semibold text-neutral-900">Profitability milestones</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
                    {[
                      ["First EBITDA+ month", milestones.first_operating_profit_month, "Month EBITDA first turns positive"],
                      ["First net profit month", milestones.first_net_profit_month, "Month net income first turns positive"],
                      ["Cumulative NI+ month", milestones.first_cumulative_net_positive_month, "Month cumulative NI crosses zero"],
                      ["Strongest EBITDA month", milestones.strongest_ebitda_month, `${fmtRwf(milestones.strongest_ebitda_rwf)}`],
                    ].map(([k, v, sub]) => (
                      <div key={k as string} className="rounded-lg border border-neutral-200 p-3">
                        <p className="text-xs font-medium text-neutral-500">{k as string}</p>
                        <p className="text-lg font-bold text-neutral-900">Month {v ?? "—"}</p>
                        <p className="text-xs text-neutral-400">{sub as string}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Cumulative NI/EBITDA chart */}
              {cumulativeChartData.length > 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Cumulative EBITDA & net income</h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    Where these lines cross zero tells you your breakeven months. Divergence between EBITDA and NI shows the
                    cost of financing.
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cumulativeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gEbitda" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="gNi" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                        <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} labelFormatter={(l) => `Month ${l}`} />
                        <Legend />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="cumEbitda" name="Cumulative EBITDA" stroke="#6366f1" fill="url(#gEbitda)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="cumNi" name="Cumulative Net Income" stroke="#16a34a" fill="url(#gNi)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {/* Monthly collections + EBITDA + cash */}
              {chartData.length > 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">
                    Monthly collections, EBITDA & cash{paygoCtl?.confidence ? " (±15% bands)" : ""}
                  </h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    Collections grow as the portfolio of active loans compounds. EBITDA negative early months reflect device
                    deployment. Cash is floored by minimum reserve policy.
                  </p>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                        <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} labelFormatter={(l) => `Month ${l}`} />
                        <Legend />
                        {paygoCtl?.confidence
                          ? (["collections", "ebitda", "cash_end"] as const).flatMap((k) => [
                              <Line key={`${k}-lo`} type="monotone" dataKey={`${k}_lo`} stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="4 3" name={`${k} −15%`} />,
                              <Line key={`${k}-hi`} type="monotone" dataKey={`${k}_hi`} stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="4 3" name={`${k} +15%`} />,
                            ])
                          : null}
                        <Line type="monotone" dataKey="collections" stroke={CHART_COLORS.collections} dot={false} strokeWidth={2} name="Collections" />
                        <Line type="monotone" dataKey="ebitda" stroke={CHART_COLORS.ebitda} dot={false} strokeWidth={2} name="EBITDA" />
                        <Line type="monotone" dataKey="cash_end" stroke={CHART_COLORS.cash_end} dot={false} strokeWidth={2} name="Cash end" />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {/* Export strip */}
              {series?.length ? (
                <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="w-full text-xs font-semibold text-neutral-600">Export full dataset</p>
                  <ExportCsvButton label="Projection CSV" onClick={() => void exportProjectionCsv()} busy={exportBusy} />
                  <ExportCsvButton label="Variance CSV" onClick={() => void exportVarianceCsv()} busy={exportBusy} />
                  <ExportCsvButton label="Compare CSV" onClick={() => void exportCompareCsv()} busy={exportBusy} disabled={!paygoCtlB} />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Growth view ── */}
          {paygoView === "growth" && chartData.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">Units sold & collections growth</h3>
                <p className="mb-3 text-xs text-neutral-500">
                  Units sold follows the volume ramp path (conservative / base / aggressive). Collections lag by ~1 month as
                  installments begin after first payment. The gap between collections and device cost determines EBITDA trajectory.
                </p>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                      <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                      <Tooltip labelFormatter={(l) => `Month ${l}`} />
                      <Legend />
                      {paygoCtl?.confidence ? (
                        <>
                          <Line yAxisId="l" type="monotone" dataKey="collections_lo" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" name="Collections −15%" />
                          <Line yAxisId="l" type="monotone" dataKey="collections_hi" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" name="Collections +15%" />
                          <Line yAxisId="r" type="monotone" dataKey="units_sold_lo" stroke="#fecaca" dot={false} strokeDasharray="3 3" name="Units −15%" />
                          <Line yAxisId="r" type="monotone" dataKey="units_sold_hi" stroke="#fecaca" dot={false} strokeDasharray="3 3" name="Units +15%" />
                        </>
                      ) : null}
                      <Bar yAxisId="r" dataKey="units_sold" name="Units sold" fill={CHART_COLORS.units_sold} opacity={0.7} />
                      <Line yAxisId="l" type="monotone" dataKey="collections" name="Collections (RWF)" stroke={CHART_COLORS.collections} dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Monthly NI bar chart */}
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">Monthly EBITDA vs Net income</h3>
                <p className="mb-3 text-xs text-neutral-500">
                  Green bars = profitable month. Red = loss. Net income is below EBITDA by the amount of interest + tax.
                  The faster the ramp, the faster both turn positive.
                </p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                      <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} labelFormatter={(l) => `Month ${l}`} />
                      <Legend />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="ebitda" name="EBITDA" fill={CHART_COLORS.ebitda} />
                      <Bar dataKey="net_income" name="Net income" fill={CHART_COLORS.net_income} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Cash view ── */}
          {paygoView === "cash" && chartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-semibold text-neutral-900">Cash — end-of-month balance</h3>
              <p className="mb-3 text-xs text-neutral-500">
                Cash is floored at the minimum reserve (RWF 50M). When operational cash flow dips below this floor, the model
                automatically draws from the credit facility. Upward trajectory indicates the business is generating surplus cash.
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cash_end} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={CHART_COLORS.cash_end} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} labelFormatter={(l) => `Month ${l}`} />
                    <Legend />
                    {paygoCtl?.confidence ? (
                      <>
                        <Line type="monotone" dataKey="cash_end_lo" stroke="#94a3b8" dot={false} strokeDasharray="4 3" name="Cash −15%" />
                        <Line type="monotone" dataKey="cash_end_hi" stroke="#94a3b8" dot={false} strokeDasharray="4 3" name="Cash +15%" />
                      </>
                    ) : null}
                    <Area type="monotone" dataKey="cash_end" name="Cash end" stroke={CHART_COLORS.cash_end} fill="url(#gCash)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* ── Debt view ── */}
          {paygoView === "debt" && chartData.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">Closing debt & DSCR</h3>
                <p className="mb-3 text-xs text-neutral-500">
                  Closing debt peaks when the business draws maximally to fund device deployment. It declines as principal
                  amortizes. DSCR (right axis) measures how many times EBITDA covers monthly debt service — values below the{" "}
                  <strong>{paygoCtl?.dscr_floor.toFixed(2)}×</strong> covenant floor are highlighted.
                </p>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="d" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                      <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
                      <Tooltip labelFormatter={(l) => `Month ${l}`} />
                      <Legend />
                      {paygoCtl?.confidence ? (
                        <>
                          <Line yAxisId="d" type="monotone" dataKey="closing_debt_lo" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" name="Debt −15%" />
                          <Line yAxisId="d" type="monotone" dataKey="closing_debt_hi" stroke="#cbd5e1" dot={false} strokeDasharray="3 3" name="Debt +15%" />
                        </>
                      ) : null}
                      <Area yAxisId="d" type="monotone" dataKey="closing_debt" name="Closing debt" stroke={CHART_COLORS.closing_debt} fill={CHART_COLORS.closing_debt} fillOpacity={0.15} strokeWidth={2} dot={false} />
                      <Line yAxisId="s" type="monotone" dataKey="dscr" name="DSCR" stroke={CHART_COLORS.dscr} dot={false} strokeWidth={2} />
                      {paygoCtl ? <ReferenceLine yAxisId="s" y={paygoCtl.dscr_floor} stroke="#f59e0b" strokeDasharray="5 3" label={{ value: `Floor ${paygoCtl.dscr_floor}×`, position: "right", fontSize: 10 }} /> : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Unit economics view ── */}
          {paygoView === "units" && summary ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-semibold text-neutral-900">Unit economics</h3>
                <p className="mb-4 text-xs text-neutral-500">
                  These metrics show the per-device financial profile — how much revenue a single device generates, what it costs,
                  and what margin remains. The breakeven volume tells you how many devices per month are needed for EBITDA ≥ 0.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Gross contract / device", fmtRwf(summary.gross_contract, false), "gross_contract"],
                    ["Blended deposit", fmtRwf(summary.blended_deposit, false), null],
                    ["Deposit vs device cost", fmtPct(summary.deposit_vs_device), null],
                    ["Expected cash / device", fmtRwf(summary.expected_cash_per_device, false), null],
                    ["Contribution / device", fmtRwf(summary.contribution_per_device, false), "contribution_per_device"],
                    ["Breakeven devices/mo", summary.breakeven_devices_mo != null ? summary.breakeven_devices_mo.toFixed(1) : "—", "breakeven_devices_mo"],
                  ].map(([k, v, mk]) => (
                    <MetricCard
                      key={k as string}
                      label={k as string}
                      value={v as string}
                      metaKey={mk as string | undefined}
                      expanded={mk ? expandedMetrics.has(mk) : false}
                      onToggle={mk ? () => toggleMetric(mk) : undefined}
                      color="slate"
                    />
                  ))}
                </div>
              </div>
              {/* Pricing mix visual */}
              {paygoCtl ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-900">Pricing plan mix</h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    Mix affects blended yield per device. Longer-term plans earn more revenue but take longer to collect.
                    Higher discounts reduce total contract value.
                  </p>
                  <div className="flex h-8 max-w-lg overflow-hidden rounded-lg border">
                    {[
                      { label: `3-mo ${paygoCtl.mix_p3.toFixed(0)}%`, pct: paygoCtl.mix_p3, color: "#6366f1" },
                      { label: `6-mo ${paygoCtl.mix_p6.toFixed(0)}%`, pct: paygoCtl.mix_p6, color: "#0d9488" },
                      { label: `12-mo ${paygoCtl.mix_p12.toFixed(0)}%`, pct: paygoCtl.mix_p12, color: "#ca8a04" },
                    ].map((s) => (
                      <div
                        key={s.label}
                        style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? "32px" : 0 }}
                        className="flex items-center justify-center text-[10px] font-bold text-white"
                      >
                        {s.pct > 8 ? s.label : ""}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-neutral-600">
                    <div>3-mo: {paygoCtl.disc3_pct}% discount, {paygoCtl.mix_p3.toFixed(0)}% of sales</div>
                    <div>6-mo: {paygoCtl.disc6_pct}% discount, {paygoCtl.mix_p6.toFixed(0)}% of sales</div>
                    <div>12-mo: {paygoCtl.disc12_pct}% discount, {paygoCtl.mix_p12.toFixed(0)}% of sales</div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Scenario lever table ── */}
          {paygoView === "scenario" && scenarios?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-semibold text-neutral-900">Scenario levers (after last run)</h3>
              <p className="mb-3 text-xs text-neutral-500">
                Each row changes one assumption. Compare when operating profit starts, net profit starts, and when cumulative NI turns positive.
                Large differences highlight which lever has the most impact.
              </p>
              <div className="institutional-table-wrapper mt-3 overflow-x-auto">
                <table className="institutional-table min-w-[48rem] text-sm">
                  <thead>
                    <tr>{Object.keys(scenarios[0]).map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {scenarios.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => <td key={j}>{v == null ? "—" : String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* ── Sensitivity view ── */}
          {paygoView === "sensitivity" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-6">
              <SensitivitySliders
                paygoCtl={paygoCtl!}
                onCtlChange={updateCtl}
                summary={summary}
                busy={busy}
                onRun={() => void runPaygo()}
              />

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-800">Heatmap grids</p>
                  <p className="text-xs text-neutral-500">
                    Re-runs the model across default rate × volume, debt × tier, and deposit × mix axes.
                  </p>
                  <button
                    type="button" disabled={busy || !paygoCtl} onClick={() => void runHeatmaps()}
                    className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? "Computing…" : "Compute heatmaps"}
                  </button>
                  {heatmaps ? <ExportCsvButton label="Export heatmaps CSV" onClick={() => void exportHeatmapsCsv()} busy={exportBusy} /> : null}
                </div>
                {heatmaps ? (
                  <div className="mt-4 grid gap-6">
                    <HeatmapTable block={heatmaps.cumulativeNetIncome} />
                    <HeatmapTable block={heatmaps.irrDebtTier} />
                    <HeatmapTable block={heatmaps.ebitdaBreakevenMonth} />
                  </div>
                ) : <p className="mt-3 text-xs text-neutral-500">Click "Compute heatmaps" to generate sensitivity grids.</p>}
              </div>
            </div>
          ) : null}

          {/* ── Data table view ── */}
          {paygoView === "data" && series?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">Full monthly projection data</h3>
                  <p className="text-xs text-neutral-500">All model output columns. Filter by any substring.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                    placeholder="Filter rows…"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                  />
                  <ExportCsvButton label="Export CSV" onClick={() => void exportProjectionCsv()} busy={exportBusy} />
                </div>
              </div>
              <p className="mt-1 text-xs text-neutral-500">Showing {filteredRows.length} of {series.length} rows</p>
              <div className="institutional-table-wrapper mt-3 max-h-[480px] overflow-auto">
                <table className="institutional-table min-w-[64rem] text-xs">
                  <thead>
                    <tr>{tableColumns.map((c) => <th key={c}>{c}</th>)}</tr>
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

          {/* ── Compare A vs B ── */}
          {paygoView === "compare" && paygoCtl && paygoCtlB ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-4">
              <div>
                <p className="text-sm font-semibold text-neutral-800">Scenario A vs B</p>
                <p className="text-xs text-neutral-500">
                  A is the current builder. Edit B below, then run. Charts show cumulative EBITDA and NI for both scenarios.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                onClick={() => paygoCtl && setPaygoCtlB({ ...paygoCtl })}
              >
                Copy A → B
              </button>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["B — Default rate %", "def_rate_pct", "number"],
                  ["B — Cost of debt %", "debt_rate_pct", "number"],
                  ["B — Payback multiple (×)", "customer_payback_multiple", "number"],
                ].map(([lbl, k]) => (
                  <label key={k as string} className="block text-xs font-medium text-neutral-700">
                    {lbl as string}
                    <input
                      type="number" step="any"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoCtlB[k as keyof PaygoCtl] as number}
                      onChange={(e) => setPaygoCtlB({ ...paygoCtlB, [k as string]: Number(e.target.value) })}
                    />
                  </label>
                ))}
                <label className="block text-xs font-medium text-neutral-700">
                  B — Volume path
                  <select
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.volume_mode}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, volume_mode: e.target.value })}
                  >
                    {VOL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  B — Device tier
                  <select
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    value={paygoCtlB.device_tier_label}
                    onChange={(e) => setPaygoCtlB({ ...paygoCtlB, device_tier_label: e.target.value })}
                  >
                    {DEVICE_TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button" disabled={busy} onClick={() => void runCompare()}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Running…" : "Run A vs B"}
                </button>
                <ExportCsvButton label="Export compare CSV" onClick={() => void exportCompareCsv()} busy={exportBusy} />
              </div>

              {compareResult ? (
                <>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-sm">
                    Δ cumulative net income (B − A):{" "}
                    <strong className={compareResult.deltaCumulativeNetIncome >= 0 ? "text-emerald-900" : "text-red-700"}>
                      {fmtRwf(compareResult.deltaCumulativeNetIncome)}
                    </strong>
                  </div>
                  {compareResult.assumptionDiffs.length ? (
                    <div>
                      <h4 className="text-sm font-semibold">Assumption differences</h4>
                      <div className="institutional-table-wrapper mt-2 overflow-x-auto">
                        <table className="institutional-table text-xs">
                          <thead>
                            <tr><th>Assumption</th><th>A</th><th>B</th><th className="tbl-num">Delta</th></tr>
                          </thead>
                          <tbody>
                            {compareResult.assumptionDiffs.map((r, i) => {
                              const delta = typeof r.A === "number" && typeof r.B === "number" ? r.B - r.A : null;
                              return (
                                <tr key={i}>
                                  <td>{r.assumption}</td>
                                  <td className="tbl-mono">{String(r.A)}</td>
                                  <td className="tbl-mono">{String(r.B)}</td>
                                  <td className={`tbl-num ${delta != null && delta > 0 ? "text-emerald-700" : delta != null && delta < 0 ? "text-red-700" : ""}`}>
                                    {delta != null ? (delta > 0 ? "+" : "") + delta.toFixed(2) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }} data={compareChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} />
                        <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} labelFormatter={(l) => `Month ${l}`} />
                        <Legend />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="aE" name="A cum EBITDA" stroke="#0d9488" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="bE" name="B cum EBITDA" stroke="#6366f1" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="aN" name="A cum NI" stroke="#ca8a04" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="bN" name="B cum NI" stroke="#db2777" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* ── Live data view ── */}
          {paygoView === "live" ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <LiveDataPanel
                liveActuals={liveActuals}
                loadedAt={liveLoadedAt}
                onLoad={() => void loadLiveActuals()}
                busy={busy}
                series={series}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Budget tab ── */}
      {tab === "budget" ? (
        <BusinessModelBudgetTab token={token} paygoCtl={paygoCtl as unknown as Record<string, unknown> | null} />
      ) : null}

      {/* ── Memos tab ── */}
      {tab === "memos" ? (
        <BusinessModelMemosTab token={token} paygoCtl={paygoCtl as unknown as Record<string, unknown> | null} />
      ) : null}

      {/* ── Broiler tab ── */}
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
                  <h3 className="mb-3 text-sm font-semibold text-neutral-900">Batch inputs</h3>
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
                          type="number" step="any"
                          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                          value={broilerInputs[key] ?? ""}
                          onChange={(e) => updateBroiler(key, Number(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button" disabled={busy} onClick={() => void runBroiler()}
                      className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
                    >
                      {busy ? "Running…" : "Run broiler model"}
                    </button>
                    <button
                      type="button" onClick={() => void loadBroilerDefaults()}
                      className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                    >
                      Reset defaults
                    </button>
                  </div>
                </div>
              ) : null}

              {broilerSummary ? (
                <>
                  {/* Profitability explanation */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                    <strong>Reading these KPIs:</strong> Net profit = Revenue − total costs.
                    ROI = Net profit / total cost (not annualized — this is per-cycle).
                    Break-even price = minimum RWF/kg to cover all costs.
                    Effective FCR = actual feed kg used / live mass gained (lower is better).
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Net profit", fmtRwf(broilerSummary.net_profit_rwf), broilerSummary.net_profit_rwf >= 0 ? "emerald" : "red"],
                      ["Gross profit", fmtRwf(broilerSummary.gross_profit_rwf), broilerSummary.gross_profit_rwf >= 0 ? "emerald" : "red"],
                      ["Revenue", fmtRwf(broilerSummary.revenue_rwf), "slate"],
                      ["Total cost", fmtRwf(broilerSummary.total_cost_rwf), "slate"],
                      ["Birds harvested", broilerSummary.birds_end.toFixed(0), "slate"],
                      ["Effective FCR", broilerSummary.effective_fcr.toFixed(3), "slate"],
                      ["Break-even price/kg", fmtRwf(broilerSummary.break_even_price_per_kg, false), "amber"],
                      ["ROI (cycle)", Number.isFinite(broilerSummary.roi_cycle) ? fmtPct(broilerSummary.roi_cycle, 1) : "—", "slate"],
                    ].map(([k, v, color]) => (
                      <MetricCard key={k as string} label={k as string} value={v as string} color={color as string} />
                    ))}
                  </div>
                </>
              ) : null}

              {weeklyMortality?.length ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 font-semibold text-neutral-900">Weekly mortality rate</h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    Mortality as % of flock alive at start of each week. Industry benchmark: {"<"}1%/week is healthy,
                    1–2% warrants monitoring, {">"}2% suggests disease event or management issue.
                  </p>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyMortality} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={(v) => `W${v}`} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                        <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `Week ${l}`} />
                        <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "1% ref", position: "right", fontSize: 9 }} />
                        <ReferenceLine y={2} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "2% alert", position: "right", fontSize: 9 }} />
                        <Bar dataKey="mortality_pct_of_week_start" name="Weekly mortality %" fill="#6366f1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {insights?.length ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
                  <h3 className="font-semibold">Insights & recommendations</h3>
                  <p className="mt-1 mb-2 text-xs text-amber-700">
                    Auto-generated from the model run. Each insight highlights a performance driver or risk factor.
                  </p>
                  <ul className="space-y-1.5 pl-2">
                    {insights.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-amber-600">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {trajectory?.length ? (
                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Daily flock trajectory</h3>
                  <p className="mb-3 text-xs text-neutral-500">
                    Birds alive decreases as mortality accrues over the cycle. Cumulative cost grows faster early when chick
                    and feed costs are highest. Revenue is realized at slaughter (end of cycle in this model).
                  </p>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={trajectory.map((r) => ({ day: r.day, birds: r.birds_alive, cost: r.cost_cum_rwf / 1e6, revenue: (r.revenue_cum_rwf ?? 0) / 1e6 }))}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} label={{ value: "Day", position: "insideBottom", offset: -2, fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}M`} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="birds" name="Birds alive" fill="#0d9488" opacity={0.7} />
                        <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost (M RWF)" stroke="#dc2626" dot={false} strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue (M RWF)" stroke="#16a34a" dot={false} strokeWidth={2} strokeDasharray="4 4" />
                      </ComposedChart>
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
