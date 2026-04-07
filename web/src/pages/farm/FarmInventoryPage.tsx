import { PageHeader } from "../../components/PageHeader";
import { useLaborerT } from "../../i18n/laborerI18n";

export function FarmInventoryPage() {
  const tTitle = useLaborerT("Feed inventory");
  const tBody = useLaborerT(
    "Starter / grower / finisher lots, valuations, and expiry. Procurement role primarily edits here."
  );
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <PageHeader title={tTitle} subtitle={tBody} />
    </div>
  );
}
