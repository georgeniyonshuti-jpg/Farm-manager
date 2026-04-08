import { PageHeader } from "../../components/PageHeader";
import { PermissionGuard } from "../../components/PermissionGuard";

export function ManagementHome() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Command center"
        subtitle="Cross-unit KPIs — Clevafarm operations and finance (subject to permissions)."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Farm FCR vs target</h2>
          <p className="mt-2 font-mono text-2xl text-neutral-900">—</p>
          <p className="text-xs text-neutral-500">Connect biological engine service.</p>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Clevafarm finance portfolio</h2>
          <p className="mt-2 text-sm text-neutral-600">Exposure and PAR summary.</p>
        </section>
        <PermissionGuard
          permission="view_net_profit"
          fallback={
            <section className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm text-neutral-600">Net margin requires financial clearance.</p>
            </section>
          }
        >
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-800">Net profit outlook</h2>
            <p className="mt-2 font-mono text-2xl text-emerald-800">Restricted</p>
            <p className="text-xs text-neutral-500">Sample — wire ledger consolidation.</p>
          </section>
        </PermissionGuard>
      </div>
      <PermissionGuard permission="view_bank_balances">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-800">Liquidity</h2>
          <p className="mt-1 text-sm text-neutral-600">Bank balances visible with clearance.</p>
        </section>
      </PermissionGuard>
    </div>
  );
}
