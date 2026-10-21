import { useCallback, useEffect, useState } from "react";
import { MarketPageHead } from "../../components/layout/MarketAppHeader";
import { PageTabs } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import {
  fetchVerifyQueue,
  verifyBuyer,
  verifyCompany,
  verifyFarmProfile,
  verifyLot,
  verifyScoutApplication,
  type VerifyQueue,
} from "../../api/pipeline.api";

export function MarketVerifyPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [tab, setTab] = useState<"farms" | "buyers" | "lots" | "profiles" | "claims" | "scouts">("profiles");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<VerifyQueue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      setQueue(await fetchVerifyQueue(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load queue");
    } finally {
      setLoading(false);
    }
  }, [allowed, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(
    kind: "company" | "buyer" | "lot" | "profile" | "scout",
    id: string,
    status: "verified" | "rejected"
  ) {
    const reason = reasons[`${kind}:${id}`]?.trim() || "";
    if (status === "rejected" && (kind === "lot" || kind === "profile") && !reason) {
      showToast("error", "Add a reason before rejecting.");
      return;
    }
    setBusy(`${kind}:${id}`);
    try {
      if (kind === "company") await verifyCompany(token, id, status);
      else if (kind === "buyer") await verifyBuyer(token, id, status);
      else if (kind === "profile") await verifyFarmProfile(token, id, status, reason);
      else if (kind === "scout") await verifyScoutApplication(token, id, status === "verified" ? "approved" : "rejected");
      else await verifyLot(token, id, status, reason);
      showToast("success", status === "verified" ? "Verified" : "Rejected");
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (!allowed) {
    return (
      <div className="store-wrap space-y-3 pb-8">
        <MarketPageHead title="Verification" />
        <p className="text-sm text-[var(--store-muted)]">Ops only.</p>
      </div>
    );
  }

  const farms = queue?.companies ?? [];
  const buyers = queue?.buyers ?? [];
  const profiles = queue?.profiles ?? [];
  const lots = (queue?.lots ?? []) as Array<
    VerifyQueue["lots"][number] & {
      scoutName?: string | null;
      farmName?: string | null;
      consentStatus?: string | null;
      claimed?: boolean;
    }
  >;
  const claimReviews = queue?.claimReviews ?? [];
  const scouts = queue?.scouts ?? [];

  return (
    <div className="store-wrap space-y-4 pb-8">
      <MarketPageHead
        title="Verification"
        action={
          <button type="button" className="store-btn store-btn-ghost" onClick={() => void reload()}>
            Refresh
          </button>
        }
      />
      <p className="text-sm leading-relaxed text-[var(--store-muted)]">
        Approve the seller first. Their flocks stay private until you approve each one.
      </p>
      <PageTabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        options={[
          { value: "profiles", label: "Sellers", badge: profiles.length },
          { value: "scouts", label: "Scouts", badge: scouts.length },
          { value: "lots", label: "Flocks", badge: lots.length },
          { value: "buyers", label: "Buyers", badge: buyers.length },
          { value: "farms", label: "Farms", badge: farms.length },
          { value: "claims", label: "Handoffs", badge: claimReviews.length },
        ]}
      />
      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : tab === "farms" ? (
        <ul className="space-y-2">
          {farms.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No pending farms.</p>
          ) : (
            farms.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3"
              >
                <p className="font-medium text-[var(--text-primary)]">{c.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{c.slug}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="store-btn store-btn-ember"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `company:${c.id}`}
                    onClick={() => void act("company", c.id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="store-btn store-btn-ghost"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `company:${c.id}`}
                    onClick={() => void act("company", c.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : tab === "profiles" ? (
        <ul className="space-y-2">
          {profiles.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No sellers waiting. New applications show up here.</p>
          ) : (
            profiles.map((p) => (
              <li key={p.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-[var(--text-primary)]">{p.displayName}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {p.district || "No district"}
                      {p.contactPhone ? ` · ${p.contactPhone}` : ""}
                    </p>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                    {p.flockCount ?? 0}
                    <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">flocks</span>
                  </p>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {p.scoutName ? `Brought by ${p.scoutName}` : p.claimed ? "Applied themselves" : "Not claimed yet"}
                </p>
                <label className="mt-2 block text-xs text-[var(--text-muted)]">
                  Reject reason
                  <input
                    className="mt-1 w-full min-h-11 rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3"
                    value={reasons[`profile:${p.id}`] || ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [`profile:${p.id}`]: e.target.value }))}
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="store-btn store-btn-ember"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `profile:${p.id}`}
                    onClick={() => void act("profile", p.id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="store-btn store-btn-ghost"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `profile:${p.id}`}
                    onClick={() => void act("profile", p.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : tab === "scouts" ? (
        <ul className="space-y-2">
          {scouts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No one is waiting to become a scout.</p>
          ) : (
            scouts.map((s) => (
              <li key={s.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
                <p className="text-base font-semibold text-[var(--text-primary)]">{s.fullName}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {s.district || "No district"}
                  {s.phone ? ` · ${s.phone}` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{s.email}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="store-btn store-btn-ember"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `scout:${s.id}`}
                    onClick={() => void act("scout", s.id, "verified")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="store-btn store-btn-ghost"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `scout:${s.id}`}
                    onClick={() => void act("scout", s.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : tab === "buyers" ? (
        <ul className="space-y-2">
          {buyers.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No pending buyers.</p>
          ) : (
            buyers.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {b.name} · {b.buyerType}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{b.district || "—"}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="store-btn store-btn-ember"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `buyer:${b.id}`}
                    onClick={() => void act("buyer", b.id, "verified")}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="store-btn store-btn-ghost"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `buyer:${b.id}`}
                    onClick={() => void act("buyer", b.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : tab === "lots" ? (
        <ul className="space-y-2">
          {lots.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No lots awaiting review.</p>
          ) : (
            lots.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {l.district || "—"} · {l.birdCount} birds
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {l.farmLabel || l.farmName || "Flock"} · {String(l.readyFrom || "").slice(0, 10)}
                  {l.scoutName ? ` · scout ${l.scoutName}` : ""}
                  {l.claimed ? " · Claimed" : " · Unclaimed"}
                  {l.consentStatus ? ` · consent ${l.consentStatus}` : ""}
                </p>
                <label className="mt-2 block text-xs text-[var(--text-muted)]">
                  Reject reason
                  <input
                    className="mt-1 w-full min-h-11 rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3"
                    value={reasons[`lot:${l.id}`] || ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [`lot:${l.id}`]: e.target.value }))}
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="store-btn store-btn-ember"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `lot:${l.id}`}
                    onClick={() => void act("lot", l.id, "verified")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="store-btn store-btn-ghost"
                    style={{ minHeight: 36, padding: "0 0.85rem", fontSize: "0.82rem" }}
                    disabled={busy === `lot:${l.id}`}
                    onClick={() => void act("lot", l.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : (
        <ul className="space-y-2">
          {claimReviews.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No seller handoffs need help.</p>
          ) : (
            claimReviews.map((c) => (
              <li key={c.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                <p className="font-medium text-[var(--text-primary)]">{c.farmName}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {c.district || "—"} · {c.claimed ? "Claimed" : "Unclaimed"}
                  {c.scoutName ? ` · scout ${c.scoutName}` : ""}
                  {c.consentStatus ? ` · consent ${c.consentStatus}` : ""}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {c.reviewReason === "email_mismatch"
                    ? "Invite email did not match the account."
                    : c.reviewReason === "has_listings"
                      ? "The seller already has a flock."
                      : "This handoff needs a person at Cleva."}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
