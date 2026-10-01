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
  type VerifyQueue,
} from "../../api/pipeline.api";

export function MarketVerifyPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const [tab, setTab] = useState<"farms" | "buyers" | "lots" | "profiles">("farms");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<VerifyQueue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    kind: "company" | "buyer" | "lot" | "profile",
    id: string,
    status: "verified" | "rejected"
  ) {
    setBusy(`${kind}:${id}`);
    try {
      if (kind === "company") await verifyCompany(token, id, status);
      else if (kind === "buyer") await verifyBuyer(token, id, status);
      else if (kind === "profile") await verifyFarmProfile(token, id, status);
      else await verifyLot(token, id, status);
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
  const lots = queue?.lots ?? [];
  const profiles = queue?.profiles ?? [];

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
      <PageTabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        options={[
          { value: "farms", label: "Farms", badge: farms.length },
          { value: "buyers", label: "Buyers", badge: buyers.length },
          { value: "lots", label: "Lots", badge: lots.length },
          { value: "profiles", label: "Storefronts", badge: profiles.length },
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
            <p className="text-sm text-[var(--text-muted)]">No storefronts awaiting review.</p>
          ) : (
            profiles.map((p) => (
              <li key={p.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
                <p className="font-medium text-[var(--text-primary)]">{p.displayName}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {p.district || "—"} · consent {p.consentStatus} · {p.published ? "published" : "private"}
                </p>
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
      ) : (
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
                  {l.farmLabel || "Lot"} · {String(l.readyFrom).slice(0, 10)}
                </p>
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
      )}
    </div>
  );
}
