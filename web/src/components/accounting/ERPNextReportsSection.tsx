import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import {
  getBalanceSheet,
  getProfitAndLoss,
  getTrialBalance,
} from "../../api/erpnext.api";
import { getStoredErpnextCompany } from "../../lib/erpnextPrefs";
import { useToast } from "../Toast";
import { Button, Input, Select } from "../ui";
import { NoticeStrip } from "../ui/NoticeStrip";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { TextLink } from "../ui/TextLink";

type ErpReportKind = "trial_balance" | "pnl" | "balance_sheet";

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

export function ERPNextReportsSection() {
  const { token } = useAuth();
  const { status } = useERPNextConnection();
  const { showToast } = useToast();
  const { companyHref } = useCompanyNav();
  const [reportKind, setReportKind] = useState<ErpReportKind>("trial_balance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<unknown>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  async function runReport() {
    const company = getStoredErpnextCompany() || status?.company;
    if (!token || !company) {
      showToast("error", "Select an ERPNext company in ERPNext setup.");
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

  if (!status?.connected) {
    return (
      <NoticeStrip
        tone="warning"
        action={<TextLink href={companyHref("farm/erpnext-setup")}>Open ERPNext</TextLink>}
      >
        Connect ERPNext to load trial balance, P&amp;L, and balance sheet.
      </NoticeStrip>
    );
  }

  return (
    <div className="space-y-stack">
      <div className="table-block">
        <div className="space-y-3 p-3">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-sm text-[var(--text-secondary)]">Report</span>
            <Select
              className={mgrInput}
              value={reportKind}
              onChange={(e) => setReportKind(e.target.value as ErpReportKind)}
            >
              <option value="trial_balance">Trial balance</option>
              <option value="pnl">Profit &amp; loss</option>
              <option value="balance_sheet">Balance sheet</option>
            </Select>
          </label>
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-[var(--text-secondary)]">From</span>
              <Input
                type="date"
                className={mgrInput}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-[var(--text-secondary)]">To</span>
              <Input
                type="date"
                className={mgrInput}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={loading}
              disabled={loading}
              onClick={() => void runReport()}
            >
              Run report
            </Button>
            {refreshedAt ? (
              <span className="type-caption text-[var(--text-secondary)]">
                Last run {refreshedAt}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="table-block">
        <div className="border-b border-[var(--border-color)] px-3 py-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Result</p>
        </div>
        {report ? (
          <pre className="max-h-[28rem] overflow-auto px-3 py-3 font-mono text-xs text-[var(--text-secondary)]">
            {JSON.stringify(report, null, 2)}
          </pre>
        ) : (
          <p className="px-3 py-6 type-caption text-[var(--text-secondary)]">
            Run a report to see ERPNext data here.
          </p>
        )}
      </div>
    </div>
  );
}
