import { PageHeader } from "../../components/PageHeader";
import { PermissionGuard } from "../../components/PermissionGuard";

export function InvestorMemosPage() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <PageHeader title="Investor memos" />
      <PermissionGuard
        permission="view_investor_memos"
        fallback={
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your role does not include investor communications, or financial clearance is off for
            this user.
          </p>
        }
      >
        <div className="institutional-table-wrapper mt-4 overflow-x-auto">
          <table className="institutional-table text-sm">
            <thead>
              <tr>
                <th>Period</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Q1 2026</td>
                <td>Confidential portfolio narrative — visible only with memo access.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </PermissionGuard>
    </div>
  );
}
