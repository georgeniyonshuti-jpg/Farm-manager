import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/OdooConnectionContext";
import { getLoans } from "../../api/erpnext.api";
import { getStoredErpnextCompany } from "../../lib/erpnextPrefs";

type LoanRow = {
  name: string;
  applicant?: string;
  loan_amount?: number;
  status?: string;
  disbursement_date?: string;
  total_payment?: number;
  total_principal_paid?: number;
};

export function PortfolioPage() {
  const { token } = useAuth();
  const { status } = useERPNextConnection();
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const company = getStoredErpnextCompany() || status?.company;
    if (!token || !status?.connected || !company) {
      setLoans([]);
      return;
    }
    setLoading(true);
    void getLoans(token, company)
      .then((data) => setLoans(Array.isArray(data) ? data : []))
      .catch(() => setLoans([]))
      .finally(() => setLoading(false));
  }, [token, status?.connected, status?.company]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <PageHeader
          title="Portfolio analytics"
          subtitle="Clevafarm finance exposure, cohort performance, and risk bands."
        />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <PageHeader
          title="ERPNext loans"
          subtitle="Live loan portfolio from Frappe Lending (via ERPNext)."
        />
        {!status?.connected && (
          <p className="mt-3 text-sm text-neutral-600">
            Connect ERPNext under Farm → ERPNext integration to load loans here.
          </p>
        )}
        {status?.connected && loading && <p className="mt-3 text-sm text-neutral-500">Loading loans…</p>}
        {status?.connected && !loading && loans.length === 0 && (
          <p className="mt-3 text-sm text-neutral-600">No loans found for the selected company.</p>
        )}
        {loans.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Applicant</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Disbursed</th>
                  <th className="py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.name} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">{loan.name}</td>
                    <td className="py-2 pr-4">{loan.applicant || "—"}</td>
                    <td className="py-2 pr-4">{loan.loan_amount?.toLocaleString() ?? "—"}</td>
                    <td className="py-2 pr-4">{loan.status || "—"}</td>
                    <td className="py-2 pr-4">{loan.disbursement_date || "—"}</td>
                    <td className="py-2">{loan.total_principal_paid?.toLocaleString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
