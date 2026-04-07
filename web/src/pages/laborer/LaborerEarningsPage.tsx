import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { readAuthHeaders } from "../../lib/authHeaders";
import { formatRwf } from "../../lib/formatRwf";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";

type PayrollRow = {
  id: string;
  logType: string;
  rwfDelta: number;
  reason: string;
  periodStart: string;
  submittedAt: string;
  onTime: boolean | null;
  approvedAt: string | null;
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

export function LaborerEarningsPage() {
  const { token, user } = useAuth();
  const title = useLaborerT("My earnings");
  const subtitle = useLaborerT("Bonuses and deductions from on-time logs this month (read-only).");
  const back = useLaborerT("Back to action center");
  const colType = useLaborerT("Type");
  const colAmount = useLaborerT("Amount");
  const colStatus = useLaborerT("On-time");
  const colApproved = useLaborerT("Approved");
  const colWhen = useLaborerT("When");
  const colReason = useLaborerT("Reason");
  const emptyMsg = useLaborerT("No entries yet this month.");
  const netLabel = useLaborerT("Net this month");
  const yes = useLaborerT("Yes");
  const no = useLaborerT("No");
  const pending = useLaborerT("Pending");
  const approvalLbl = useLaborerT("Approval");
  const onTimeLbl = useLaborerT("On-time");

  const initial = useMemo(() => monthRange(), []);
  const [entries, setEntries] = useState<PayrollRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        user_id: user.id,
        period_start: initial.from,
        period_end: initial.to,
      });
      const r = await fetch(`/api/payroll-impact?${qs}`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      setEntries((d.entries as PayrollRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, user?.id, initial.from, initial.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const net = entries.reduce((s, e) => s + e.rwfDelta, 0);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <Link to="/dashboard/laborer" className="text-sm font-medium text-emerald-800 hover:underline">
            {back}
          </Link>
        }
      />

      {!loading && !error ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            <TranslatedText text={netLabel} />:{" "}
            <span className="text-lg font-bold text-emerald-950">{formatRwf(net)}</span>
          </p>
        </div>
      ) : null}

      {loading && <SkeletonList rows={4} />}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && entries.length === 0 ? <EmptyState title={emptyMsg} /> : null}

      {!loading && !error && entries.length > 0 ? (
        <>
          <ul className="space-y-3 sm:hidden">
            {entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                <div className="flex justify-between font-semibold">
                  <span className="text-neutral-800">{e.logType}</span>
                  <span className={e.rwfDelta >= 0 ? "text-emerald-800" : "text-red-800"}>
                    {formatRwf(e.rwfDelta)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{e.submittedAt}</p>
                <p className="mt-1 text-xs text-neutral-600">{e.reason}</p>
                <p className="mt-2 text-xs text-neutral-500">
                  {onTimeLbl}: {e.onTime == null ? "—" : e.onTime ? yes : no} · {approvalLbl}:{" "}
                  {e.approvedAt ? yes : pending}
                </p>
              </li>
            ))}
          </ul>

          <div className="institutional-table-wrapper hidden overflow-x-auto sm:block">
            <table className="institutional-table text-sm">
              <thead>
                <tr>
                  <th>{colType}</th>
                  <th>{colAmount}</th>
                  <th>{colWhen}</th>
                  <th>{colStatus}</th>
                  <th>{colApproved}</th>
                  <th>{colReason}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.logType}</td>
                    <td className={e.rwfDelta >= 0 ? "text-emerald-800" : "text-red-800"}>
                      {formatRwf(e.rwfDelta)}
                    </td>
                    <td className="font-mono text-xs">{e.submittedAt}</td>
                    <td>{e.onTime == null ? "—" : e.onTime ? yes : no}</td>
                    <td>{e.approvedAt ? yes : pending}</td>
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
