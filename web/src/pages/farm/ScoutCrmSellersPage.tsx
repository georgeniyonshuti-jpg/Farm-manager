import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canScoutPipeline } from "../../auth/permissions";
import {
  fetchCrmSeller,
  fetchCrmSellers,
  updateCrmSeller,
  type CrmSellerRow,
} from "../../api/pipeline.api";
import { Button } from "../../components/ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  visit_scheduled: "Visit booked",
  visit_completed: "Visited",
  outcome_recorded: "Outcome saved",
};

export function ScoutCrmSellersPage() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const [params] = useSearchParams();
  const selectedId = params.get("id");
  const allowed = canScoutPipeline(user);
  const [sellers, setSellers] = useState<CrmSellerRow[] | null>(null);
  const [seller, setSeller] = useState<CrmSellerRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setError(null);
    try {
      if (selectedId) {
        const res = await fetchCrmSeller(token, selectedId);
        setSeller(res.seller);
      } else {
        const res = await fetchCrmSellers(token);
        setSellers(res.sellers);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load sellers.";
      if (message === "Not found.") {
        setSellers([]);
        setSeller(null);
        return;
      }
      setError(message);
    }
  }, [allowed, selectedId, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(action: string) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateCrmSeller(token, selectedId, {
        action,
        nextActionAt: when ? new Date(when).toISOString() : undefined,
        outcomeNote: note || undefined,
      });
      setSeller(res.seller);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">You do not have permission to scout.</p>;
  }

  if (selectedId) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        <Link to={companyHref("/farm/pipeline/crm-sellers")} className="text-sm font-medium text-[var(--text-muted)]">
          All assigned sellers
        </Link>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {seller ? (
          <>
            <h1 className="text-2xl font-semibold">{seller.contactName}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {seller.district || "District not set"}
              {seller.birdCount ? ` · ${seller.birdCount} birds` : ""}
              {seller.availabilityDate ? ` · ${String(seller.availabilityDate).slice(0, 10)}` : ""}
            </p>
            <p className="text-sm">
              <a className="font-medium text-[var(--primary-color)]" href={`tel:${seller.phone}`}>
                {seller.phone}
              </a>
            </p>
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              {STATUS_LABEL[seller.visitStatus] || seller.visitStatus}
            </p>
            {seller.handoffNote ? (
              <p className="rounded-2xl bg-[var(--surface-subtle)] p-4 text-sm leading-relaxed">{seller.handoffNote}</p>
            ) : null}
            <label className="block text-sm">
              Next visit
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Outcome
              <textarea
                className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="grid gap-2">
              <Button type="button" disabled={saving} onClick={() => void act("contacted")}>
                Mark contacted
              </Button>
              <Button type="button" disabled={saving} onClick={() => void act("visit_scheduled")}>
                Schedule visit
              </Button>
              <Button type="button" disabled={saving} onClick={() => void act("visit_completed")}>
                Visit done
              </Button>
              <Button type="button" disabled={saving} onClick={() => void act("outcome_recorded")}>
                Save outcome
              </Button>
            </div>
          </>
        ) : error ? null : (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28">
      <h1 className="text-2xl font-semibold">My sellers</h1>
      <p className="text-sm text-[var(--text-muted)]">People the desk assigned to you. This is not the WhatsApp inbox.</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {sellers == null ? <p className="text-sm text-[var(--text-muted)]">Loading…</p> : null}
      {sellers?.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No sellers assigned to you yet.</p> : null}
      <ul className="space-y-2">
        {(sellers || []).map((row) => (
          <li key={row.id}>
            <Link
              to={companyHref(`/farm/pipeline/crm-sellers?id=${encodeURIComponent(row.id)}`)}
              className="block rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3"
            >
              <span className="block font-semibold">{row.contactName}</span>
              <span className="text-sm text-[var(--text-muted)]">
                {row.district || "District not set"}
                {row.birdCount ? ` · ${row.birdCount} birds` : ""} · {STATUS_LABEL[row.visitStatus] || row.visitStatus}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
