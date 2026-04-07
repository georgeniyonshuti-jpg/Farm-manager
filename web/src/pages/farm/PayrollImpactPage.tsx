import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { formatRwf } from "../../lib/formatRwf";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";

type PayrollRow = {
  id: string;
  userId: string;
  logId: string;
  logType: string;
  rwfDelta: number;
  reason: string;
  periodStart: string;
  periodEnd: string;
  approvedBy: string | null;
  approvedAt: string | null;
  submittedAt: string;
  onTime: boolean | null;
  workerName: string;
  workerRole: string;
};

function monthRange(): { from: string; to: string } {
  const n = new Date();
  const from = new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  const to = new Date(Date.UTC(n.getFullYear(), n.getMonth() + 1, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function PayrollImpactPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const initial = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [entries, setEntries] = useState<PayrollRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period_start: from, period_end: to });
      const r = await fetch(`/api/payroll-impact?${qs}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setEntries((d.entries as PayrollRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    let bonuses = 0;
    let deductions = 0;
    let pending = 0;
    for (const e of entries) {
      if (e.approvedAt == null) pending += 1;
      if (e.rwfDelta > 0) bonuses += e.rwfDelta;
      else deductions += -e.rwfDelta;
    }
    const net = entries.reduce((s, e) => s + e.rwfDelta, 0);
    return { bonuses, deductions, net, pending };
  }, [entries]);

  async function approveOne(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/payroll-impact/${id}/approve`, {
        method: "PATCH",
        headers: jsonAuthHeaders(token),
        body: "{}",
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error);
      await load();
      showToast("success", "Line approved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function approveAllPending() {
    setBusyId("all");
    try {
      const r = await fetch("/api/payroll-impact/bulk-approve", {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error);
      await load();
      showToast("success", "All pending lines approved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Bulk approve failed");
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    const headers = [
      "workerName",
      "workerRole",
      "logType",
      "submittedAt",
      "onTime",
      "rwf_delta",
      "reason",
      "approved",
    ];
    const lines = [
      headers.join(","),
      ...entries.map((e) =>
        [
          JSON.stringify(e.workerName),
          e.workerRole,
          e.logType,
          e.submittedAt,
          e.onTime == null ? "" : String(e.onTime),
          String(e.rwfDelta),
          JSON.stringify(e.reason ?? ""),
          e.approvedAt ? "yes" : "no",
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("success", "CSV downloaded.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Payroll impact"
        subtitle="Bonuses and deductions from log timing. Approve before payroll closes."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label htmlFor="p-from" className="mb-1 block text-xs font-medium text-neutral-600">
            From
          </label>
          <input
            id="p-from"
            type="date"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="p-to" className="mb-1 block text-xs font-medium text-neutral-600">
            To
          </label>
          <input
            id="p-to"
            type="date"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Apply range
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium"
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled={busyId != null || summary.pending === 0}
          onClick={() => void approveAllPending()}
          className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Approve all pending
        </button>
      </div>

      {!loading && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium text-emerald-900">Total bonuses</p>
            <p className="mt-1 text-lg font-semibold text-emerald-950">{formatRwf(summary.bonuses)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium text-red-900">Total deductions</p>
            <p className="mt-1 text-lg font-semibold text-red-950">{formatRwf(summary.deductions)}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-medium text-neutral-600">Net delta</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">{formatRwf(summary.net)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-medium text-amber-900">Pending approvals</p>
            <p className="mt-1 text-lg font-semibold text-amber-950">{summary.pending}</p>
          </div>
        </div>
      ) : null}

      {loading && <SkeletonList rows={5} />}

      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && entries.length === 0 ? (
        <EmptyState
          title="No payroll lines in this range"
          description="Adjust the date range or apply filters, then reload."
        />
      ) : null}

      <div className="space-y-3 sm:hidden">
        {!loading && !error && entries.length > 0
          ? entries.map((e) => (
            <div key={e.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex justify-between font-semibold text-neutral-900">
                <span>{e.workerName}</span>
                <span className={e.rwfDelta >= 0 ? "text-emerald-800" : "text-red-800"}>
                  {formatRwf(e.rwfDelta)}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                {e.workerRole} · {e.logType}
              </p>
              <p className="mt-1 text-xs text-neutral-600">{e.reason}</p>
              <p className="mt-2 text-xs">
                On-time: {e.onTime == null ? "—" : e.onTime ? "Yes" : "No"} · Approved:{" "}
                {e.approvedAt ? "Yes" : "No"}
              </p>
              {e.approvedAt == null ? (
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => void approveOne(e.id)}
                  className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
              ) : null}
            </div>
          ))
          : null}
      </div>

      {!loading && !error && entries.length > 0 ? (
        <div className="institutional-table-wrapper hidden overflow-x-auto sm:block">
          <table className="institutional-table min-w-[48rem] text-sm">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Role</th>
                <th>Log type</th>
                <th>Submitted</th>
                <th>On-time</th>
                <th>RWF</th>
                <th>Reason</th>
                <th>Approved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.workerName}</td>
                  <td>{e.workerRole}</td>
                  <td>{e.logType}</td>
                  <td className="font-mono text-xs">{e.submittedAt}</td>
                  <td>{e.onTime == null ? "—" : e.onTime ? "Yes" : "No"}</td>
                  <td className={e.rwfDelta >= 0 ? "font-semibold text-emerald-800" : "font-semibold text-red-800"}>
                    {formatRwf(e.rwfDelta)}
                  </td>
                  <td className="max-w-[12rem] truncate">{e.reason}</td>
                  <td>{e.approvedAt ? "Yes" : "No"}</td>
                  <td>
                    {e.approvedAt == null ? (
                      <button
                        type="button"
                        disabled={busyId != null}
                        onClick={() => void approveOne(e.id)}
                        className="text-sm font-medium text-emerald-800 hover:underline disabled:opacity-50"
                      >
                        Approve
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
