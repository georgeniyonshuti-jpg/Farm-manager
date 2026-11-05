/**
 * BigChix riders on the desk: dish orders that need a rider, orders on the
 * road, the saved riders, and what each rider is owed. Staff book riders by
 * phone or WhatsApp, then record who and the agreed fare here.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
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
  SectionCard,
  Select,
  StatusPill,
  Textarea,
  type DataColumn,
} from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import {
  bookShopRider,
  fetchRiderBoard,
  payShopRider,
  saveShopRider,
  type RiderBoardOrder,
  type RiderOwed,
  type ShopRider,
} from "../../../api/shop.api";

function kigaliTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const STEP_LABEL: Record<string, string> = {
  paid: "Kitchen deciding",
  accepted: "Cooking",
  ready: "Ready to collect",
  out_for_delivery: "On the way",
};

function place(district: string | null, sector: string | null): string {
  return [sector, district].filter(Boolean).join(", ") || "—";
}

export function BigChixRidersPanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [board, setBoard] = useState<Awaited<ReturnType<typeof fetchRiderBoard>> | null>(null);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<RiderBoardOrder | null>(null);
  const [editing, setEditing] = useState<ShopRider | "new" | null>(null);
  const [paying, setPaying] = useState<RiderOwed | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await fetchRiderBoard(token));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load riders.");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  if (!board && !error) return <SkeletonList rows={4} />;
  if (!board) return <ErrorState message={error} onRetry={() => void load()} />;

  const activeRiders = board.riders.filter((r) => r.active);

  const orderColumns = (withRider: boolean): DataColumn<RiderBoardOrder>[] => [
    { key: "ref", header: "Order", render: (o) => <span className="font-mono text-xs">{o.ref}</span> },
    {
      key: "step",
      header: "Now",
      render: (o) => <StatusPill tone={o.status === "ready" ? "warning" : "info"}>{STEP_LABEL[o.status] ?? o.status}</StatusPill>,
    },
    {
      key: "from",
      header: "Collect from",
      render: (o) => (
        <span>
          <span className="font-medium">{o.kitchenName}</span>
          <span className="block text-xs text-[var(--text-muted)]">
            {place(o.kitchenDistrict, o.kitchenSector)}
            {o.kitchenAddress ? ` · ${o.kitchenAddress}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "to",
      header: "Deliver to",
      render: (o) => (
        <span>
          <span className="font-medium">{place(o.district, o.sector)}</span>
          <span className="block text-xs text-[var(--text-muted)]">{o.addressNote}</span>
        </span>
      ),
    },
    { key: "ready", header: "Ready by", render: (o) => (o.readyAt ? `Ready ${kigaliTime(o.readyAt)}` : kigaliTime(o.readyBy)) },
    withRider
      ? {
          key: "rider",
          header: "Rider",
          render: (o) => `${o.riderName ?? "—"}${o.fareRwf ? ` · ${formatRwf(o.fareRwf)}` : ""}`,
        }
      : { key: "fee", header: "Customer paid delivery", numeric: true, render: (o) => formatRwf(o.deliveryFeeRwf) },
  ];

  const riderColumns: DataColumn<ShopRider>[] = [
    { key: "name", header: "Rider", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "phone", header: "Phone", render: (r) => r.phone },
    { key: "plate", header: "Plate", render: (r) => r.plate || "—" },
    { key: "momo", header: "MoMo", render: (r) => `${r.momoPhone ?? "—"}${r.momoName ? ` · ${r.momoName}` : ""}` },
    {
      key: "active",
      header: "Status",
      render: (r) => <StatusPill tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Not riding"}</StatusPill>,
    },
  ];

  const owedColumns: DataColumn<RiderOwed>[] = [
    { key: "name", header: "Rider", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "trips", header: "Delivered trips", numeric: true, render: (r) => r.orders.length },
    { key: "total", header: "To pay", numeric: true, render: (r) => <strong>{formatRwf(r.totalRwf)}</strong> },
    { key: "momo", header: "MoMo", render: (r) => `${r.momoPhone ?? "No number"}${r.momoName ? ` · ${r.momoName}` : ""}` },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={`Needs a rider (${board.needsRider.length})`}
        flushBody
        controls={
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        <DataTable
          columns={orderColumns(false)}
          rows={board.needsRider}
          rowKey={(o) => o.id}
          onRowClick={(o) => setBooking(o)}
          emptyTitle="No dish orders waiting for a rider"
          emptyDescription="Delivered BigChix orders appear here once a kitchen has them. Tap one to book a rider."
          flush
        />
      </SectionCard>

      <SectionCard title={`With a rider (${board.withRider.length})`} flushBody>
        <DataTable
          columns={orderColumns(true)}
          rows={board.withRider}
          rowKey={(o) => o.id}
          onRowClick={(o) => (o.status === "out_for_delivery" ? undefined : setBooking(o))}
          emptyTitle="No riders on the road"
          flush
        />
      </SectionCard>

      <SectionCard title="Riders to pay" flushBody>
        <DataTable
          columns={owedColumns}
          rows={board.owed}
          rowKey={(r) => r.riderId}
          onRowClick={(r) => setPaying(r)}
          emptyTitle="Nothing owed to riders"
          emptyDescription="Fares appear here once the order is delivered."
          flush
        />
      </SectionCard>

      <SectionCard
        title="Saved riders"
        flushBody
        controls={
          <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
            Add rider
          </Button>
        }
      >
        <DataTable
          columns={riderColumns}
          rows={board.riders}
          rowKey={(r) => r.id}
          onRowClick={(r) => setEditing(r)}
          emptyTitle="No riders yet"
          emptyDescription="Add the riders you call for BigChix deliveries, with their MoMo number for fares."
          flush
        />
      </SectionCard>

      {booking ? (
        <BookRiderModal
          order={booking}
          riders={activeRiders}
          onClose={() => setBooking(null)}
          onSave={async (riderId, fareRwf) => {
            const r = await bookShopRider(token, booking.id, { riderId, fareRwf });
            showToast("success", `${r.riderName} booked for ${booking.ref}`);
            setBooking(null);
            await load();
          }}
        />
      ) : null}

      {editing ? (
        <RiderModal
          rider={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await saveShopRider(token, editing === "new" ? null : editing.id, body);
            showToast("success", "Rider saved");
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {paying ? (
        <PayRiderModal
          owed={paying}
          onClose={() => setPaying(null)}
          onSave={async (reference) => {
            await payShopRider(token, paying.riderId, {
              reference,
              orderIds: paying.orders.map((o) => o.orderId),
              expectedTotalRwf: paying.totalRwf,
            });
            showToast("success", `Recorded ${formatRwf(paying.totalRwf)} to ${paying.name}`);
            setPaying(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function useSave(save: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      await save();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Footer({ busy, onClose, onSave, label }: { busy: boolean; onClose: () => void; onSave: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave} loading={busy}>
        {label}
      </Button>
    </div>
  );
}

function BookRiderModal({
  order,
  riders,
  onClose,
  onSave,
}: {
  order: RiderBoardOrder;
  riders: ShopRider[];
  onClose: () => void;
  onSave: (riderId: string, fareRwf: number) => Promise<void>;
}) {
  const [riderId, setRiderId] = useState(order.riderId ?? "");
  const [fare, setFare] = useState(order.fareRwf ? String(order.fareRwf) : "");
  const { busy, error, run } = useSave(() => onSave(riderId, Number(fare)));
  const fareN = Number(fare);
  const margin = fare && Number.isFinite(fareN) ? order.deliveryFeeRwf - fareN : null;
  return (
    <Modal
      open
      title={`${order.riderId ? "Change rider" : "Book a rider"} · ${order.ref}`}
      onClose={onClose}
      footer={<Footer busy={busy} onClose={onClose} onSave={() => void run()} label={order.riderId ? "Save" : "Book rider"} />}
    >
      <div className="space-y-3 text-sm">
        <p>
          Collect from <strong>{order.kitchenName}</strong> ({place(order.kitchenDistrict, order.kitchenSector)}
          {order.kitchenAddress ? `, ${order.kitchenAddress}` : ""}){order.kitchenPhone ? ` · ${order.kitchenPhone}` : ""}.
        </p>
        <p>
          Deliver to <strong>{order.customerName}</strong>, {place(order.district, order.sector)}
          {order.addressNote ? ` · ${order.addressNote}` : ""}.
        </p>
        <p className="text-[var(--text-secondary)]">
          Ready by {kigaliTime(order.readyBy)}. The customer paid {formatRwf(order.deliveryFeeRwf)} for delivery.
        </p>
        {riders.length === 0 ? (
          <NoticeStrip tone="warning">Add a rider under Saved riders first.</NoticeStrip>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Rider">
              <Select value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                <option value="">Choose a rider</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.phone}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Agreed fare (RWF)"
              help={margin === null ? "What Cleva pays the rider for this trip." : margin >= 0 ? `Cleva keeps ${formatRwf(margin)} of the delivery fee.` : `Cleva pays ${formatRwf(-margin)} more than the customer paid.`}
            >
              <Input inputMode="numeric" value={fare} onChange={(e) => setFare(e.target.value)} />
            </Field>
          </div>
        )}
        {error ? <p className="text-sm text-[var(--status-danger)]">{error}</p> : null}
      </div>
    </Modal>
  );
}

function RiderModal({
  rider,
  onClose,
  onSave,
}: {
  rider: ShopRider | null;
  onClose: () => void;
  onSave: (body: Omit<ShopRider, "id">) => Promise<void>;
}) {
  const [f, setF] = useState({
    name: rider?.name ?? "",
    phone: rider?.phone ?? "",
    momoPhone: rider?.momoPhone ?? "",
    momoName: rider?.momoName ?? "",
    plate: rider?.plate ?? "",
    active: rider?.active ?? true,
    notes: rider?.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((prev) => ({ ...prev, [k]: v }));
  const { busy, error, run } = useSave(() => onSave({ ...f, momoPhone: f.momoPhone || null }));
  return (
    <Modal
      open
      title={rider ? `Edit ${rider.name}` : "Add rider"}
      onClose={onClose}
      footer={<Footer busy={busy} onClose={onClose} onSave={() => void run()} label="Save" />}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="MoMo number" help="Leave empty to use the phone.">
          <Input inputMode="tel" value={f.momoPhone} onChange={(e) => set("momoPhone", e.target.value)} />
        </Field>
        <Field label="MoMo account name">
          <Input value={f.momoName} onChange={(e) => set("momoName", e.target.value)} />
        </Field>
        <Field label="Moto plate">
          <Input value={f.plate} onChange={(e) => set("plate", e.target.value)} />
        </Field>
        <Checkbox label="Riding for BigChix" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
        <Field label="Notes" className="md:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--status-danger)]">{error}</p> : null}
    </Modal>
  );
}

function PayRiderModal({ owed, onClose, onSave }: { owed: RiderOwed; onClose: () => void; onSave: (reference: string) => Promise<void> }) {
  const [reference, setReference] = useState("");
  const { busy, error, run } = useSave(() => onSave(reference));
  return (
    <Modal
      open
      title={`Pay ${owed.name}`}
      onClose={onClose}
      footer={<Footer busy={busy} onClose={onClose} onSave={() => void run()} label="Record payout" />}
    >
      <div className="space-y-3 text-sm">
        <p>
          Send <strong>{formatRwf(owed.totalRwf)}</strong> by MoMo to {owed.momoPhone ?? "the rider"}
          {owed.momoName ? ` (${owed.momoName})` : ""} for {owed.orders.length} trip{owed.orders.length === 1 ? "" : "s"}:
        </p>
        <ul className="list-disc pl-5 text-[var(--text-secondary)]">
          {owed.orders.map((o) => (
            <li key={o.orderId}>
              <span className="font-mono">{o.ref}</span> · {formatRwf(o.fareRwf)}
            </li>
          ))}
        </ul>
        <Field label="MoMo transaction ID">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-[var(--status-danger)]">{error}</p> : null}
      </div>
    </Modal>
  );
}
