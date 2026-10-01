import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/config";
import { useBillingPlans } from "../../hooks/useBillingPlans";
import type { Plan } from "../../lib/plans";
import {
  Button,
  Checkbox,
  DataTable,
  Field,
  Input,
  Modal,
  StatusPill,
  TableToolbar,
  TextLink,
  Textarea,
  type DataColumn,
} from "../../components/ui";

type Props = {
  token: string | null;
  onError: (msg: string) => void;
  /** Drop outer card; parent owns page chrome. */
  embedded?: boolean;
  /** Increment to open the create plan modal. */
  createSignal?: number;
};

const mgrInput = "!min-h-10 h-10 box-border py-0 text-sm leading-10";

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

export function SuperAdminPlansSection({ token, onError, embedded = false, createSignal = 0 }: Props) {
  const { plans, loading, reload } = useBillingPlans({ activeOnly: false, token });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (createSignal > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- external CTA pulse
  }, [createSignal]);

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

  const formOpen = creating || editing != null;

  const columns: DataColumn<Plan>[] = [
    {
      key: "name",
      header: "Plan",
      render: (p) => (
        <div className="min-w-0">
          <p className="font-medium text-[var(--text-primary)]">{p.name}</p>
          <p className="type-caption text-[var(--text-muted)]">{p.id}</p>
        </div>
      ),
    },
    { key: "usd", header: "USD", numeric: true, render: (p) => `$${p.price}/mo` },
    {
      key: "rwf",
      header: "RWF",
      numeric: true,
      render: (p) => p.priceRWF.toLocaleString(),
    },
    {
      key: "limits",
      header: "Limits",
      render: (p) => `${p.maxUsers} users · ${p.maxFlocks} flocks`,
    },
    {
      key: "status",
      header: "Status",
      badge: true,
      render: (p) => (
        <StatusPill tone={p.isActive === false ? "neutral" : "success"}>
          {p.isActive === false ? "Inactive" : "Active"}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "tbl-actions",
      render: (p) => (
        <div className="flex flex-wrap gap-2">
          <TextLink disabled={busy} onClick={() => openEdit(p)}>
            Edit
          </TextLink>
          <TextLink className="text-[var(--status-danger)]" disabled={busy} onClick={() => void removePlan(p)}>
            Remove
          </TextLink>
        </div>
      ),
    },
  ];

  const table = (
    <div className="table-block">
      <DataTable<Plan>
        flush
        columns={columns}
        rows={plans}
        rowKey={(p) => p.id}
        emptyTitle={loading ? "Loading plans…" : "No billing plans"}
        emptyDescription="Create a plan for pricing and signup."
        emptyAction={
          <Button size="sm" onClick={openCreate}>
            New plan
          </Button>
        }
        toolbar={<TableToolbar meta={`${plans.length} plan${plans.length === 1 ? "" : "s"}`} />}
      />
    </div>
  );

  return (
    <>
      {!embedded ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Billing plans</h2>
            <Button size="sm" onClick={openCreate}>
              New plan
            </Button>
          </div>
          {table}
        </section>
      ) : (
        table
      )}

      <Modal
        open={formOpen}
        title={creating ? "New plan" : `Edit ${editing?.name ?? "plan"}`}
        onClose={closeForm}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={closeForm}>
              Cancel
            </Button>
            <Button size="sm" loading={busy} disabled={busy} onClick={() => void savePlan()}>
              Save plan
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {creating ? (
            <Field label="Plan id">
              <Input
                className={mgrInput}
                value={draft.id ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value.toLowerCase() }))}
                placeholder="e.g. enterprise"
              />
            </Field>
          ) : null}
          <Field label="Name">
            <Input
              className={mgrInput}
              value={draft.name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="USD / month" className="min-w-0">
              <Input
                type="number"
                min={0}
                className={`${mgrInput} w-full min-w-0`}
                value={draft.price ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
              />
            </Field>
            <Field label="RWF / month" className="min-w-0">
              <Input
                type="number"
                min={0}
                className={`${mgrInput} w-full min-w-0`}
                value={draft.priceRWF ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, priceRWF: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Max users" className="min-w-0">
              <Input
                type="number"
                min={1}
                className={`${mgrInput} w-full min-w-0`}
                value={draft.maxUsers ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, maxUsers: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Max flocks" className="min-w-0">
              <Input
                type="number"
                min={1}
                className={`${mgrInput} w-full min-w-0`}
                value={draft.maxFlocks ?? 1}
                onChange={(e) => setDraft((d) => ({ ...d, maxFlocks: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <Field label="Features" help="One per line">
            <Textarea
              value={draft.featuresText}
              onChange={(e) => setDraft((d) => ({ ...d, featuresText: e.target.value }))}
            />
          </Field>
          <Field label="Stripe price id" help="Optional">
            <Input
              className={mgrInput}
              value={draft.stripePriceId ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, stripePriceId: e.target.value }))}
              placeholder="price_…"
            />
          </Field>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Sort order">
              <Input
                type="number"
                className={`${mgrInput} w-24`}
                value={draft.sortOrder ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
              />
            </Field>
            <Checkbox
              className="pb-1"
              label="Active on pricing page"
              checked={draft.isActive !== false}
              onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
