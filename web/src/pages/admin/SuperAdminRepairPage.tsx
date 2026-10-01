import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { DataRepairSection } from "../../components/admin/DataRepairSection";

export function SuperAdminRepairPage() {
  return (
    <ManagerPage>
      <PageHeader title="Repair" />
      <DataRepairSection embedded />
    </ManagerPage>
  );
}
