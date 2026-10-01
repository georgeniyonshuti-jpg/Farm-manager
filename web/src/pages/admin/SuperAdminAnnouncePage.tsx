import { useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { useToast } from "../../components/Toast";
import { Field, Textarea } from "../../components/ui";

export function SuperAdminAnnouncePage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish(): Promise<void> {
    if (!notice.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: "Platform announcement", message: notice.trim(), type: "info" }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to publish.");
      setNotice("");
      showToast("success", "Announcement published.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Could not publish announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagerPage variant="settings">
      <PageHeader
        title="Announce"
        primaryAction={{
          label: "Publish",
          onClick: () => void publish(),
          disabled: busy || !notice.trim(),
        }}
      />
      <div className="w-full max-w-xl">
        <Field label="Message" help="Shown to all users on next login.">
          <Textarea
            className="min-h-32"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder="Platform message…"
          />
        </Field>
      </div>
    </ManagerPage>
  );
}
