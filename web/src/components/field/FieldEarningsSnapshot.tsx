import { formatRwf } from "../../lib/formatRwf";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPageByKey } from "../../auth/permissions";
import { TranslatedText, useLaborerT } from "../../i18n/laborerI18n";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useFarmCapabilities } from "../../hooks/useFarmCapabilities";
import { usePayrollMonthTotals } from "../../hooks/usePayrollMonthTotals";
import { FieldEarningsHero } from "./FieldEarningsHero";
import { SkeletonList } from "../LoadingSkeleton";

type Props = {
  variant?: "default" | "compact";
};

export function FieldEarningsSnapshot({ variant = "default" }: Props) {
  const { user } = useAuth();
  const { companyHref } = useCompanyNav();
  const { can, hasBootstrap } = useFarmCapabilities();
  const { totals, entries, loading, error } = usePayrollMonthTotals();

  const title = useLaborerT("This month");
  const approvedLbl = useLaborerT("Approved");
  const pendingLbl = useLaborerT("Pending approval");
  const netLbl = useLaborerT("Net (all)");
  const viewDetails = useLaborerT("View details");
  const awaitingLbl = useLaborerT("{approved} approved · {pending} pending");

  const showPayroll =
    user &&
    (hasBootstrap ? can("payroll_visible") : canAccessPageByKey(user, "laborer_earnings"));

  if (!showPayroll) return null;

  if (loading) {
    return (
      <section aria-label={title}>
        <SkeletonList rows={1} />
      </section>
    );
  }

  if (error) return null;

  if (variant === "compact") {
    return (
      <section
        className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] px-4 py-3 text-sm"
        aria-label={title}
      >
        <p className="text-[var(--text-secondary)]">
          <TranslatedText text={approvedLbl} />:{" "}
          <span className="font-semibold text-[var(--text-primary)]">{formatRwf(totals.netApproved)}</span>
          {" · "}
          <Link
            to={companyHref("/laborer/earnings")}
            className="font-semibold text-[var(--primary-color)]"
          >
            {viewDetails}
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-label={title} className="space-y-3">
      <FieldEarningsHero
        totals={totals}
        approvedLabel={approvedLbl}
        pendingLabel={pendingLbl}
        netAllLabel={netLbl}
        awaitingLabel={awaitingLbl}
        approvedCount={entries.filter((e) => e.approvedAt != null).length}
        pendingCount={entries.filter((e) => e.approvedAt == null).length}
      />
      <Link
        to={companyHref("/laborer/earnings")}
        className="inline-block text-sm font-semibold text-[var(--primary-color)]"
      >
        {viewDetails}
      </Link>
    </section>
  );
}
