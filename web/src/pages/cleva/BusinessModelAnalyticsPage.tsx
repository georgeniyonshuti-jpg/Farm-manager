import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
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

type PaygoInputs = Record<string, number>;
type MonthlyRow = Record<string, number | null>;
type BroilerInputs = Record<string, number>;

const VOL_PRESETS: Record<string, Partial<PaygoInputs>> = {
  Conservative: { dev_start: 200, dev_ramp_end: 3000, ramp_months: 8, dev_m: 3000 },
  Base: { dev_start: 300, dev_ramp_end: 5000, ramp_months: 6, dev_m: 5000 },
  Aggressive: { dev_start: 500, dev_ramp_end: 8000, ramp_months: 4, dev_m: 8000 },
};

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

type TabId = "paygo" | "broiler" | "scenarios";

export function BusinessModelAnalyticsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabId>("paygo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [paygoInputs, setPaygoInputs] = useState<PaygoInputs | null>(null);
  const [series, setSeries] = useState<MonthlyRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number | null> | null>(null);
  const [milestones, setMilestones] = useState<Record<string, number | null> | null>(null);
  const [scenarios, setScenarios] = useState<Record<string, unknown>[] | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  const [broilerInputs, setBroilerInputs] = useState<BroilerInputs | null>(null);
  const [broilerSummary, setBroilerSummary] = useState<Record<string, number> | null>(null);
  const [trajectory, setTrajectory] = useState<Record<string, number>[] | null>(null);
  const [insights, setInsights] = useState<string[] | null>(null);

  const loadPaygoDefaults = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-defaults`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setPaygoInputs((d as { inputs: PaygoInputs }).inputs);
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
    if (!paygoInputs) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/paygo-projection`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ inputs: paygoInputs }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Projection failed");
      setSeries((d as { series: MonthlyRow[] }).series);
      setSummary((d as { summary: Record<string, number | null> }).summary);
      setMilestones((d as { milestones: Record<string, number | null> }).milestones);
      setScenarios((d as { scenarios: Record<string, unknown>[] }).scenarios);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Projection failed");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Broiler model failed");
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!series?.length) return [];
    return series.map((row) => ({
      month: row.month,
      collections: row.collections,
      ebitda: row.ebitda,
      cash_end: row.cash_end,
    }));
  }, [series]);

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

  function updatePaygo(key: string, value: number) {
    setPaygoInputs((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateBroiler(key: string, value: number) {
    setBroilerInputs((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function applyVolumePreset(name: keyof typeof VOL_PRESETS) {
    const patch = VOL_PRESETS[name];
    setPaygoInputs((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (typeof v === "number" && Number.isFinite(v)) next[k] = v;
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <PageHeader
          title="Business model analytics"
          subtitle="PAYGO credit projections and broiler batch economics (logic ported from the Cleva Business Model). Adjust inputs, run the model, filter the monthly table, and review scenarios."
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
            ["paygo", "PAYGO credit model"],
            ["broiler", "Broiler batch"],
            ["scenarios", "Scenario comparison"],
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
          {paygoInputs ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
              <h3 className="text-sm font-semibold text-neutral-900">Volume ramp presets</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.keys(VOL_PRESETS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyVolumePreset(name as keyof typeof VOL_PRESETS)}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["proj_months", "Horizon (months)"],
                  ["dev_start", "Units month 1"],
                  ["dev_ramp_end", "Units end of ramp"],
                  ["ramp_months", "Ramp length (mo)"],
                  ["dev_m", "Steady units / mo"],
                  ["vol_mult", "Volume multiplier"],
                  ["base_repay", "Base repayment (RWF)"],
                  ["dev_cost", "Device cost (RWF)"],
                  ["dep_pct", "Deposit % (0–1)"],
                  ["def_rate", "Default rate (0–1)"],
                  ["debt_rate", "Debt rate annual (0–1)"],
                  ["p3", "Mix 3-mo plan"],
                  ["p6", "Mix 6-mo plan"],
                  ["p12", "Mix 12-mo plan"],
                  ["disc3", "Disc 3-mo (0–1)"],
                  ["disc6", "Disc 6-mo (0–1)"],
                  ["disc12", "Disc 12-mo (0–1)"],
                  ["comm_pct", "Commission % (0–1)"],
                  ["min_cash", "Min cash floor (RWF)"],
                  ["io_mos", "Interest-only months"],
                  ["amort_mos", "Amortization months"],
                  ["hurdle_annual", "NPV hurdle annual (0–1)"],
                ].map(([key, label]) => (
                  <label key={key} className="block text-xs font-medium text-neutral-600">
                    {label}
                    <input
                      type="number"
                      step="any"
                      className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      value={paygoInputs[key] ?? ""}
                      onChange={(e) => updatePaygo(key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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

          {summary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Peak debt", fmtRwf(summary.peak_debt)],
                ["Ending cash", fmtRwf(summary.ending_cash)],
                ["Cum. EBITDA", fmtRwf(summary.cum_ebitda)],
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
          ) : null}

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
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Collections, EBITDA & cash</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip formatter={(v) => fmtRwf(typeof v === "number" ? v : Number(v))} />
                    <Legend />
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
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {series?.length ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">Full monthly data</h3>
                <label className="text-xs font-medium text-neutral-600">
                  Filter rows (any column)
                  <input
                    className="ml-2 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                    placeholder="e.g. ebitda, 12, 1.5e"
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
        </div>
      ) : null}

      {tab === "broiler" ? (
        <div className="space-y-4">
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

          {broilerSummary ? (
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

          {insights?.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
              <h3 className="font-semibold">Insights</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {insights.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {trajectory?.length ? (
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
        </div>
      ) : null}

      {tab === "scenarios" ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-600">
            Run the PAYGO model first, then compare levered scenarios here. (Same one-factor tweaks as the original Streamlit app.)
          </p>
          {scenarios?.length ? (
            <div className="institutional-table-wrapper mt-4 overflow-x-auto">
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
          ) : (
            <p className="mt-4 text-sm text-neutral-500">No scenario data yet — open “PAYGO credit model” and click Run.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
