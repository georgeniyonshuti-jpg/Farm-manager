import { useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { useERPNextConnection } from "../../context/OdooConnectionContext";
import { getLoans } from "../../api/erpnext.api";
import { getStoredErpnextCompany } from "../../lib/erpnextPrefs";
import { useToast } from "../../components/Toast";

type LoanRow = {
  name: string;
  applicant?: string;
  loan_amount?: number;
  status?: string;
  total_principal_paid?: number;
  total_payment?: number;
};

export function CreditScoringPage() {
  const { token } = useAuth();
  const { status } = useERPNextConnection();
  const { showToast } = useToast();
  const [applicant, setApplicant] = useState("");
  const [history, setHistory] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory(e: React.FormEvent) {
    e.preventDefault();
    const company = getStoredErpnextCompany() || status?.company;
    if (!token || !company) {
      showToast("error", "ERPNext company not configured.");
      return;
    }
    setLoading(true);
    try {
      const loans = await getLoans(token, company);
      const rows = Array.isArray(loans) ? (loans as LoanRow[]) : [];
      const needle = applicant.trim().toLowerCase();
      const filtered = needle
        ? rows.filter((l) => (l.applicant || "").toLowerCase().includes(needle))
        : rows;
      setHistory(filtered.slice(0, 20));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not load loans");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  const paidRatio = (loan: LoanRow) => {
    const amt = Number(loan.loan_amount) || 0;
    const paid = Number(loan.total_principal_paid) || 0;
    if (amt <= 0) return null;
    return Math.round((paid / amt) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <PageHeader
          title="Credit scoring"
          subtitle="Use ERPNext loan repayment history as an input to credit decisions."
        />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-base font-semibold">Applicant ERPNext loan history</h2>
        {!status?.connected && (
          <p className="text-sm text-neutral-600">Connect ERPNext under Farm → ERPNext integration.</p>
        )}
        <form onSubmit={(e) => void loadHistory(e)} className="flex flex-wrap gap-2">
          <input
            className="min-w-[14rem] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Applicant name (partial match)"
            value={applicant}
            onChange={(e) => setApplicant(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !status?.connected}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Fetch history"}
          </button>
        </form>

        {history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="py-2 pr-4">Loan</th>
                  <th className="py-2 pr-4">Applicant</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Repaid %</th>
                </tr>
              </thead>
              <tbody>
                {history.map((loan) => (
                  <tr key={loan.name} className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">{loan.name}</td>
                    <td className="py-2 pr-4">{loan.applicant || "—"}</td>
                    <td className="py-2 pr-4">{loan.loan_amount?.toLocaleString() ?? "—"}</td>
                    <td className="py-2 pr-4">{loan.status || "—"}</td>
                    <td className="py-2">{paidRatio(loan) != null ? `${paidRatio(loan)}%` : "—"}</td>
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
