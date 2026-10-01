import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useToast } from "../../components/Toast";
import { SuperAdminPlansSection } from "./SuperAdminPlansSection";

export function SuperAdminPlansPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [createSignal, setCreateSignal] = useState(0);

  return (
    <ManagerPage>
      <PageHeader
        title="Plans"
        primaryAction={{ label: "New plan", onClick: () => setCreateSignal((n) => n + 1) }}
      />
      <SuperAdminPlansSection
        token={token}
        embedded
        createSignal={createSignal}
        onError={(msg) => {
          if (msg) showToast("error", msg);
        }}
      />
    </ManagerPage>
  );
}
