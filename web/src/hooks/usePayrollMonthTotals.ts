import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { readAuthHeaders } from "../lib/authHeaders";
import { kigaliMonthRange } from "../lib/kigaliMonthRange";
import { API_BASE_URL } from "../api/config";

export type PayrollRow = {
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

export type PayrollTotals = {
  netAll: number;
  netApproved: number;
  netPending: number;
};

type Options = {
  from?: string;
  to?: string;
  enabled?: boolean;
};

export function usePayrollMonthTotals(options: Options = {}) {
  const { token, user } = useAuth();
  const month = useMemo(() => kigaliMonthRange(), []);
  const from = options.from ?? month.from;
  const to = options.to ?? month.to;
  const enabled = options.enabled !== false;

  const [entries, setEntries] = useState<PayrollRow[]>([]);
  const [totals, setTotals] = useState<PayrollTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled || !user?.id) {
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
      const r = await fetch(`${API_BASE_URL}/api/payroll-impact?${qs}`, {
        headers: readAuthHeaders(token),
      });
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
  }, [enabled, token, user?.id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSubmitted = () => void load();
    window.addEventListener("farm:checkin-submitted", onSubmitted);
    window.addEventListener("farm:vet-visit-submitted", onSubmitted);
    return () => {
      window.removeEventListener("farm:checkin-submitted", onSubmitted);
      window.removeEventListener("farm:vet-visit-submitted", onSubmitted);
    };
  }, [load]);

  const fallbackTotals = useMemo((): PayrollTotals => {
    let netApproved = 0;
    let netPending = 0;
    for (const e of entries) {
      if (e.approvedAt != null) netApproved += e.rwfDelta;
      else netPending += e.rwfDelta;
    }
    return { netAll: netApproved + netPending, netApproved, netPending };
  }, [entries]);

  const displayTotals = totals ?? fallbackTotals;

  return {
    from,
    to,
    entries,
    totals: displayTotals,
    error,
    loading,
    reload: load,
  };
}
