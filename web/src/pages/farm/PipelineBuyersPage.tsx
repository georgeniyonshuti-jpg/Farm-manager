import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FieldNavHeader } from "../../components/layout/FieldPageHeader";
import { Button, Field, Modal } from "../../components/ui";
import { DistrictSelect } from "../../components/DistrictSelect";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk, isPipelineSalesRole } from "../../auth/permissions";
import { useToast } from "../../components/Toast";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import {
  createPipelineBuyer,
  fetchPipelineBuyers,
  updatePipelineBuyer,
  type PipelineBuyer,
} from "../../api/pipeline.api";

const BUYER_TYPES = ["butcher", "restaurant", "hotel", "vendor", "institution", "other"] as const;

const emptyForm = {
  name: "",
  buyerType: "butcher",
  district: "",
  whatsapp: "",
  phone: "",
  weeklyBirdsMin: "",
  weeklyBirdsMax: "",
  weightKgMin: "",
  weightKgMax: "",
  prefersSlaughtered: true,
  collectOrDelivery: "either",
  noticeDays: "2",
  notes: "",
};

export function PipelineBuyersPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const allowed = canAccessPipelineDesk(user);
  const salesShell = isPipelineSalesRole(user);

  const [buyers, setBuyers] = useState<PipelineBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PipelineBuyer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token || !allowed) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPipelineBuyers(token, false);
      setBuyers(r.buyers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load buyers.");
    } finally {
      setLoading(false);
    }
  }, [token, allowed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(b: PipelineBuyer) {
    setEditing(b);
    setForm({
      name: b.name,
      buyerType: b.buyerType || "other",
      district: b.district ?? "",
      whatsapp: b.whatsapp ?? "",
      phone: b.phone ?? "",
      weeklyBirdsMin: b.weeklyBirdsMin != null ? String(b.weeklyBirdsMin) : "",
      weeklyBirdsMax: b.weeklyBirdsMax != null ? String(b.weeklyBirdsMax) : "",
      weightKgMin: b.weightKgMin != null ? String(b.weightKgMin) : "",
      weightKgMax: b.weightKgMax != null ? String(b.weightKgMax) : "",
      prefersSlaughtered: b.prefersSlaughtered,
      collectOrDelivery: b.collectOrDelivery || "either",
      noticeDays: String(b.noticeDays ?? 2),
      notes: b.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!token || !form.name.trim()) return;
    setBusy(true);
    const body = {
      name: form.name.trim(),
      buyerType: form.buyerType,
      district: form.district || null,
      whatsapp: form.whatsapp || null,
      phone: form.phone || null,
      weeklyBirdsMin: form.weeklyBirdsMin ? Number(form.weeklyBirdsMin) : null,
      weeklyBirdsMax: form.weeklyBirdsMax ? Number(form.weeklyBirdsMax) : null,
      weightKgMin: form.weightKgMin ? Number(form.weightKgMin) : null,
      weightKgMax: form.weightKgMax ? Number(form.weightKgMax) : null,
      prefersSlaughtered: form.prefersSlaughtered,
      collectOrDelivery: form.collectOrDelivery,
      noticeDays: form.noticeDays ? Number(form.noticeDays) : 2,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await updatePipelineBuyer(token, editing.id, body);
        showToast("success", "Buyer updated");
      } else {
        await createPipelineBuyer(token, body);
        showToast("success", "Buyer created");
      }
      setOpen(false);
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(b: PipelineBuyer) {
    if (!token) return;
    try {
      await updatePipelineBuyer(token, b.id, { active: !b.active });
      await reload();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Update failed");
    }
  }

  const shell = (children: ReactNode) => (
    <div className="mx-auto w-full max-w-lg space-y-4 pb-6">{children}</div>
  );

  if (!allowed) {
    return shell(
      <>
        <FieldNavHeader title="Buyers" variant="hub" showAccount={!salesShell} />
        <p className="text-sm text-[var(--text-muted)]">Sales coordinator or superuser access required.</p>
      </>
    );
  }

  return shell(
    <>
      <FieldNavHeader
        title="Buyers"
        variant="hub"
        showAccount={!salesShell}
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            Add
          </Button>
        }
      />

      <p className="text-sm text-[var(--text-secondary)]">
        Butcheries and restaurants can also self-serve as verified buyers. CRM rows without login stay optional.
      </p>

      <Button type="button" className="min-h-12 w-full" onClick={openCreate}>
        Add buyer
      </Button>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : buyers.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No buyers yet. Add the first butcher or restaurant.
        </p>
      ) : (
        <div className="space-y-3">
          {buyers.map((b) => (
            <article
              key={b.id}
              className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">{b.name}</h2>
                  <p className="mt-0.5 text-xs capitalize text-[var(--text-muted)]">
                    {b.buyerType}
                    {!b.active ? " · inactive" : ""}
                    {b.district ? ` · ${b.district}` : ""}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {(b.weeklyBirdsMin != null || b.weeklyBirdsMax != null) && (
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">Weekly birds</dt>
                    <dd className="font-medium">
                      {b.weeklyBirdsMin ?? "?"}–{b.weeklyBirdsMax ?? "?"}
                    </dd>
                  </div>
                )}
                {(b.weightKgMin != null || b.weightKgMax != null) && (
                  <div>
                    <dt className="text-[11px] text-[var(--text-muted)]">Weight</dt>
                    <dd className="font-medium">
                      {b.weightKgMin ?? "?"}–{b.weightKgMax ?? "?"} kg
                    </dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-[11px] text-[var(--text-muted)]">Contact</dt>
                  <dd className="font-medium">{b.whatsapp || b.phone || "—"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {[
                  b.prefersSlaughtered ? "Prefers slaughtered" : "Live ok",
                  b.collectOrDelivery,
                  b.noticeDays != null ? `${b.noticeDays}d notice` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  className="min-h-12 flex-1"
                  variant="secondary"
                  onClick={() => openEdit(b)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  className="min-h-12 flex-1"
                  variant="ghost"
                  onClick={() => void toggleActive(b)}
                >
                  {b.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit buyer" : "Add buyer"}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !form.name.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <input
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Type">
            <select
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={form.buyerType}
              onChange={(e) => setForm((f) => ({ ...f, buyerType: e.target.value }))}
            >
              {BUYER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <DistrictSelect value={form.district} onChange={(district) => setForm((f) => ({ ...f, district }))} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="WhatsApp">
              <input
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <input
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Weekly birds min">
              <input
                type="number"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.weeklyBirdsMin}
                onChange={(e) => setForm((f) => ({ ...f, weeklyBirdsMin: e.target.value }))}
              />
            </Field>
            <Field label="Weekly birds max">
              <input
                type="number"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.weeklyBirdsMax}
                onChange={(e) => setForm((f) => ({ ...f, weeklyBirdsMax: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Weight min kg">
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.weightKgMin}
                onChange={(e) => setForm((f) => ({ ...f, weightKgMin: e.target.value }))}
              />
            </Field>
            <Field label="Weight max kg">
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
                value={form.weightKgMax}
                onChange={(e) => setForm((f) => ({ ...f, weightKgMax: e.target.value }))}
              />
            </Field>
          </div>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.prefersSlaughtered}
              onChange={(e) => setForm((f) => ({ ...f, prefersSlaughtered: e.target.checked }))}
            />
            Prefers slaughtered
          </label>
          <Field label="Collect or delivery">
            <select
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={form.collectOrDelivery}
              onChange={(e) => setForm((f) => ({ ...f, collectOrDelivery: e.target.value }))}
            >
              <option value="collect">Collect</option>
              <option value="delivery">Delivery</option>
              <option value="either">Either</option>
            </select>
          </Field>
          <Field label="Notice days">
            <input
              type="number"
              min={0}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={form.noticeDays}
              onChange={(e) => setForm((f) => ({ ...f, noticeDays: e.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <textarea
              rows={2}
              className="w-full rounded-lg border border-[var(--border-color)] bg-transparent px-3 py-3 text-base"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
