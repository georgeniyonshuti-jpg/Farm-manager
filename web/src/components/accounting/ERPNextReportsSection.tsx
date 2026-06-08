import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/OdooConnectionContext";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "../../api/erpnext.api";
import { getStoredErpnextCompany } from "../../lib/erpnextPrefs";
import { useToast } from "../Toast";

type ErpReportKind = "trial_balance" | "pnl" | "balance_sheet";

export function ERPNextReportsSection() {
  const { token } = useAuth();
  const { status } = useERPNextConnection();
  const { showToast } = useToast();
  const [reportKind, setReportKind] = useState<ErpReportKind>("trial_balance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<unknown>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  async function runReport() {
    const company = getStoredErpnextCompany() || status?.company;
    if (!token || !company) {
      showToast("error", "Select an ERPNext company in ERPNext integration settings.");
      return;
    }
    const fromDate = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    setLoading(true);
    try {
      let data: unknown;
      if (reportKind === "trial_balance") data = await getTrialBalance(token, company, fromDate, toDate);
      else if (reportKind === "pnl") data = await getProfitAndLoss(token, company, fromDate, toDate);
      else data = await getBalanceSheet(token, company, fromDate, toDate);
      setReport(data);
      setRefreshedAt(new Date().toLocaleString());
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">ERPNext financial reports</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Trial balance, P&amp;L, and balance sheet pulled live from ERPNext.
        </p>
      </div>

      {!status?.connected && (
        <p className="text-sm text-amber-700">Connect ERPNext to load reports.</p>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Report</label>
          <select
            className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm"
            value={reportKind}
            onChange={(e) => setReportKind(e.target.value as ErpReportKind)}
          >
            <option value="trial_balance">Trial balance</option>
            <option value="pnl">Profit &amp; loss</option>
            <option value="balance_sheet">Balance sheet</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={loading || !status?.connected}
          onClick={() => void runReport()}
          className="rounded-lg bg-[var(--primary-color)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh report"}
        </button>
        {refreshedAt && <span className="text-xs text-[var(--text-muted)]">Last refreshed: {refreshedAt}</span>}
      </div>

      <pre className="max-h-[420px] overflow-auto rounded border border-[var(--border-color)] bg-[var(--surface-input)] p-3 text-xs text-[var(--text-secondary)]">
        {report ? JSON.stringify(report, null, 2) : "Run a report to see ERPNext data."}
      </pre>
    </section>
  );
}
