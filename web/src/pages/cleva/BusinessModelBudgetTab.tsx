import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

type PaygoCtl = Record<string, unknown>;
type Row = { month: number; kpi_key: string; value: number; source?: string };
type VarianceRow = {
  month: number;
  kpi_key: string;
  kpi_label: string;
  model: number | null;
  budget: number | null;
  actual: number | null;
  variance_actual_vs_budget: number | null;
  variance_actual_vs_model: number | null;
};

const KPI_LABELS: Record<string, string> = {
  units_sold: "Units sold",
  collections: "Collections (RWF)",
  yield_per_active: "Yield / active device",
  portfolio_par_pct: "Portfolio PAR %",
};

function fmtVal(kpi: string, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (kpi === "collections" || kpi === "yield_per_active") {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
  }
  if (kpi === "portfolio_par_pct") return `${v.toFixed(2)}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const cfg: Record<string, string> = {
    csv_import: "bg-amber-100 text-amber-800",
    cleva_feed: "bg-cyan-100 text-cyan-800",
    manual: "bg-slate-100 text-slate-700",
    model: "bg-indigo-100 text-indigo-800",
    live_db: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${cfg[source] ?? "bg-neutral-100 text-neutral-600"}`}>
      {source.replace(/_/g, " ")}
    </span>
  );
}

export function BusinessModelBudgetTab(props: { token: string | null; paygoCtl: PaygoCtl | null }) {
  const { token, paygoCtl } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actuals, setActuals] = useState<Row[]>([]);
  const [targets, setTargets] = useState<Row[]>([]);
  const [csvText, setCsvText] = useState("");
  const [variance, setVariance] = useState<VarianceRow[] | null>(null);
  const [suggestedHint, setSuggestedHint] = useState<string | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<string>("collections");

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [ra, rt, rs] = await Promise.all([
        fetch(`${API_BASE_URL}/api/business-model/budget/actuals`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/business-model/budget/targets`, { headers: readAuthHeaders(token) }),
        fetch(`${API_BASE_URL}/api/business-model/suggested-actuals`, { headers: readAuthHeaders(token) }),
      ]);
      const da = await ra.json();
      const dt = await rt.json();
      const ds = await rs.json();
      if (!ra.ok) throw new Error((da as { error?: string }).error ?? "Load actuals failed");
      if (!rt.ok) throw new Error((dt as { error?: string }).error ?? "Load targets failed");
      setActuals((da as { rows: Row[] }).rows ?? []);
      setTargets((dt as { rows: Row[] }).rows ?? []);
      if (rs.ok) setSuggestedHint((ds as { hint?: string }).hint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncTargets = async () => {
    if (!token || !paygoCtl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/budget/sync-targets-from-model`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Sync failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/budget/import-actuals-csv`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ csv: csvText }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Import failed");
      setCsvText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const appendSuggested = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/budget/append-suggested-actuals`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Append failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Append failed");
    } finally {
      setBusy(false);
    }
  };

  const runVariance = async () => {
    if (!token || !paygoCtl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/budget-variance`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl, useStoredBudget: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Variance failed");
      setVariance((d as { variance: VarianceRow[] }).variance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Variance failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadVarianceCsv = async () => {
    if (!token || !paygoCtl) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/business-model/export-csv/variance`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ctl: paygoCtl }),
      });
      if (!r.ok) throw new Error("Export failed");
      const text = await r.text();
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cleva-budget-variance.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const kpiOptions = Object.keys(KPI_LABELS);

  const varianceChartData = useMemo(() => {
    if (!variance?.length) return [];
    return variance
      .filter((r) => r.kpi_key === selectedKpi)
      .map((r) => ({
        month: `M${r.month}`,
        model: r.model,
        budget: r.budget,
        actual: r.actual,
        varBudget: r.variance_actual_vs_budget,
        varModel: r.variance_actual_vs_model,
      }));
  }, [variance, selectedKpi]);

  const varSummary = useMemo(() => {
    if (!variance?.length) return null;
    const rows = variance.filter((r) => r.kpi_key === selectedKpi && r.actual != null);
    if (!rows.length) return null;
    const totalActual = rows.reduce((s, r) => s + (r.actual ?? 0), 0);
    const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
    const totalModel = rows.reduce((s, r) => s + (r.model ?? 0), 0);
    return { totalActual, totalBudget, totalModel, months: rows.length };
  }, [variance, selectedKpi]);

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {/* Header explanation */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
        <strong>How budget tracking works:</strong> Sync targets from the current PAYGO model → import real actuals via CSV →
        run variance analysis to see model vs budget vs actual. Data persists per-user in SQLite.
        Keys: <code>units_sold</code>, <code>collections</code>, <code>yield_per_active</code>, <code>portfolio_par_pct</code>.
      </div>

      {suggestedHint ? <p className="text-xs text-neutral-500 italic">{suggestedHint}</p> : null}

      {/* Action toolbar */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button" disabled={busy || !paygoCtl} onClick={() => void syncTargets()}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Sync targets from PAYGO ctl
        </button>
        <button
          type="button" disabled={busy} onClick={() => void load()}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium"
        >
          Refresh
        </button>
        <button
          type="button" disabled={busy} onClick={() => void appendSuggested()}
          className="rounded-lg border border-cyan-600 px-3 py-2 text-xs font-semibold text-cyan-900 disabled:opacity-50"
        >
          Append env actuals
        </button>
        <button
          type="button" disabled={busy || !paygoCtl} onClick={() => void runVariance()}
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Run variance analysis
        </button>
        {variance?.length ? (
          <button
            type="button" disabled={busy} onClick={() => void downloadVarianceCsv()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            ↓ Variance CSV
          </button>
        ) : null}
      </div>

      {/* Data lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900">Budget targets ({targets.length})</h3>
          <p className="mt-0.5 text-xs text-neutral-500">Synced from PAYGO model run. Used as benchmark for variance.</p>
          <div className="mt-2 max-h-48 overflow-auto">
            <table className="institutional-table text-xs w-full">
              <thead>
                <tr><th>Month</th><th>KPI</th><th className="tbl-num">Value</th></tr>
              </thead>
              <tbody>
                {targets.slice(0, 80).map((r, i) => (
                  <tr key={i}>
                    <td className="tbl-mono">M{r.month}</td>
                    <td>{KPI_LABELS[r.kpi_key] ?? r.kpi_key}</td>
                    <td className="tbl-num">{fmtVal(r.kpi_key, r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900">Actuals ({actuals.length})</h3>
          <p className="mt-0.5 text-xs text-neutral-500">Imported via CSV, env feed, or manual entry.</p>
          <div className="mt-2 max-h-48 overflow-auto">
            <table className="institutional-table text-xs w-full">
              <thead>
                <tr><th>Month</th><th>KPI</th><th className="tbl-num">Value</th><th>Source</th></tr>
              </thead>
              <tbody>
                {actuals.slice(0, 80).map((r, i) => (
                  <tr key={i}>
                    <td className="tbl-mono">M{r.month}</td>
                    <td>{KPI_LABELS[r.kpi_key] ?? r.kpi_key}</td>
                    <td className="tbl-num">{fmtVal(r.kpi_key, r.value)}</td>
                    <td><SourceBadge source={r.source} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CSV import */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Import actuals CSV</h3>
          <p className="text-xs text-neutral-500">
            Paste CSV with columns: <code>month,kpi_key,value</code>. Valid kpi_key values:{" "}
            {Object.keys(KPI_LABELS).join(", ")}.
          </p>
        </div>
        <textarea
          className="w-full min-h-[100px] rounded-lg border border-neutral-300 p-2 font-mono text-xs"
          placeholder={"month,kpi_key,value\n1,collections,120000000\n1,units_sold,250"}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button
          type="button" disabled={busy || !csvText.trim()} onClick={() => void importCsv()}
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Import CSV
        </button>
      </div>

      {/* Variance analysis */}
      {variance?.length ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-neutral-900">Variance analysis</h3>
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
              KPI:
              <select
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                value={selectedKpi}
                onChange={(e) => setSelectedKpi(e.target.value)}
              >
                {kpiOptions.map((k) => <option key={k} value={k}>{KPI_LABELS[k]}</option>)}
              </select>
            </label>
          </div>

          {/* Variance explanation */}
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-900">
            <strong>Reading variance:</strong>{" "}
            <em>Actual vs Budget</em> = how much real performance beat or missed the model-based budget target.{" "}
            <em>Actual vs Model</em> = how much actual data deviates from the raw projection.
            Green bars = outperforming, red = underperforming.
          </div>

          {varSummary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Total actual", fmtVal(selectedKpi, varSummary.totalActual)],
                ["Total budget", fmtVal(selectedKpi, varSummary.totalBudget)],
                ["Total model", fmtVal(selectedKpi, varSummary.totalModel)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-neutral-200 bg-white p-3 text-center">
                  <p className="text-xs text-neutral-500">{k as string}</p>
                  <p className="text-lg font-bold text-neutral-900">{v as string}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Chart: model vs budget vs actual */}
          {varianceChartData.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h4 className="mb-2 text-sm font-semibold text-neutral-800">{KPI_LABELS[selectedKpi]} — model vs budget vs actual</h4>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={varianceChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="model" name="Model" fill="#6366f1" opacity={0.6} />
                    <Bar dataKey="budget" name="Budget target" fill="#0d9488" opacity={0.6} />
                    <Bar dataKey="actual" name="Actual" fill="#ca8a04" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* Chart: variance bars */}
          {varianceChartData.some((r) => r.varBudget != null) ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <h4 className="mb-1 text-sm font-semibold text-neutral-800">Actual vs budget variance per month</h4>
              <p className="mb-3 text-xs text-neutral-500">Positive = actual beat budget, negative = missed.</p>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={varianceChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="varBudget" name="Δ actual vs budget">
                      {varianceChartData.map((r, i) => (
                        <Cell key={i} fill={(r.varBudget ?? 0) >= 0 ? "#16a34a" : "#dc2626"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* Full variance table */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h4 className="mb-2 text-sm font-semibold text-neutral-800">Full variance table</h4>
            <div className="institutional-table-wrapper max-h-[360px] overflow-auto">
              <table className="institutional-table text-xs">
                <thead>
                  <tr>
                    <th className="tbl-mono">Month</th>
                    <th>KPI</th>
                    <th className="tbl-num">Model</th>
                    <th className="tbl-num">Budget</th>
                    <th className="tbl-num">Actual</th>
                    <th className="tbl-num">Δ vs Budget</th>
                    <th className="tbl-num">Δ vs Model</th>
                  </tr>
                </thead>
                <tbody>
                  {variance.slice(0, 120).map((row, i) => (
                    <tr key={i}>
                      <td className="tbl-mono">M{row.month}</td>
                      <td>{row.kpi_label}</td>
                      <td className="tbl-num">{fmtVal(row.kpi_key, row.model)}</td>
                      <td className="tbl-num">{fmtVal(row.kpi_key, row.budget)}</td>
                      <td className="tbl-num font-semibold">{fmtVal(row.kpi_key, row.actual)}</td>
                      <td className={`tbl-num ${row.variance_actual_vs_budget != null && row.variance_actual_vs_budget >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {row.variance_actual_vs_budget != null ? (row.variance_actual_vs_budget >= 0 ? "+" : "") + fmtVal(row.kpi_key, row.variance_actual_vs_budget) : "—"}
                      </td>
                      <td className={`tbl-num ${row.variance_actual_vs_model != null && row.variance_actual_vs_model >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {row.variance_actual_vs_model != null ? (row.variance_actual_vs_model >= 0 ? "+" : "") + fmtVal(row.kpi_key, row.variance_actual_vs_model) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
