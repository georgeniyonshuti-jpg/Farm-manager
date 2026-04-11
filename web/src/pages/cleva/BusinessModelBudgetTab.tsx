import { useCallback, useEffect, useState } from "react";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { API_BASE_URL } from "../../api/config";

type PaygoCtl = Record<string, unknown>;

type Row = { month: number; kpi_key: string; value: number; source?: string };

export function BusinessModelBudgetTab(props: { token: string | null; paygoCtl: PaygoCtl | null }) {
  const { token, paygoCtl } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actuals, setActuals] = useState<Row[]>([]);
  const [targets, setTargets] = useState<Row[]>([]);
  const [csvText, setCsvText] = useState("");
  const [variance, setVariance] = useState<Record<string, unknown>[] | null>(null);
  const [suggestedHint, setSuggestedHint] = useState<string | null>(null);

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
      if (!ra.ok) throw new Error(da.error ?? "Load actuals failed");
      if (!rt.ok) throw new Error(dt.error ?? "Load targets failed");
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
      setVariance((d as { variance: Record<string, unknown>[] }).variance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Variance failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-neutral-600">
        Budget KPIs persist per user in <code className="text-xs">server/data/business-model-budget.sqlite</code>. Keys:
        units_sold, collections, yield_per_active, portfolio_par_pct.
      </p>
      {suggestedHint ? <p className="text-xs text-neutral-500">{suggestedHint}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !paygoCtl}
          onClick={() => void syncTargets()}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Sync targets from current PAYGO ctl
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium"
        >
          Refresh lists
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void appendSuggested()}
          className="rounded-lg border border-cyan-600 px-3 py-2 text-xs font-semibold text-cyan-900 disabled:opacity-50"
        >
          Append env suggested actuals
        </button>
        <button
          type="button"
          disabled={busy || !paygoCtl}
          onClick={() => void runVariance()}
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Variance (stored vs model)
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900">Targets ({targets.length})</h3>
          <ul className="mt-2 max-h-48 overflow-auto text-xs text-neutral-700">
            {targets.slice(0, 80).map((r, i) => (
              <li key={i}>
                M{r.month} {r.kpi_key}: {Number(r.value).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900">Actuals ({actuals.length})</h3>
          <ul className="mt-2 max-h-48 overflow-auto text-xs text-neutral-700">
            {actuals.slice(0, 80).map((r, i) => (
              <li key={i}>
                M{r.month} {r.kpi_key}: {Number(r.value).toFixed(2)}
                {r.source ? ` (${r.source})` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-neutral-900">Import actuals CSV</h3>
        <textarea
          className="w-full min-h-[120px] rounded-lg border border-neutral-300 p-2 font-mono text-xs"
          placeholder="month,kpi_key,value&#10;1,collections,120000000"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void importCsv()}
          className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Import CSV
        </button>
      </div>

      {variance?.length ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-900">Variance (first 120 rows)</h3>
          <div className="institutional-table-wrapper mt-2 max-h-[360px] overflow-auto">
            <table className="institutional-table text-xs">
              <thead>
                <tr>
                  {Object.keys(variance[0]).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variance.slice(0, 120).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="font-mono">
                        {v == null ? "—" : typeof v === "number" ? Number(v).toFixed(2) : String(v)}
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
  );
}
