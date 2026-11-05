/**
 * BigChix desk: the switch that puts dishes on sale, and a real test order
 * staff can place before that, to run an order end to end with real money.
 * Both are for superusers.
 */

import { useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { Button, Field, Input, Modal, NoticeStrip, SectionCard, Select, Textarea } from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import { RWANDA_DISTRICTS, sectorsInDistrict } from "../../../lib/rwandaLocations";
import { placeTestOrder, setDishesOnSale, type ShopKitchen, type ShopProduct } from "../../../api/shop.api";

export function BigChixLaunchCard({
  onSale,
  dishes,
  kitchens,
  onChanged,
}: {
  onSale: boolean;
  dishes: ShopProduct[];
  kitchens: ShopKitchen[];
  onChanged: () => Promise<void>;
}) {
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const superuser = user?.role === "superuser";
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function toggle() {
    const next = !onSale;
    if (next && !window.confirm("Put BigChix dishes on sale on bigchix.cleva.rw? Customers can order and pay straight away.")) return;
    setBusy(true);
    try {
      await setDishesOnSale(token, next);
      showToast("success", next ? "Dishes are on sale" : "Dishes are off sale");
      await onChanged();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not change it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Selling dishes">
      <div className="space-y-3">
        <NoticeStrip tone={onSale ? "info" : "neutral"}>
          {onSale
            ? "Dishes are on sale. Customers see them where a kitchen is open and delivers, and can order and pay."
            : "Dishes are not on sale. Customers see the BigChix fresh chicken shop; dishes show only in preview."}
        </NoticeStrip>
        {superuser ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTesting(true)} disabled={dishes.length === 0}>
              Place a test order
            </Button>
            <Button variant={onSale ? "ghost" : "primary"} size="sm" loading={busy} onClick={() => void toggle()}>
              {onSale ? "Take dishes off sale" : "Put dishes on sale"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">A superuser can place test orders and put dishes on sale.</p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          Before selling, place a test order and take it all the way: pay by MoMo, confirm the payment, the kitchen accepts and
          cooks, book a rider, deliver, then check the kitchen and rider payouts.
        </p>
      </div>
      {testing ? <TestOrderModal dishes={dishes} kitchens={kitchens} onClose={() => setTesting(false)} /> : null}
    </SectionCard>
  );
}

function TestOrderModal({ dishes, kitchens, onClose }: { dishes: ShopProduct[]; kitchens: ShopKitchen[]; onClose: () => void }) {
  const { token } = useAuth();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [pickupKitchenId, setPickupKitchenId] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const pickupKitchens = kitchens.filter((k) => k.pickupEnabled);
  const items = dishes
    .map((d) => ({ sku: d.sku, qty: Number(qty[d.id] || 0) }))
    .filter((i) => Number.isInteger(i.qty) && i.qty > 0);

  async function place() {
    setBusy(true);
    setError("");
    try {
      const r = await placeTestOrder(token, {
        customerName: name,
        phone,
        district,
        sector,
        addressNote: address,
        items,
        fulfilment,
        ...(fulfilment === "pickup" ? { pickupKitchenId } : {}),
      });
      setLink(r.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the test order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Test order"
      onClose={onClose}
      footer={
        link ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} disabled={items.length === 0} onClick={() => void place()}>
              Place test order
            </Button>
          </div>
        )
      }
    >
      {link ? (
        <div className="space-y-3 text-sm">
          <NoticeStrip tone="info">Test order placed. Open its page to pay by MoMo, then follow it through.</NoticeStrip>
          <p className="break-all font-mono text-xs">{link}</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-control-md items-center rounded-control border border-[var(--border-color)] px-3 font-medium" href={link} target="_blank" rel="noreferrer">
              Open the order page
            </a>
            <Button variant="secondary" size="md" onClick={() => void navigator.clipboard?.writeText(link)}>
              Copy link
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            A real order, paid by MoMo, that goes to a real kitchen. It works before dishes are on sale, but still needs a kitchen
            that is active, open now and taking orders.
          </p>
          <fieldset>
            <legend className="type-label mb-2">Dishes</legend>
            <div className="space-y-2">
              {dishes.map((d) => (
                <label key={d.id} className="flex items-center gap-3 text-sm">
                  <Input
                    className="w-20"
                    inputMode="numeric"
                    aria-label={`How many ${d.name}`}
                    value={qty[d.id] ?? ""}
                    onChange={(e) => setQty((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  />
                  {d.name} · {formatRwf(d.priceRwf)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Delivery or pickup">
              <Select value={fulfilment} onChange={(e) => setFulfilment(e.target.value as "delivery" | "pickup")}>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </Select>
            </Field>
            {fulfilment === "pickup" ? (
              <Field label="Collect from">
                <Select value={pickupKitchenId} onChange={(e) => setPickupKitchenId(e.target.value)}>
                  <option value="">Choose a kitchen</option>
                  {pickupKitchens.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.shopName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <Field label="District">
                  <Select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setSector("");
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
                <Field label="Sector">
                  <Select value={sector} onChange={(e) => setSector(e.target.value)} disabled={!district}>
                    <option value="">Choose a sector</option>
                    {(district ? sectorsInDistrict(district) : []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            {fulfilment === "delivery" ? (
              <Field label="Delivery directions" className="md:col-span-2">
                <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            ) : null}
          </div>
          {error ? <p className="text-sm text-[var(--status-danger)]">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
