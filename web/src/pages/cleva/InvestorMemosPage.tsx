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
        <ul className="mt-4 space-y-3 sm:hidden">
          <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <p className="font-semibold text-neutral-900">Q1 2026</p>
            <p className="mt-2 text-neutral-700">
              Confidential portfolio narrative — visible only with memo access.
            </p>
          </li>
        </ul>
        <div className="institutional-table-wrapper mt-4 hidden overflow-x-auto sm:block">
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
