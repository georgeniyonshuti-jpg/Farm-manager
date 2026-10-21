import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { Button } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { useToast } from "../../components/Toast";
import { ErrorState } from "../../components/LoadingSkeleton";
import { fetchScoutFarms, inviteScoutFarm, type ScoutFarmRow } from "../../api/pipeline.api";
import { readScoutInvite, saveScoutInvite } from "../../lib/scoutInvite";
import { sellingWeekLabel } from "../../lib/sellingWeek";

const CHIP_LABEL: Record<string, string> = {
  invite_sent: "Invite sent",
  claimed: "Claimed",
  pending_review: "Pending review",
  verified: "Verified",
  live: "Live",
  needs_review: "Needs Cleva",
};

export function ScoutHandoffPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const farmId = params.get("farmId") || "";
  const allowed = canScoutPipeline(user);
  const [farm, setFarm] = useState<ScoutFarmRow | null>(null);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const t = window.setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!allowed || !farmId) {
      setLoading(false);
      return;
    }
    const saved = readScoutInvite(farmId);
    if (saved) {
      if (saved.url) setUrl(saved.url);
      setEmailSent(saved.emailSent);
      setEmailError(saved.emailError || null);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchScoutFarms(token);
        if (cancelled) return;
        setFarm(res.farms.find((f) => f.id === farmId) || null);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this seller.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, farmId, token]);

  useEffect(() => {
    if (!url) {
      setQr("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(url, { margin: 1, width: 280 }).then((data) => {
      if (!cancelled) setQr(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("success", "Copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("error", "Could not copy. Select the link and copy it.");
    }
  }

  async function shareLink() {
    if (!url) return;
    const title = farm?.displayName || "Seller invite";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Claim ${title} on Cleva Market`, url });
        return;
      } catch {
        /* user cancelled or share failed */
      }
    }
    await copyLink();
  }

  async function resend() {
    if (!farmId || cooldown > 0) return;
    setBusy(true);
    try {
      const res = await inviteScoutFarm(token, farmId, {
        email: farm?.claimEmail || undefined,
        phone: farm?.contactPhone || undefined,
      });
      setUrl(res.url);
      setEmailSent(res.emailSent);
      setEmailError(res.emailError || null);
      saveScoutInvite(farmId, {
        url: res.url,
        emailSent: res.emailSent,
        emailError: res.emailError,
        farmName: farm?.displayName,
      });
      setCooldown(20);
      showToast("success", res.emailSent ? "Invite sent" : "New invite link ready");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not create an invite link.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to scout.</p>;
  }

  const chips = farm?.statusChips || ["pending_review"];
  const week = sellingWeekLabel(farm?.readyFrom, farm?.readyTo);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-28">
      <FieldNavHeader title="Seller handoff" backLabel="Sellers" onBack={() => navigate(companyHref("/farm/pipeline/sellers"))} />
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading seller…</p>
      ) : error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : (
        <>
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">{farm?.displayName || "Seller"}</h1>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              {farm?.birdCount ? `${farm.birdCount} birds` : "Flock recorded"}
              {week ? ` · ${week}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-sm font-medium text-[var(--text-primary)]"
                >
                  {CHIP_LABEL[chip] || chip}
                </span>
              ))}
              <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-sm font-medium">
                {farm?.consentStatus === "granted" ? "Consent granted" : "Consent pending"}
              </span>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
            <h2 className="text-lg font-semibold">Invite link</h2>
            {url ? (
              <>
                <p className="break-all text-sm text-[var(--text-secondary)]">{url}</p>
                {qr ? <img src={qr} alt="QR code for the invite link" className="mx-auto h-52 w-52" /> : null}
                <div className="grid gap-2">
                  <Button type="button" className="min-h-11 w-full" onClick={() => void copyLink()}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button type="button" variant="secondary" className="min-h-11 w-full" onClick={() => void shareLink()}>
                    Share
                  </Button>
                </div>
                {emailSent ? <p className="text-sm text-[var(--status-success)]">Invite sent</p> : null}
                {emailError ? <p className="text-sm text-[var(--status-danger)]">{emailError}</p> : null}
              </>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                No invite link on this phone yet. Create one to share in person or by email.
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              disabled={busy || cooldown > 0}
              onClick={() => void resend()}
            >
              {busy ? "Creating link…" : cooldown > 0 ? `Wait ${cooldown}s` : url ? "New invite link" : "Create invite link"}
            </Button>
          </section>

          <section className="rounded-2xl border border-[var(--border-color)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">What happens next</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>The seller opens the invite link and creates a market account.</li>
              <li>They see this flock on their listings, marked Pending review.</li>
              <li>Cleva checks the farm and the flock. It stays off the public board until then.</li>
            </ol>
            <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--accent)]" to={companyHref("/farm/pipeline/sellers")}>
              Back to my sellers
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
