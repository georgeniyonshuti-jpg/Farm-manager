import { PageHeader } from "../../components/PageHeader";

export function PortfolioPage() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <PageHeader
        title="Portfolio analytics"
        subtitle="Clevafarm finance exposure, cohort performance, and risk bands."
      />
    </div>
  );
}
