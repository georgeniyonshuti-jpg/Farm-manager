/**
 * Butcher shop desk: orders, products, delivery zones, partner butchers,
 * and shop settings. Only a superuser changes settings or opens the shop.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { PageHeader } from "../../../components/PageHeader";
import { ManagerPage } from "../../../components/layout/ManagerPage";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { useToast } from "../../../components/Toast";
import {
  Button,
  Checkbox,
  DataTable,
  Field,
  Input,
  Modal,
  NoticeStrip,
  PageTabs,
  SectionCard,
  Select,
  StatusPill,
  Textarea,
  type DataColumn,
} from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import { RWANDA_DISTRICTS, sectorsInDistrict } from "../../../lib/rwandaLocations";
import {
  fetchShopSetup,
  saveShopButcher,
  saveShopProduct,
  saveShopSettings,
  saveShopZone,
  type ButcherStatus,
  type ShopButcher,
  type ShopProduct,
  type ShopSettings,
  type ShopSetup,
  type ShopZone,
} from "../../../api/shop.api";
import { ShopOrdersPanel } from "./ShopOrdersPanel";

type Tab = "orders" | "products" | "zones" | "butchers" | "settings";

const BUTCHER_TONE: Record<ButcherStatus, "success" | "warning" | "neutral" | "danger"> = {
  active: "success",
  pending: "warning",
  paused: "neutral",
  ended: "danger",
};

function weightLabel(p: Pick<ShopProduct, "weightMinKg" | "weightMaxKg">): string {
  if (p.weightMinKg != null && p.weightMaxKg != null) return `${p.weightMinKg}–${p.weightMaxKg} kg`;
  if (p.weightMinKg != null) return `from ${p.weightMinKg} kg`;
  if (p.weightMaxKg != null) return `up to ${p.weightMaxKg} kg`;
  return "—";
}

function numOrNull(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function ShopSetupPage() {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("orders");
  const [toConfirm, setToConfirm] = useState(0);
  const onCounts = useCallback((c: { toConfirm: number }) => setToConfirm(c.toConfirm), []);
  const [setup, setSetup] = useState<ShopSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingProduct, setEditingProduct] = useState<ShopProduct | "new" | null>(null);
  const [editingZone, setEditingZone] = useState<ShopZone | "new" | null>(null);
  const [editingButcher, setEditingButcher] = useState<ShopButcher | "new" | null>(null);
  const isSuperuser = user?.role === "superuser";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSetup(await fetchShopSetup(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the shop setup.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const zoneNames = useMemo(() => new Map((setup?.zones ?? []).map((z) => [z.id, z.name])), [setup]);

  if (loading && !setup) {
    return (
      <ManagerPage>
        <PageHeader title="Shop" />
        <SkeletonList rows={6} />
      </ManagerPage>
    );
  }
  if (error || !setup) {
    return (
      <ManagerPage>
        <PageHeader title="Shop" />
        <ErrorState message={error || "Could not load the shop setup."} onRetry={() => void load()} />
      </ManagerPage>
    );
  }

  const productColumns: DataColumn<ShopProduct>[] = [
    { key: "name", header: "Item", render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "sku", header: "Code", render: (p) => <span className="font-mono text-xs">{p.sku}</span> },
    { key: "weight", header: "Size", render: weightLabel },
    { key: "price", header: "Price", numeric: true, render: (p) => formatRwf(p.priceRwf) },
    {
      key: "active",
      header: "On sale",
      render: (p) => <StatusPill tone={p.active ? "success" : "neutral"}>{p.active ? "On sale" : "Hidden"}</StatusPill>,
    },
  ];

  const zoneColumns: DataColumn<ShopZone>[] = [
    { key: "name", header: "Zone", render: (z) => <span className="font-medium">{z.name}</span> },
    { key: "district", header: "District", render: (z) => z.district },
    { key: "sectors", header: "Sectors", render: (z) => z.sectors.join(", ") },
    { key: "fee", header: "Delivery fee", numeric: true, render: (z) => formatRwf(z.deliveryFeeRwf) },
    {
      key: "free",
      header: "Free delivery from",
      numeric: true,
      render: (z) => (z.freeDeliveryOverRwf == null ? "Never" : formatRwf(z.freeDeliveryOverRwf)),
    },
    {
      key: "butchers",
      header: "Active butchers",
      numeric: true,
      render: (z) =>
        setup.butchers.filter((b) => b.status === "active" && b.zones.some((l) => l.zoneId === z.id)).length,
    },
    {
      key: "active",
      header: "Status",
      render: (z) => <StatusPill tone={z.active ? "success" : "neutral"}>{z.active ? "Open" : "Closed"}</StatusPill>,
    },
  ];

  const butcherColumns: DataColumn<ShopButcher>[] = [
    { key: "name", header: "Butcher", render: (b) => <span className="font-medium">{b.shopName}</span> },
    { key: "owner", header: "Owner", render: (b) => b.ownerName || "—" },
    { key: "phone", header: "Phone", render: (b) => b.phone },
    { key: "place", header: "Place", render: (b) => [b.sector, b.district].filter(Boolean).join(", ") || "—" },
    {
      key: "zones",
      header: "Zones",
      render: (b) =>
        b.zones.length
          ? [...b.zones]
              .sort((x, y) => x.priority - y.priority)
              .map((l) => zoneNames.get(l.zoneId) ?? "Removed zone")
              .join(", ")
          : "None",
    },
    { key: "status", header: "Status", render: (b) => <StatusPill tone={BUTCHER_TONE[b.status]}>{b.status}</StatusPill> },
  ];

  const add =
    tab === "products" ? (
      <Button variant="primary" size="sm" onClick={() => setEditingProduct("new")}>
        Add item
      </Button>
    ) : tab === "zones" ? (
      <Button variant="primary" size="sm" onClick={() => setEditingZone("new")}>
        Add zone
      </Button>
    ) : tab === "butchers" ? (
      <Button variant="primary" size="sm" onClick={() => setEditingButcher("new")}>
        Add butcher
      </Button>
    ) : null;

  return (
    <ManagerPage>
      <PageHeader
        title="Shop"
        action={add}
        tabs={
          <PageTabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            aria-label="Shop setup sections"
            options={[
              { value: "orders", label: "Orders", badge: toConfirm || undefined },
              { value: "products", label: "Items", badge: setup.products.length },
              { value: "zones", label: "Zones", badge: setup.zones.length },
              { value: "butchers", label: "Butchers", badge: setup.butchers.length },
              { value: "settings", label: "Settings" },
            ]}
          />
        }
      />

      <div className="space-y-4">
        <NoticeStrip tone={setup.settings?.isOpen ? "info" : "warning"}>
          {setup.settings?.isOpen
            ? "The shop is open. Customers can see these items and prices."
            : setup.openBlockers.length
              ? `The shop is closed. ${setup.openBlockers.join(" ")}`
              : "The shop is closed. A superuser can open it under Settings."}
        </NoticeStrip>

        {tab === "orders" ? <ShopOrdersPanel onCounts={onCounts} /> : null}

        {tab === "products" ? (
          <SectionCard flushBody>
            <DataTable
              columns={productColumns}
              rows={setup.products}
              rowKey={(p) => p.id}
              onRowClick={(p) => setEditingProduct(p)}
              emptyTitle="No items yet"
              emptyDescription="Add the sizes you sell, for example small, medium and large whole chicken."
              flush
            />
          </SectionCard>
        ) : null}

        {tab === "zones" ? (
          <SectionCard flushBody>
            <DataTable
              columns={zoneColumns}
              rows={setup.zones}
              rowKey={(z) => z.id}
              onRowClick={(z) => setEditingZone(z)}
              emptyTitle="No zones yet"
              emptyDescription="A zone is a group of sectors with one delivery fee."
              flush
            />
          </SectionCard>
        ) : null}

        {tab === "butchers" ? (
          <SectionCard flushBody>
            <DataTable
              columns={butcherColumns}
              rows={setup.butchers}
              rowKey={(b) => b.id}
              onRowClick={(b) => setEditingButcher(b)}
              emptyTitle="No butchers yet"
              emptyDescription="Add a partner butcher, then link the zones they deliver to."
              flush
            />
          </SectionCard>
        ) : null}

        {tab === "settings" && setup.settings ? (
          <SettingsForm
            initial={setup.settings}
            canEdit={isSuperuser}
            onSave={async (body) => {
              try {
                await saveShopSettings(token, body);
                showToast("success", body.isOpen ? "Settings saved. The shop is open." : "Settings saved");
                await load();
              } catch (e) {
                showToast("error", e instanceof Error ? e.message : "Could not save");
              }
            }}
          />
        ) : null}
      </div>

      {editingProduct ? (
        <ProductModal
          product={editingProduct === "new" ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={async (body) => {
            await saveShopProduct(token, editingProduct === "new" ? null : editingProduct.id, body);
            showToast("success", "Item saved");
            setEditingProduct(null);
            await load();
          }}
        />
      ) : null}

      {editingZone ? (
        <ZoneModal
          zone={editingZone === "new" ? null : editingZone}
          onClose={() => setEditingZone(null)}
          onSave={async (body) => {
            await saveShopZone(token, editingZone === "new" ? null : editingZone.id, body);
            showToast("success", "Zone saved");
            setEditingZone(null);
            await load();
          }}
        />
      ) : null}

      {editingButcher ? (
        <ButcherModal
          butcher={editingButcher === "new" ? null : editingButcher}
          zones={setup.zones}
          onClose={() => setEditingButcher(null)}
          onSave={async (body) => {
            await saveShopButcher(token, editingButcher === "new" ? null : editingButcher.id, body);
            showToast("success", "Butcher saved");
            setEditingButcher(null);
            await load();
          }}
        />
      ) : null}
    </ManagerPage>
  );
}

function useSaving(onSave: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function ModalFooter({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" size="md" onClick={onSave} loading={busy}>
        Save
      </Button>
    </div>
  );
}

function ProductModal({
  product,
  onClose,
  onSave,
}: {
  product: ShopProduct | null;
  onClose: () => void;
  onSave: (body: Omit<ShopProduct, "id">) => Promise<void>;
}) {
  const [f, setF] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    nameRw: product?.nameRw ?? "",
    description: product?.description ?? "",
    descriptionRw: product?.descriptionRw ?? "",
    weightMinKg: product?.weightMinKg?.toString() ?? "",
    weightMaxKg: product?.weightMaxKg?.toString() ?? "",
    priceRwf: product?.priceRwf?.toString() ?? "",
    sortOrder: product?.sortOrder?.toString() ?? "0",
    active: product?.active ?? true,
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((prev) => ({ ...prev, [k]: v }));
  const { busy, error, run } = useSaving(() =>
    onSave({
      sku: f.sku,
      name: f.name,
      nameRw: f.nameRw,
      description: f.description,
      descriptionRw: f.descriptionRw,
      weightMinKg: numOrNull(f.weightMinKg),
      weightMaxKg: numOrNull(f.weightMaxKg),
      priceRwf: Number(f.priceRwf),
      photoUrl: product?.photoUrl ?? null,
      active: f.active,
      sortOrder: Number(f.sortOrder) || 0,
    })
  );
  return (
    <Modal
      open
      title={product ? `Edit ${product.name}` : "Add item"}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={() => void run()} />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name (English)">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Medium whole chicken" />
        </Field>
        <Field label="Name (Kinyarwanda)">
          <Input value={f.nameRw} onChange={(e) => set("nameRw", e.target.value)} />
        </Field>
        <Field label="Code" help="Short and unique, for example CK-M.">
          <Input value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Price (RWF)" help="Every butcher sells at this price.">
          <Input inputMode="numeric" value={f.priceRwf} onChange={(e) => set("priceRwf", e.target.value)} />
        </Field>
        <Field label="Smallest weight (kg)">
          <Input inputMode="decimal" value={f.weightMinKg} onChange={(e) => set("weightMinKg", e.target.value)} />
        </Field>
        <Field label="Largest weight (kg)">
          <Input inputMode="decimal" value={f.weightMaxKg} onChange={(e) => set("weightMaxKg", e.target.value)} />
        </Field>
        <Field label="Description (English)" className="md:col-span-2">
          <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Description (Kinyarwanda)" className="md:col-span-2">
          <Textarea value={f.descriptionRw} onChange={(e) => set("descriptionRw", e.target.value)} />
        </Field>
        <Field label="Order in the list" help="Lower numbers show first.">
          <Input inputMode="numeric" value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <Checkbox label="On sale" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
      </div>
      {product ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">A price change applies to new orders only.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[var(--status-danger)]">{error}</p> : null}
    </Modal>
  );
}

function ZoneModal({
  zone,
  onClose,
  onSave,
}: {
  zone: ShopZone | null;
  onClose: () => void;
  onSave: (body: Omit<ShopZone, "id">) => Promise<void>;
}) {
  const [name, setName] = useState(zone?.name ?? "");
  const [district, setDistrict] = useState(zone?.district ?? "");
  const [sectors, setSectors] = useState<string[]>(zone?.sectors ?? []);
  const [fee, setFee] = useState(zone?.deliveryFeeRwf?.toString() ?? "");
  const [freeOver, setFreeOver] = useState(zone?.freeDeliveryOverRwf?.toString() ?? "");
  const [active, setActive] = useState(zone?.active ?? true);
  const options = district ? sectorsInDistrict(district) : [];
  const { busy, error, run } = useSaving(() =>
    onSave({
      name,
      district,
      sectors,
      deliveryFeeRwf: Number(fee) || 0,
      freeDeliveryOverRwf: numOrNull(freeOver),
      active,
    })
  );
  return (
    <Modal
      open
      wide
      title={zone ? `Edit ${zone.name}` : "Add zone"}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={() => void run()} />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Zone name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kicukiro centre" />
        </Field>
        <Field label="District">
          <Select
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setSectors([]);
            }}
          >
            <option value="">Choose a district</option>
            {RWANDA_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Delivery fee (RWF)" help="What the customer pays below the free-delivery amount.">
          <Input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Free delivery from (RWF)" help="Leave blank for no free delivery. Cleva pays the delivery above this.">
          <Input inputMode="numeric" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />
        </Field>
      </div>
      {district ? (
        <fieldset className="mt-4">
          <legend className="type-label mb-2">Sectors in this zone</legend>
          <div className="grid grid-cols-2 gap-x-4 md:grid-cols-3">
            {options.map((s) => (
              <Checkbox
                key={s}
                label={s}
                checked={sectors.includes(s)}
                onChange={(e) => setSectors((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      <Checkbox label="Zone is open for orders" checked={active} onChange={(e) => setActive(e.target.checked)} />
      {error ? <p className="mt-3 text-sm text-[var(--status-danger)]">{error}</p> : null}
    </Modal>
  );
}

function ButcherModal({
  butcher,
  zones,
  onClose,
  onSave,
}: {
  butcher: ShopButcher | null;
  zones: ShopZone[];
  onClose: () => void;
  onSave: (body: Omit<ShopButcher, "id" | "userId">) => Promise<void>;
}) {
  const [f, setF] = useState({
    shopName: butcher?.shopName ?? "",
    ownerName: butcher?.ownerName ?? "",
    phone: butcher?.phone ?? "",
    whatsapp: butcher?.whatsapp ?? "",
    district: butcher?.district ?? "",
    sector: butcher?.sector ?? "",
    addressNote: butcher?.addressNote ?? "",
    licenceRef: butcher?.licenceRef ?? "",
    momoPayoutPhone: butcher?.momoPayoutPhone ?? "",
    momoPayoutName: butcher?.momoPayoutName ?? "",
    status: (butcher?.status ?? "pending") as ButcherStatus,
    notes: butcher?.notes ?? "",
  });
  const [links, setLinks] = useState<Record<string, string>>(
    Object.fromEntries((butcher?.zones ?? []).map((l) => [l.zoneId, String(l.priority)]))
  );
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const { busy, error, run } = useSaving(() =>
    onSave({
      ...f,
      whatsapp: f.whatsapp || null,
      district: f.district || null,
      sector: f.sector || null,
      momoPayoutPhone: f.momoPayoutPhone || null,
      zones: Object.entries(links).map(([zoneId, priority]) => ({ zoneId, priority: Number(priority) || 100 })),
    })
  );
  return (
    <Modal
      open
      wide
      title={butcher ? `Edit ${butcher.shopName}` : "Add butcher"}
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSave={() => void run()} />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Shop name">
          <Input value={f.shopName} onChange={(e) => set("shopName", e.target.value)} />
        </Field>
        <Field label="Owner name">
          <Input value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <Input inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
        <Field label="District">
          <Select
            value={f.district}
            onChange={(e) => setF((prev) => ({ ...prev, district: e.target.value, sector: "" }))}
          >
            <option value="">Choose a district</option>
            {RWANDA_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sector">
          <Select value={f.sector} onChange={(e) => set("sector", e.target.value)} disabled={!f.district}>
            <option value="">Choose a sector</option>
            {(f.district ? sectorsInDistrict(f.district) : []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where to find the shop" className="md:col-span-2">
          <Input value={f.addressNote} onChange={(e) => set("addressNote", e.target.value)} />
        </Field>
        <Field label="Trading or hygiene licence number">
          <Input value={f.licenceRef} onChange={(e) => set("licenceRef", e.target.value)} />
        </Field>
        <Field label="Status" help="Active needs the licence number and MoMo payout details.">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </Select>
        </Field>
        <Field label="MoMo payout number">
          <Input inputMode="tel" value={f.momoPayoutPhone} onChange={(e) => set("momoPayoutPhone", e.target.value)} />
        </Field>
        <Field label="MoMo account name">
          <Input value={f.momoPayoutName} onChange={(e) => set("momoPayoutName", e.target.value)} />
        </Field>
        <Field label="Notes" className="md:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>

      <fieldset className="mt-4">
        <legend className="type-label mb-2">Zones this butcher delivers to</legend>
        {zones.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Add a zone first.</p>
        ) : (
          <div className="space-y-2">
            {zones.map((z) => {
              const on = z.id in links;
              return (
                <div key={z.id} className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    label={`${z.name} (${z.district})`}
                    checked={on}
                    onChange={(e) =>
                      setLinks((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) next[z.id] = "100";
                        else delete next[z.id];
                        return next;
                      })
                    }
                  />
                  {on ? (
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      Priority
                      <Input
                        className="w-20"
                        inputMode="numeric"
                        value={links[z.id]}
                        onChange={(e) => setLinks((prev) => ({ ...prev, [z.id]: e.target.value }))}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
            <p className="text-xs text-[var(--text-muted)]">Lower priority is asked first when a zone has several butchers.</p>
          </div>
        )}
      </fieldset>
      {error ? <p className="mt-3 text-sm text-[var(--status-danger)]">{error}</p> : null}
    </Modal>
  );
}

function SettingsForm({
  initial,
  canEdit,
  onSave,
}: {
  initial: ShopSettings;
  canEdit: boolean;
  onSave: (body: ShopSettings) => Promise<void>;
}) {
  const [f, setF] = useState(() => ({
    commissionPct: String(initial.commissionPct),
    minOrderRwf: String(initial.minOrderRwf),
    minOrderItems: String(initial.minOrderItems),
    payWithinMinutes: String(initial.payWithinMinutes),
    acceptWithinMinutes: String(initial.acceptWithinMinutes),
    openTime: initial.openTime,
    closeTime: initial.closeTime,
    closedMessage: initial.closedMessage,
    isOpen: initial.isOpen,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        commissionPct: Number(f.commissionPct),
        minOrderRwf: Number(f.minOrderRwf),
        minOrderItems: Number(f.minOrderItems),
        payWithinMinutes: Number(f.payWithinMinutes),
        acceptWithinMinutes: Number(f.acceptWithinMinutes),
        openTime: f.openTime,
        closeTime: f.closeTime,
        closedMessage: f.closedMessage,
        isOpen: f.isOpen,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Shop settings">
      {!canEdit ? (
        <p className="mb-3 text-sm text-[var(--text-secondary)]">Only a superuser can change these settings.</p>
      ) : null}
      <fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-2">
        <Field label="Cleva commission (%)" help="Taken on the chicken only, never on delivery.">
          <Input inputMode="decimal" value={f.commissionPct} onChange={(e) => set("commissionPct", e.target.value)} />
        </Field>
        <div />
        <Field label="Minimum order (RWF)" help="0 turns this rule off.">
          <Input inputMode="numeric" value={f.minOrderRwf} onChange={(e) => set("minOrderRwf", e.target.value)} />
        </Field>
        <Field label="Minimum items" help="An order needs either minimum. 0 turns this rule off.">
          <Input inputMode="numeric" value={f.minOrderItems} onChange={(e) => set("minOrderItems", e.target.value)} />
        </Field>
        <Field label="Customer must pay within (minutes)">
          <Input inputMode="numeric" value={f.payWithinMinutes} onChange={(e) => set("payWithinMinutes", e.target.value)} />
        </Field>
        <Field label="Butcher must accept within (minutes)">
          <Input
            inputMode="numeric"
            value={f.acceptWithinMinutes}
            onChange={(e) => set("acceptWithinMinutes", e.target.value)}
          />
        </Field>
        <Field label="Orders open at">
          <Input type="time" value={f.openTime} onChange={(e) => set("openTime", e.target.value)} />
        </Field>
        <Field label="Orders close at">
          <Input type="time" value={f.closeTime} onChange={(e) => set("closeTime", e.target.value)} />
        </Field>
        <Field label="Message when the shop is closed" className="md:col-span-2">
          <Input value={f.closedMessage} onChange={(e) => set("closedMessage", e.target.value)} />
        </Field>
        <Checkbox label="Shop is open for orders" checked={f.isOpen} onChange={(e) => set("isOpen", e.target.checked)} />
      </fieldset>
      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="md" onClick={() => void save()} loading={busy}>
            Save settings
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}
