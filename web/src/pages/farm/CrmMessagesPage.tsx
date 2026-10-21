import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { launchCrmInbox } from "../../api/pipeline.api";
import { Button } from "../../components/ui";

/**
 * Desk doorway into the shared WhatsApp inbox.
 * Scouts, buyers, and sellers never get a launch token. The server decides.
 */
export function CrmMessagesPage() {
  const { token, user } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const allowed = canAccessPipelineDesk(user);

  async function openInbox() {
    setError(null);
    setNote(null);
    setOpening(true);
    try {
      const launch = await launchCrmInbox(token);
      if (!launch.configured || !launch.url || !launch.token) {
        setNote(launch.message || "WhatsApp inbox is not connected yet.");
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = launch.url;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "token";
      input.value = launch.token;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open messages.");
    } finally {
      setOpening(false);
    }
  }

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to open messages.</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Messages</h1>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        WhatsApp replies for new contacts happen in the shared inbox. One Cleva number, many staff. Scouts keep working from My sellers in this app.
      </p>
      <Button type="button" className="min-h-12" disabled={opening} onClick={() => void openInbox()}>
        {opening ? "Opening…" : "Open inbox"}
      </Button>
      {note ? <p className="text-sm text-[var(--text-secondary)]">{note}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
