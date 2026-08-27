import { useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useBillingPlans } from "../../hooks/useBillingPlans";
import type { Plan } from "../../lib/plans";

type Props = {
  token: string | null;
  onError: (msg: string) => void;
};

const emptyDraft = (): Partial<Plan> & { featuresText: string } => ({
  id: "",
  name: "",
  price: 0,
  priceRWF: 0,
  maxUsers: 5,
  maxFlocks: 3,
  featuresText: "",
  stripePriceId: "",
  sortOrder: 0,
  isActive: true,
});

export function SuperAdminPlansSection({ token, onError }: Props) {
  const { plans, loading, reload } = useBillingPlans({ activeOnly: false, token });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setDraft(emptyDraft());
  }

  function openEdit(plan: Plan) {
    setCreating(false);
    setEditing(plan);
    setDraft({
      ...plan,
      featuresText: plan.features.join("\n"),
      stripePriceId: plan.stripePriceId ?? "",
    });
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setDraft(emptyDraft());
  }

  async function savePlan(): Promise<void> {
    if (!token) return;
    setBusy(true);
    onError("");
    try {
      const payload = {
        id: draft.id,
        name: draft.name,
        price: draft.price,
        priceRWF: draft.priceRWF,
        maxUsers: draft.maxUsers,
        maxFlocks: draft.maxFlocks,
        features: draft.featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
        stripePriceId: draft.stripePriceId || null,
        sortOrder: draft.sortOrder ?? 0,
        isActive: draft.isActive !== false,
      };
      const url = creating
        ? `${API_BASE_URL}/api/super-admin/plans`
        : `${API_BASE_URL}/api/super-admin/plans/${editing?.id}`;
      const res = await fetch(url, {
        method: creating ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      closeForm();
      reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(plan: Plan): Promise<void> {
    if (!token) return;
    if (!window.confirm(`Remove or deactivate plan "${plan.name}"?`)) return;
    setBusy(true);
    onError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/plans/${plan.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Delete failed.");
      reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const formOpen = creating || editing;

  return (
    <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Billing plans</h2>
          <p className="text-sm text-[var(--text-secondary)]">Shown on pricing and signup pages.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white"
        >
          New plan
        </button>
      </div>

      {loading ? <p className="mt-3 text-sm text-[var(--text-muted)]">Loading plans…</p> : null}

      {!loading ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                <th className="py-2">Plan</th>
                <th className="py-2">USD</th>
                <th className="py-2">RWF</th>
                <th className="py-2">Limits</th>
                <th className="py-2">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-[var(--border-color)]/60">
                  <td className="py-2 font-medium text-[var(--text-primary)]">
                    {plan.name}
                    <span className="ml-2 text-xs text-[var(--text-muted)]">({plan.id})</span>
                  </td>
                  <td className="py-2">${plan.price}/mo</td>
                  <td className="py-2">{plan.priceRWF.toLocaleString()}</td>
                  <td className="py-2 text-[var(--text-secondary)]">
                    {plan.maxUsers} users · {plan.maxFlocks} flocks
                  </td>
                  <td className="py-2">{plan.isActive === false ? "Inactive" : "Active"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openEdit(plan)}
                      className="mr-2 text-[var(--primary-color)] underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removePlan(plan)}
                      className="text-red-400 underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {formOpen ? (
        <div className="mt-4 space-y-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)]/30 p-4">
          <h3 className="font-semibold text-[var(--text-primary)]">{creating ? "New plan" : `Edit ${editing?.name}`}</h3>
          {creating ? (
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Plan id (slug)</span>
              <input
                value={draft.id ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value.toLowerCase() }))}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
                placeholder="e.g. enterprise"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Name</span>
            <input
              value={draft.name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">USD / month</span>
              <input
                type="number"
                min={0}
                value={draft.price ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">RWF / month</span>
              <input
                type="number"
                min={0}
                value={draft.priceRWF ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, priceRWF: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Max users</span>
              <input
                type="number"
                min={1}
                value={draft.maxUsers ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, maxUsers: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Max flocks</span>
              <input
                type="number"
                min={1}
                value={draft.maxFlocks ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, maxFlocks: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Features (one per line)</span>
            <textarea
              value={draft.featuresText}
              onChange={(e) => setDraft((d) => ({ ...d, featuresText: e.target.value }))}
              className="mt-1 min-h-28 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-secondary)]">Stripe price id (optional)</span>
            <input
              value={draft.stripePriceId ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, stripePriceId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              placeholder="price_..."
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="block text-sm">
              <span className="text-[var(--text-secondary)]">Sort order</span>
              <input
                type="number"
                value={draft.sortOrder ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
                className="mt-1 w-24 rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={draft.isActive !== false}
                onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
              />
              Active on pricing page
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePlan()}
              className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save plan"}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
