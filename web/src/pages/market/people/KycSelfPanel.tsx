import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { fetchMyRecruitment, submitMyKyc, type RecruitmentContact } from "../../../api/marketInsights.api";
import { KycPanel } from "./KycPanel";

export function KycSelfPanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [contact, setContact] = useState<RecruitmentContact | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchMyRecruitment(token);
      setContact(data.contact);
    } catch {
      setContact(null);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!contact || contact.stage !== "kyc") {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Before you can trade</h2>
      <KycPanel
        contact={contact}
        desk={false}
        busy={busy}
        onSubmit={async (body) => {
          if (!token) return;
          setBusy(true);
          try {
            const saved = await submitMyKyc(token, body);
            setContact(saved.contact);
            showToast("success", "Saved");
          } catch (e) {
            showToast("error", e instanceof Error ? e.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
