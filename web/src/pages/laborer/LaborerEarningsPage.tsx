import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { kigaliMonthRange } from "../../lib/kigaliMonthRange";
import { formatPayrollPeriodLabel } from "../../lib/formatFieldDateTime";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { payrollLogTypeLabel } from "../../components/field/payrollLabels";
import { EmptyState } from "../../components/EmptyState";
import { FieldEarningsHero } from "../../components/field/FieldEarningsHero";
import { FieldPayrollEntryList } from "../../components/field/FieldPayrollEntryList";
import { FieldPageHeader } from "../../components/layout/FieldPageHeader";
import { FieldHeaderAction } from "../../components/layout/FieldHeaderAction";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { usePayrollMonthTotals, type PayrollTotals } from "../../hooks/usePayrollMonthTotals";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { Button, SegmentedControl } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";

export function LaborerEarningsPage() {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const title = useLaborerT("My earnings");
  const subtitle = useLaborerT(
    user?.role === "vet"
      ? "Credits and deductions from vet visits and feed logs this month (read-only)."
      : "Credits and deductions from round check-ins and feed logs this month (read-only)."
  );
  const back = useLaborerT("Back to home");
  const emptyMsg = useLaborerT("No entries yet this month.");
  const emptyEligible = useLaborerT("Earnings appear when you complete eligible field tasks.");
  const yes = useLaborerT("Yes");
  const no = useLaborerT("No");
  const pending = useLaborerT("Pending");
  const approvedTotalLbl = useLaborerT("Approved");
  const pendingTotalLbl = useLaborerT("Pending approval");
  const netAllLbl = useLaborerT("Net (all)");
  const filterAll = useLaborerT("All");
  const filterApproved = useLaborerT("Approved");
  const filterPending = useLaborerT("Pending");
  const typeCheckIn = useLaborerT("Round check-in");
  const typeFeed = useLaborerT("Feed log");
  const changePeriod = useLaborerT("Change period");
  const periodTitle = useLaborerT("Pay period");
  const fromLbl = useLaborerT("From");
  const toLbl = useLaborerT("To");
  const applyLbl = useLaborerT("Apply");
  const cancelLbl = useLaborerT("Cancel");
  const exportLbl = useLaborerT("Export CSV");
  const awaitingLbl = useLaborerT("{approved} approved · {pending} pending");

  const initial = useMemo(() => kigaliMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<"all" | "approved" | "pending">("all");
  const typeVetVisit = useLaborerT("Vet visit");
  const [typeFilter, setTypeFilter] = useState<"all" | "check_in" | "feed_entry" | "vet_log">("all");

  const { entries, totals, error, loading, reload } = usePayrollMonthTotals({ from, to });

  const backHref = useMemo(() => {
    if (user?.role === "vet") return companyHref("/dashboard/vet");
    return companyHref("/dashboard/laborer");
  }, [user?.role, companyHref]);

  const periodLabel = useMemo(() => formatPayrollPeriodLabel(from, to), [from, to]);

  const logTypeLabel = (logType: string) => {
    if (logType === "check_in") return typeCheckIn;
    if (logType === "feed_entry") return typeFeed;
    if (logType === "vet_log") return typeVetVisit;
    return payrollLogTypeLabel(logType);
  };

  const hasMixedTypes = useMemo(() => {
    const types = new Set(entries.map((e) => e.logType));
    return types.size > 1;
  }, [entries]);

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
  const displayTotals = hasFiltersApplied ? fallbackTotals : totals;
  const approvedCount = filteredEntries.filter((e) => e.approvedAt != null).length;
  const pendingCount = filteredEntries.filter((e) => e.approvedAt == null).length;

  function openPeriodModal() {
    setDraftFrom(from);
    setDraftTo(to);
    setPeriodOpen(true);
  }

  function applyPeriod() {
    setFrom(draftFrom);
    setTo(draftTo);
    setPeriodOpen(false);
  }

  function exportCsv() {
    const headers = ["id", "logType", "amount", "submittedAt", "approvedAt", "onTime", "accountingStatus", "reason"];
    const lines = [
      headers.join(","),
      ...filteredEntries.map((e) =>
        [
          e.id,
          e.logType,
          String(e.rwfDelta),
          e.submittedAt,
          e.approvedAt ?? "",
          e.onTime == null ? "" : String(e.onTime),
          e.accountingStatus ?? "",
          e.reason ?? "",
        ]
          .map((x) => JSON.stringify(String(x)))
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `my-earnings-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 sm:max-w-xl">
      <FieldPageHeader
        title={title}
        backTo={backHref}
        backLabel={back}
        showAccount
        action={
          filteredEntries.length > 0 ? (
            <FieldHeaderAction onClick={exportCsv}>{exportLbl}</FieldHeaderAction>
          ) : undefined
        }
      />

      <div className="space-y-1 -mt-2">
        <p className="type-h3 text-[var(--text-primary)]">{periodLabel}</p>
        <p className="type-caption text-[var(--text-muted)]">
          <TranslatedText text={subtitle} />
        </p>
        <button
          type="button"
          onClick={openPeriodModal}
          className="bounce-tap text-sm font-semibold text-[var(--primary-color)]"
        >
          {changePeriod}
        </button>
      </div>

      {loading ? <SkeletonList rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {!loading && !error && displayTotals ? (
        <FieldEarningsHero
          totals={displayTotals}
          approvedLabel={approvedTotalLbl}
          pendingLabel={pendingTotalLbl}
          netAllLabel={netAllLbl}
          awaitingLabel={awaitingLbl}
          approvedCount={approvedCount}
          pendingCount={pendingCount}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <SegmentedControl
            fullWidth
            size="sm"
            value={approvalFilter}
            onChange={(v) => setApprovalFilter(v as typeof approvalFilter)}
            options={[
              { value: "all", label: filterAll },
              { value: "approved", label: filterApproved },
              { value: "pending", label: filterPending },
            ]}
          />

          {hasMixedTypes ? (
            <SegmentedControl
              fullWidth
              size="sm"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as typeof typeFilter)}
              options={[
                { value: "all", label: filterAll },
                { value: "check_in", label: typeCheckIn },
                { value: "feed_entry", label: typeFeed },
                ...(entries.some((e) => e.logType === "vet_log")
                  ? [{ value: "vet_log" as const, label: typeVetVisit }]
                  : []),
              ]}
            />
          ) : null}

          {filteredEntries.length === 0 ? (
            <EmptyState
              variant="compact"
              title={entries.length === 0 ? emptyEligible : emptyMsg}
              action={
                entries.length === 0 ? (
                  <Link to={companyHref("")}>
                    <Button variant="primary" size="sm">
                      <TranslatedText text={back} />
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <FieldPayrollEntryList
              entries={filteredEntries}
              approvedLabel={filterApproved}
              pendingLabel={pending}
              onTimeYes={yes}
              onTimeNo={no}
              emptyText={emptyMsg}
              getTypeLabel={logTypeLabel}
            />
          )}
        </>
      ) : null}

      <Modal
        open={periodOpen}
        title={periodTitle}
        onClose={() => setPeriodOpen(false)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPeriodOpen(false)}>
              {cancelLbl}
            </Button>
            <Button size="sm" onClick={applyPeriod}>
              {applyLbl}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {fromLbl}
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="mt-1 block w-full min-h-[48px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            {toLbl}
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="mt-1 block w-full min-h-[48px] rounded-xl border border-[var(--border-input)] bg-[var(--surface-input)] px-3 text-base"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
