import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { isCompanyLevelAdmin } from "../../auth/permissions";
import { jsonAuthHeaders, readAuthHeaders } from "../../lib/authHeaders";
import { formatRwf } from "../../lib/formatRwf";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { Button } from "../../components/ui/Button";
import {
  DataTable,
  Field,
  Input,
  PageTabs,
  StatusPill,
  TableToolbar,
  type DataColumn,
} from "../../components/ui";
import { ERPNextSyncBadge } from "../../components/accounting/ERPNextSyncBadge";
import { useToast } from "../../components/Toast";
import { API_BASE_URL } from "../../api/config";
import { getPayrollFromERPNext } from "../../api/erpnext.api";
import { getStoredErpnextCompany } from "../../lib/erpnextPrefs";
import { useERPNextConnection } from "../../context/ERPNextConnectionContext";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { formatManagerDateTime } from "../../lib/formatManagerDateTime";

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
  accountingStatus?: string;
};

type PayrollClosure = {
  id: string;
  periodStart: string;
  periodEnd: string;
  netPayrollRwf: number;
  workerCount: number;
  notes: string | null;
};

type FieldPayrollRates = {
  checkInRwf: number;
  feedRwf: number;
  missedCheckInRwf: number;
  missedFeedRwf: number;
  lateDeductionRwf: number;
  vetVisitRwf: number;
  missedVetVisitRwf: number;
  lateVetVisitDeductionRwf: number;
};

type PayrollTab = "lines" | "rates" | "closures";

function monthRange(): { from: string; to: string } {
  const n = new Date();
  const from = new Date(Date.UTC(n.getFullYear(), n.getMonth(), 1));
  const to = new Date(Date.UTC(n.getFullYear(), n.getMonth() + 1, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

export function PayrollImpactPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const { navTo } = useCompanyNav();
  const { status: erpnextStatus } = useERPNextConnection();
  const canEditFieldRates = isCompanyLevelAdmin(user);
  const canDecidePayments =
    user?.role === "superuser" || user?.role === "company_admin" || user?.role === "manager";

  const tabOptions = useMemo(() => {
    const opts: { value: PayrollTab; label: string }[] = [{ value: "lines", label: "Lines" }];
    if (canEditFieldRates) opts.push({ value: "rates", label: "Rates" });
    if (canDecidePayments) opts.push({ value: "closures", label: "Closures" });
    return opts;
  }, [canEditFieldRates, canDecidePayments]);

  const [tab, setTab] = useState<PayrollTab>("lines");
  const initial = useMemo(() => monthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [entries, setEntries] = useState<PayrollRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [fieldRatesBusy, setFieldRatesBusy] = useState(false);
  const [fieldRatesForm, setFieldRatesForm] = useState({
    checkInRwf: "",
    feedRwf: "",
    missedCheckInRwf: "",
    missedFeedRwf: "",
    lateDeductionRwf: "",
    vetVisitRwf: "",
    missedVetVisitRwf: "",
    lateVetVisitDeductionRwf: "",
  });
  const [erpnextPayrollTotal, setErpnextPayrollTotal] = useState<number | null>(null);
  const [closures, setClosures] = useState<PayrollClosure[]>([]);
  const [closureForm, setClosureForm] = useState({ periodStart: "", periodEnd: "", notes: "" });
  const [closureBusy, setClosureBusy] = useState(false);

  useEffect(() => {
    if (!tabOptions.some((o) => o.value === tab)) setTab("lines");
  }, [tab, tabOptions]);

  const loadFieldRates = useCallback(async () => {
    if (!canEditFieldRates || !token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/admin/field-payroll-rates`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Load failed");
      const fr = d as FieldPayrollRates;
      setFieldRatesForm({
        checkInRwf: String(fr.checkInRwf),
        feedRwf: String(fr.feedRwf),
        missedCheckInRwf: String(fr.missedCheckInRwf),
        missedFeedRwf: String(fr.missedFeedRwf),
        lateDeductionRwf: String(fr.lateDeductionRwf),
        vetVisitRwf: String(fr.vetVisitRwf ?? fr.checkInRwf),
        missedVetVisitRwf: String(fr.missedVetVisitRwf ?? fr.missedCheckInRwf),
        lateVetVisitDeductionRwf: String(fr.lateVetVisitDeductionRwf ?? fr.lateDeductionRwf),
      });
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not load field payroll rates");
    }
  }, [canEditFieldRates, token, showToast]);

  useEffect(() => {
    void loadFieldRates();
  }, [loadFieldRates]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period_start: from, period_end: to });
      const r = await fetch(`${API_BASE_URL}/api/payroll-impact?${qs}`, {
        headers: readAuthHeaders(token),
      });
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

  const loadClosures = useCallback(async () => {
    if (!token || !canDecidePayments) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/farm-payroll/payroll-closures`, {
        headers: readAuthHeaders(token),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setClosures(
        Array.isArray((d as { closures?: PayrollClosure[] }).closures)
          ? (d as { closures: PayrollClosure[] }).closures
          : []
      );
    } catch {
      setClosures([]);
    }
  }, [token, canDecidePayments]);

  useEffect(() => {
    void loadClosures();
  }, [loadClosures]);

  async function createClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !canDecidePayments) return;
    if (!closureForm.periodStart || !closureForm.periodEnd) {
      showToast("error", "Period start and end are required.");
      return;
    }
    setClosureBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/farm-payroll/payroll-closures`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({
          periodStart: closureForm.periodStart,
          periodEnd: closureForm.periodEnd,
          notes: closureForm.notes.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not create closure");
      showToast("success", "Period closure saved.");
      setClosureForm({ periodStart: "", periodEnd: "", notes: "" });
      await loadClosures();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not create closure");
    } finally {
      setClosureBusy(false);
    }
  }

  useEffect(() => {
    const company = getStoredErpnextCompany() || erpnextStatus?.company;
    if (!token || !erpnextStatus?.connected || !company) {
      setErpnextPayrollTotal(null);
      return;
    }
    void getPayrollFromERPNext(token, company, from, to)
      .then((rows) => {
        if (!Array.isArray(rows)) {
          setErpnextPayrollTotal(null);
          return;
        }
        const total = rows.reduce((s, r) => s + (Number(r.total_amount_paid) || 0), 0);
        setErpnextPayrollTotal(total);
      })
      .catch(() => setErpnextPayrollTotal(null));
  }, [token, erpnextStatus?.connected, erpnextStatus?.company, from, to]);

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
      const r = await fetch(`${API_BASE_URL}/api/payroll-impact/${id}/approve`, {
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
      const r = await fetch(`${API_BASE_URL}/api/payroll-impact/bulk-approve`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error);
      await load();
      setSelectedIds(new Set());
      showToast("success", "All pending lines approved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Bulk approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function approveSelected() {
    const ids = [...selectedIds].filter((id) => {
      const row = entries.find((e) => e.id === id);
      return row && !row.approvedAt;
    });
    if (!ids.length) return;
    setBusyId("selected");
    try {
      for (const id of ids) {
        const r = await fetch(`${API_BASE_URL}/api/payroll-impact/${id}/approve`, {
          method: "PATCH",
          headers: jsonAuthHeaders(token),
          body: "{}",
        });
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error);
      }
      await load();
      setSelectedIds(new Set());
      showToast("success", `Approved ${ids.length} line(s).`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  const pendingOnPage = entries.filter((e) => !e.approvedAt);
  const allPendingSelected =
    pendingOnPage.length > 0 && pendingOnPage.every((e) => selectedIds.has(e.id));

  function toggleSelectAllPending() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPendingSelected) {
        for (const e of pendingOnPage) next.delete(e.id);
      } else {
        for (const e of pendingOnPage) next.add(e.id);
      }
      return next;
    });
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

  async function saveFieldRates() {
    if (!canEditFieldRates || !token) return;
    const parsed = {
      checkInRwf: Number(fieldRatesForm.checkInRwf),
      feedRwf: Number(fieldRatesForm.feedRwf),
      missedCheckInRwf: Number(fieldRatesForm.missedCheckInRwf),
      missedFeedRwf: Number(fieldRatesForm.missedFeedRwf),
      lateDeductionRwf: Number(fieldRatesForm.lateDeductionRwf),
      vetVisitRwf: Number(fieldRatesForm.vetVisitRwf),
      missedVetVisitRwf: Number(fieldRatesForm.missedVetVisitRwf),
      lateVetVisitDeductionRwf: Number(fieldRatesForm.lateVetVisitDeductionRwf),
    };
    for (const v of Object.values(parsed)) {
      if (!Number.isFinite(v) || v < 0) {
        showToast("error", "Each value must be a non-negative number.");
        return;
      }
    }
    setFieldRatesBusy(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/admin/field-payroll-rates`, {
        method: "PUT",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(parsed),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Save failed");
      const fr = d as FieldPayrollRates;
      setFieldRatesForm({
        checkInRwf: String(fr.checkInRwf),
        feedRwf: String(fr.feedRwf),
        missedCheckInRwf: String(fr.missedCheckInRwf),
        missedFeedRwf: String(fr.missedFeedRwf),
        lateDeductionRwf: String(fr.lateDeductionRwf),
        vetVisitRwf: String(fr.vetVisitRwf ?? fr.checkInRwf),
        missedVetVisitRwf: String(fr.missedVetVisitRwf ?? fr.missedCheckInRwf),
        lateVetVisitDeductionRwf: String(fr.lateVetVisitDeductionRwf ?? fr.lateDeductionRwf),
      });
      showToast("success", "Field payroll rates saved.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setFieldRatesBusy(false);
    }
  }

  const linesMeta = useMemo(() => {
    if (loading) return undefined;
    const parts = [
      `Bonuses ${formatRwf(summary.bonuses)}`,
      `Deductions ${formatRwf(summary.deductions)}`,
      `Net ${formatRwf(summary.net)}`,
      `${summary.pending} pending`,
      `${entries.length} rows`,
    ];
    if (erpnextPayrollTotal != null) {
      parts.push(`ERPNext ${formatRwf(erpnextPayrollTotal)}`);
    }
    return parts.join(" · ");
  }, [loading, summary, entries.length, erpnextPayrollTotal]);

  const payrollColumns: DataColumn<PayrollRow>[] = useMemo(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={allPendingSelected}
            onChange={toggleSelectAllPending}
            disabled={!canDecidePayments || pendingOnPage.length === 0}
            aria-label="Select all pending on page"
          />
        ),
        className: "tbl-actions",
        render: (e) =>
          e.approvedAt ? (
            <span className="text-[var(--text-muted)]">—</span>
          ) : (
            <input
              type="checkbox"
              checked={selectedIds.has(e.id)}
              disabled={!canDecidePayments}
              aria-label={`Select ${e.workerName}`}
              onChange={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(e.id)) next.delete(e.id);
                  else next.add(e.id);
                  return next;
                });
              }}
            />
          ),
      },
      {
        key: "worker",
        header: "Worker",
        render: (e) => <span className="whitespace-nowrap font-medium">{e.workerName}</span>,
      },
      {
        key: "role",
        header: "Role",
        render: (e) => (
          <span className="whitespace-nowrap text-[var(--text-secondary)]">{e.workerRole}</span>
        ),
      },
      { key: "logType", header: "Log type", render: (e) => e.logType },
      {
        key: "submitted",
        header: "Submitted",
        className: "tbl-mono",
        render: (e) => formatManagerDateTime(e.submittedAt),
      },
      {
        key: "onTime",
        header: "On-time",
        badge: true,
        render: (e) =>
          e.onTime == null ? (
            "—"
          ) : (
            <StatusPill tone={e.onTime ? "success" : "danger"}>{e.onTime ? "Yes" : "No"}</StatusPill>
          ),
      },
      {
        key: "delta",
        header: "RWF delta",
        numeric: true,
        render: (e) => (
          <span
            className={`font-semibold ${
              e.rwfDelta >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"
            }`}
          >
            {formatRwf(e.rwfDelta)}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Reason",
        render: (e) => <span className="max-w-[14rem] block truncate">{e.reason}</span>,
      },
      {
        key: "approved",
        header: "Approved",
        badge: true,
        render: (e) => (
          <StatusPill tone={e.approvedAt ? "success" : "warning"}>
            {e.approvedAt ? "Yes" : "Pending"}
          </StatusPill>
        ),
      },
      {
        key: "accounting",
        header: "Accounting",
        badge: true,
        render: (e) => {
          const s = e.accountingStatus ?? "not_applicable";
          if (s === "not_applicable" || s === "none") {
            return <StatusPill tone="neutral">No accounting</StatusPill>;
          }
          if (s === "failed") return <ERPNextSyncBadge state="failed" />;
          if (s === "sent_to_odoo" || s === "synced" || s === "success") {
            return <ERPNextSyncBadge state="synced" />;
          }
          if (s === "pending_approval") return <StatusPill tone="warning">Awaiting approval</StatusPill>;
          return <ERPNextSyncBadge state="pending" />;
        },
      },
      {
        key: "action",
        header: "Action",
        className: "tbl-actions",
        render: (e) =>
          e.approvedAt == null && canDecidePayments ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={busyId != null}
              onClick={() => void approveOne(e.id)}
            >
              Approve
            </Button>
          ) : (
            <span className="text-[var(--text-muted)]">{canDecidePayments ? "—" : "Read only"}</span>
          ),
      },
    ],
    [busyId, canDecidePayments, selectedIds, allPendingSelected, pendingOnPage.length]
  );

  const closureColumns: DataColumn<PayrollClosure>[] = useMemo(
    () => [
      {
        key: "period",
        header: "Period",
        render: (c) => (
          <span className="tabular-nums">
            {String(c.periodStart).slice(0, 10)} → {String(c.periodEnd).slice(0, 10)}
          </span>
        ),
      },
      {
        key: "net",
        header: "Net",
        numeric: true,
        render: (c) => formatRwf(Number(c.netPayrollRwf) || 0),
      },
      {
        key: "workers",
        header: "Workers",
        numeric: true,
        render: (c) => c.workerCount,
      },
      {
        key: "notes",
        header: "Notes",
        render: (c) => <span className="max-w-[16rem] block truncate">{c.notes || "—"}</span>,
      },
    ],
    []
  );

  const headerPrimary =
    tab === "rates" && canEditFieldRates
      ? { label: "Save rates", onClick: () => void saveFieldRates(), disabled: fieldRatesBusy }
      : tab === "closures" && canDecidePayments
        ? {
            label: "Create closure",
            onClick: () => {
              const form = document.getElementById("payroll-closure-form") as HTMLFormElement | null;
              form?.requestSubmit();
            },
            disabled: closureBusy,
          }
        : undefined;

  return (
    <ManagerPage>
      <PageHeader
        title="Payroll impact"
        secondaryAction={{
          label: "Review check-ins",
          onClick: () => navTo("/farm/checkin-review"),
        }}
        primaryAction={headerPrimary}
        tabs={
          tabOptions.length > 1 ? (
            <PageTabs
              aria-label="Payroll sections"
              value={tab}
              onChange={(v) => setTab(v as PayrollTab)}
              options={tabOptions}
            />
          ) : undefined
        }
      />

      {tab === "lines" ? (
        <>
          {loading ? <SkeletonList rows={5} /> : null}
          {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
          {!loading && !error ? (
            <div className="table-block">
              {selectedIds.size > 0 && canDecidePayments ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 py-2">
                  <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                    {selectedIds.size} selected
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busyId != null}
                    loading={busyId === "selected"}
                    onClick={() => void approveSelected()}
                  >
                    Approve selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              ) : null}
              <DataTable<PayrollRow>
                flush
                columns={payrollColumns}
                rows={entries}
                rowKey={(e) => e.id}
                emptyTitle="No payroll lines in this range"
                emptyDescription=""
                filteredEmptyTitle="No payroll lines in this range"
                filteredEmptyDescription=""
                toolbar={
                  <TableToolbar
                    filters={
                      <>
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                          From
                          <input
                            type="date"
                            className="h-8 rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs text-[var(--text-primary)]"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                          />
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                          To
                          <input
                            type="date"
                            className="h-8 rounded-control border border-[var(--border-input)] bg-[var(--surface-input)] px-2 text-xs text-[var(--text-primary)]"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                          />
                        </label>
                      </>
                    }
                    meta={linesMeta}
                    actions={
                      <>
                        <Button variant="ghost" size="sm" onClick={() => void exportCsv()}>
                          Export CSV
                        </Button>
                        {canDecidePayments && summary.pending > 0 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId != null}
                            onClick={() => void approveAllPending()}
                          >
                            Approve all pending ({summary.pending})
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                }
                renderMobileCard={(e) => (
                  <div className="space-y-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{e.workerName}</span>
                      <StatusPill tone={e.approvedAt ? "success" : "warning"}>
                        {e.approvedAt ? "Approved" : "Pending"}
                      </StatusPill>
                    </div>
                    <p className="type-caption tabular-nums text-[var(--text-primary)]">
                      {e.logType} · {formatManagerDateTime(e.submittedAt)}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        e.rwfDelta >= 0
                          ? "text-[var(--status-success)]"
                          : "text-[var(--status-danger)]"
                      }`}
                    >
                      {formatRwf(e.rwfDelta)}
                    </p>
                    {e.approvedAt == null && canDecidePayments ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busyId != null}
                        onClick={() => void approveOne(e.id)}
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>
                )}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "rates" && canEditFieldRates ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveFieldRates();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Check-in credit">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.checkInRwf}
                onChange={(e) => setFieldRatesForm((f) => ({ ...f, checkInRwf: e.target.value }))}
              />
            </Field>
            <Field label="Late check-in deduction">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.lateDeductionRwf}
                onChange={(e) =>
                  setFieldRatesForm((f) => ({ ...f, lateDeductionRwf: e.target.value }))
                }
              />
            </Field>
            <Field label="Missed check-in deduction">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.missedCheckInRwf}
                onChange={(e) =>
                  setFieldRatesForm((f) => ({ ...f, missedCheckInRwf: e.target.value }))
                }
              />
            </Field>
            <Field label="Feed log credit">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.feedRwf}
                onChange={(e) => setFieldRatesForm((f) => ({ ...f, feedRwf: e.target.value }))}
              />
            </Field>
            <Field label="Missed feed deduction">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.missedFeedRwf}
                onChange={(e) =>
                  setFieldRatesForm((f) => ({ ...f, missedFeedRwf: e.target.value }))
                }
              />
            </Field>
            <Field label="Vet visit credit">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.vetVisitRwf}
                onChange={(e) => setFieldRatesForm((f) => ({ ...f, vetVisitRwf: e.target.value }))}
              />
            </Field>
            <Field label="Late vet visit deduction">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.lateVetVisitDeductionRwf}
                onChange={(e) =>
                  setFieldRatesForm((f) => ({ ...f, lateVetVisitDeductionRwf: e.target.value }))
                }
              />
            </Field>
            <Field label="Missed vet visit deduction">
              <Input
                type="number"
                min={0}
                className={mgrInput}
                value={fieldRatesForm.missedVetVisitRwf}
                onChange={(e) =>
                  setFieldRatesForm((f) => ({ ...f, missedVetVisitRwf: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="flex lg:hidden">
            <Button type="submit" variant="primary" size="sm" disabled={fieldRatesBusy} loading={fieldRatesBusy}>
              Save rates
            </Button>
          </div>
        </form>
      ) : null}

      {tab === "closures" && canDecidePayments ? (
        <div className="space-y-stack">
          <form
            id="payroll-closure-form"
            onSubmit={createClosure}
            className="grid gap-3 sm:grid-cols-3"
          >
            <Field label="Period start">
              <Input
                type="date"
                className={mgrInput}
                value={closureForm.periodStart}
                onChange={(e) => setClosureForm((f) => ({ ...f, periodStart: e.target.value }))}
                required
              />
            </Field>
            <Field label="Period end">
              <Input
                type="date"
                className={mgrInput}
                value={closureForm.periodEnd}
                onChange={(e) => setClosureForm((f) => ({ ...f, periodEnd: e.target.value }))}
                required
              />
            </Field>
            <Field label="Notes">
              <Input
                className={mgrInput}
                value={closureForm.notes}
                onChange={(e) => setClosureForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
              />
            </Field>
            <div className="flex sm:col-span-3 lg:hidden">
              <Button type="submit" size="sm" disabled={closureBusy} loading={closureBusy}>
                Create closure
              </Button>
            </div>
          </form>

          <div className="table-block">
            <DataTable<PayrollClosure>
              flush
              columns={closureColumns}
              rows={closures}
              rowKey={(c) => c.id}
              emptyTitle="No closures yet"
              emptyDescription=""
            />
          </div>
        </div>
      ) : null}
    </ManagerPage>
  );
}
