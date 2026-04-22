import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { formatRwf } from "../../lib/formatRwf";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { API_BASE_URL } from "../../api/config";

type PayrollRow = {
  id: string;
  logType: string;
  rwfDelta: number;
  reason: string;
  periodStart: string;
  submittedAt: string;
  onTime: boolean | null;
  approvedAt: string | null;
  accountingStatus?: string;
};

/** Calendar month bounds in Africa/Kigali (matches server payroll days). */
function kigaliMonthRange(): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const fallback = new Date();
    const y0 = fallback.getFullYear();
    const m0 = String(fallback.getMonth() + 1).padStart(2, "0");
    const from = `${y0}-${m0}-01`;
    const last = new Date(y0, Number(m0), 0).getDate();
    return { from, to: `${y0}-${m0}-${String(last).padStart(2, "0")}` };
  }
  const ms = String(m).padStart(2, "0");
  const from = `${y}-${ms}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${y}-${ms}-${String(last).padStart(2, "0")}` };
}

type PayrollTotals = {
  netAll: number;
  netApproved: number;
  netPending: number;
};

export function LaborerEarningsPage() {
  const { token, user } = useAuth();
  const title = useLaborerT("My earnings");
  const subtitle = useLaborerT("Credits and deductions from round check-ins and feed logs this month (read-only).");
  const back = useLaborerT("Back to action center");
  const colType = useLaborerT("Type");
  const colAmount = useLaborerT("Amount");
  const colStatus = useLaborerT("On-time");
  const colApproved = useLaborerT("Approved");
  const colWhen = useLaborerT("When");
  const colReason = useLaborerT("Reason");
  const emptyMsg = useLaborerT("No entries yet this month.");
  const yes = useLaborerT("Yes");
  const no = useLaborerT("No");
  const pending = useLaborerT("Pending");
  const netAllLbl = useLaborerT("Net (all)");
  const approvedTotalLbl = useLaborerT("Approved");
  const pendingTotalLbl = useLaborerT("Pending approval");

  const initial = useMemo(() => kigaliMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [typeFilter, setTypeFilter] = useState<"all" | "check_in" | "feed_entry">("all");
  const [approvalFilter, setApprovalFilter] = useState<"all" | "approved" | "pending">("all");
  const [entries, setEntries] = useState<PayrollRow[]>([]);
  const [totals, setTotals] = useState<PayrollTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const backHref = useMemo(() => {
    if (user?.role === "vet") return "/dashboard/vet";
    return "/dashboard/laborer";
  }, [user?.role]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        period_start: from,
        period_end: to,
      });
      const r = await fetch(`${API_BASE_URL}/api/payroll-impact?${qs}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setEntries((d.entries as PayrollRow[]) ?? []);
      const t = (d as { totals?: PayrollTotals | null }).totals;
      setTotals(t ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, user?.id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSubmitted = () => void load();
    window.addEventListener("farm:checkin-submitted", onSubmitted);
    return () => window.removeEventListener("farm:checkin-submitted", onSubmitted);
  }, [load]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.logType !== typeFilter) return false;
      if (approvalFilter === "approved" && e.approvedAt == null) return false;
      if (approvalFilter === "pending" && e.approvedAt != null) return false;
      return true;
    });
  }, [entries, typeFilter, approvalFilter]);

  const fallbackTotals = useMemo((): PayrollTotals => {
    let netApproved = 0;
    let netPending = 0;
    for (const e of filteredEntries) {
      if (e.approvedAt != null) netApproved += e.rwfDelta;
      else netPending += e.rwfDelta;
    }
    return { netAll: netApproved + netPending, netApproved, netPending };
  }, [filteredEntries]);

  const hasFiltersApplied = typeFilter !== "all" || approvalFilter !== "all";
  const displayTotals = hasFiltersApplied ? fallbackTotals : (totals ?? fallbackTotals);

  function exportCsv() {
    const headers = ["id", "logType", "amount", "submittedAt", "approvedAt", "onTime", "accountingStatus", "reason"];
    const lines = [
      headers.join(","),
      ...filteredEntries.map((e) => [
        e.id,
        e.logType,
        String(e.rwfDelta),
        e.submittedAt,
        e.approvedAt ?? "",
        e.onTime == null ? "" : String(e.onTime),
        e.accountingStatus ?? "",
        e.reason ?? "",
      ].map((x) => JSON.stringify(String(x))).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `my-earnings-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title={title}
        subtitle={`${subtitle} (${from} to ${to})`}
        action={
          <Link to={backHref} className="text-sm font-medium text-emerald-800 hover:underline">
            {back}
          </Link>
        }
      />

      {!loading && !error ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">
              <TranslatedText text={approvedTotalLbl} />:{" "}
              <span className="text-lg font-bold text-emerald-950">{formatRwf(displayTotals.netApproved)}</span>
            </p>
            <p className="mt-2 text-sm text-emerald-900/90">
              <TranslatedText text={netAllLbl} />: {formatRwf(displayTotals.netAll)}
            </p>
            <p className="mt-1 text-sm text-emerald-900/90">
              <TranslatedText text={pendingTotalLbl} />: {formatRwf(displayTotals.netPending)}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              {filteredEntries.filter((e) => e.approvedAt != null).length} approved · {filteredEntries.filter((e) => e.approvedAt == null).length} pending
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-neutral-600">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs" />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs" />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Type
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="mt-1 block rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs">
            <option value="all">All</option>
            <option value="check_in">Round check-in</option>
            <option value="feed_entry">Feed entry</option>
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Approval
          <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value as typeof approvalFilter)} className="mt-1 block rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs">
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium">Apply</button>
        <button type="button" onClick={exportCsv} className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium">Export CSV</button>
      </div>

      {loading && <SkeletonList rows={4} />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && filteredEntries.length === 0 ? <EmptyState title={emptyMsg} /> : null}

      {!loading && !error && filteredEntries.length > 0 ? (
        <>
          <div className="institutional-table-wrapper overflow-x-auto">
            <table className="institutional-table min-w-[36rem] text-sm">
              <thead>
                <tr>
                  <th>{colType}</th>
                  <th>{colAmount}</th>
                  <th>{colWhen}</th>
                  <th>{colStatus}</th>
                  <th>{colApproved}</th>
                  <th>Accounting</th>
                  <th>{colReason}</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredEntries.filter((e) => e.approvedAt != null), ...filteredEntries.filter((e) => e.approvedAt == null)].map((e) => (
                  <tr key={e.id}>
                    <td>{e.logType}</td>
                    <td className={e.rwfDelta >= 0 ? "text-emerald-800" : "text-red-800"}>
                      {formatRwf(e.rwfDelta)}
                    </td>
                    <td className="font-mono text-xs">{e.submittedAt}</td>
                    <td>{e.onTime == null ? "—" : e.onTime ? yes : no}</td>
                    <td>{e.approvedAt ? yes : pending}</td>
                    <td>{e.accountingStatus ?? "not_applicable"}</td>
                    <td className="max-w-[14rem] truncate">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
