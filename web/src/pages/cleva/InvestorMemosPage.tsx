import { PageHeader } from "../../components/PageHeader";
import { PermissionGuard } from "../../components/PermissionGuard";

export function InvestorMemosPage() {
  return (
    <div className="space-y-stack">
      <PageHeader title="Investor memos" />
      <PermissionGuard
        permission="view_investor_memos"
        fallback={
          <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Your role does not include investor communications, or financial clearance is off for
            this user.
          </p>
        }
      >
        <div className="institutional-table-wrapper overflow-x-auto rounded-xl border border-neutral-200 bg-white p-card shadow-sm">
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
