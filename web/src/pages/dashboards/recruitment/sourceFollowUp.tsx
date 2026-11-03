import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { Button, Field, Input } from "../../../components/ui";
import { useToast } from "../../../components/Toast";
import { fetchSignupAttempts, patchSignupAttempt, type SignupAttempt } from "../../../api/signups.api";

const AD_SOURCES = ["facebook", "instagram", "google", "whatsapp"];

function adLink(source: string, campaign: string) {
  let url = `https://market.cleva.rw/signup?from=market&utm_source=${encodeURIComponent(source)}`;
  const name = campaign.trim();
  if (name && name.toLowerCase() !== "launch") {
    url += `&utm_campaign=${encodeURIComponent(name)}`;
  }
  return url;
}

function waHref(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").replace(/^0/, "250");
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}`;
}

export function SourceFollowUp() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [attempts, setAttempts] = useState<SignupAttempt[] | null>(null);
  const [campaign, setCampaign] = useState("launch");

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    void fetchSignupAttempts(token, { outcome: "failed", handled: "open", days: 30, limit: 20 })
      .then((data) => {
        if (!cancel) setAttempts(data.attempts);
      })
      .catch(() => {
        if (!cancel) setAttempts([]);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function markHandled(id: string) {
    if (!token) return;
    await patchSignupAttempt(token, id, true);
    setAttempts((rows) => (rows || []).filter((row) => row.id !== id));
    showToast("success", "Marked handled");
  }

  return (
    <div className="rec-stack">
      {token ? (
        <section>
          <h2>Failed signups</h2>
          {attempts == null ? null : attempts.length === 0 ? (
            <p className="rec-empty">No open failed signups.</p>
          ) : (
            <ul className="rec-people">
              {attempts.map((row) => (
                <li key={row.id} className="rec-card">
                  <div className="rec-section-head">
                    <p className="font-semibold">{row.fullName || row.email || "Unknown"}</p>
                    <Button variant="secondary" size="sm" onClick={() => void markHandled(row.id)}>
                      Mark handled
                    </Button>
                  </div>
                  <p className="rec-note">
                    {[row.accountType, row.source || "direct", row.errorCode].filter(Boolean).join(" · ")}
                    {row.errorMessage ? ` — ${row.errorMessage}` : ""}
                  </p>
                  {waHref(row.phone) ? (
                    <a href={waHref(row.phone)!} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section>
        <h2>Ad links</h2>
        <div className="rec-form">
          <Field label="Campaign">
            <Input value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="launch" />
          </Field>
        </div>
        <ul className="rec-people">
          {AD_SOURCES.map((source) => {
            const url = adLink(source, campaign);
            return (
              <li key={source} className="rec-section-head">
                <span className="font-semibold capitalize">{source}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => showToast("success", "Copied"));
                  }}
                >
                  Copy
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
