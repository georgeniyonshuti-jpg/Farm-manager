/**
 * Desk view of shop orders. Ops checks MoMo, then confirms or rejects the
 * payment. A confirmed order goes to the zone's first active butcher.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import {
  Button,
  DataTable,
  Field,
  Input,
  Modal,
  SectionCard,
  SegmentedControl,
  Select,
  StatusPill,
  type DataColumn,
} from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import {
  deskOrderAction,
  deskOrderStep,
  deskReassignOrder,
  fetchDeskOrders,
  setShopDeliveryCost,
  type DeskOrderView,
  type DeskShopOrder,
  type OrderStep,
  type ShopButcher,
  type ShopOrderStatus,
} from "../../../api/shop.api";

const STATUS_LABEL: Record<ShopOrderStatus, string> = {
  placed: "Waiting for payment",
  payment_pending: "Payment to check",
  paid: "Paid",
  accepted: "Butcher accepted",
  ready: "Ready",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  problem: "Problem",
  resolved: "Resolved",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_TONE: Record<ShopOrderStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  placed: "neutral",
  payment_pending: "warning",
  paid: "info",
  accepted: "info",
  ready: "info",
  out_for_delivery: "info",
  delivered: "success",
  problem: "danger",
  resolved: "success",
  cancelled: "neutral",
  expired: "neutral",
};

const CANCELLABLE: ShopOrderStatus[] = ["placed", "payment_pending", "paid", "accepted", "ready", "out_for_delivery"];
const REASSIGNABLE: ShopOrderStatus[] = ["paid", "accepted", "ready"];

/** The next butcher step, for orders ops handles by phone. */
const NEXT_STEP: Partial<Record<ShopOrderStatus, { action: OrderStep; label: string }>> = {
  paid: { action: "accept", label: "Mark accepted" },
  accepted: { action: "ready", label: "Mark ready" },
  ready: { action: "out", label: "Mark on the way" },
  out_for_delivery: { action: "delivered", label: "Mark delivered" },
};

function kigaliTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type ReasonAction = { order: DeskShopOrder; action: "reject-payment" | "cancel" };

export function ShopOrdersPanel({
  onCounts,
  butchers = [],
}: {
  onCounts?: (counts: { toConfirm: number; open: number }) => void;
  butchers?: ShopButcher[];
}) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<DeskOrderView>("to_confirm");
  const [orders, setOrders] = useState<DeskShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<DeskShopOrder | null>(null);
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchDeskOrders(token, view);
      setOrders(r.orders);
      onCounts?.(r.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [token, view, onCounts]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  async function act(order: DeskShopOrder, action: "confirm-payment" | "reject-payment" | "cancel", why?: string) {
    setBusy(true);
    try {
      const r = await deskOrderAction(token, order.id, action, why ? { reason: why } : {});
      if (action === "confirm-payment") {
        showToast(r.butcherId ? "success" : "info", r.butcherId ? `${order.ref} paid and sent to a butcher` : `${order.ref} paid. No active butcher in this zone yet.`);
      } else if (action === "reject-payment") {
        showToast("info", `${order.ref} is back to waiting for payment`);
      } else {
        showToast("info", r.refundPending ? `${order.ref} cancelled. Send the refund by MoMo.` : `${order.ref} cancelled`);
      }
      setOpen(null);
      setReasonFor(null);
      setReason("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not do that");
    } finally {
      setBusy(false);
    }
  }

  async function step(order: DeskShopOrder, action: OrderStep) {
    setBusy(true);
    try {
      await deskOrderStep(token, order.id, action);
      showToast("success", `${order.ref} updated`);
      setOpen(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function saveDeliveryCost(order: DeskShopOrder) {
    const amount = Number(deliveryCost);
    if (!Number.isInteger(amount) || amount < 0) {
      showToast("error", "Enter the delivery cost in whole RWF");
      return;
    }
    setBusy(true);
    try {
      await setShopDeliveryCost(token, order.id, amount);
      showToast("success", `Delivery cost for ${order.ref} saved`);
      setDeliveryCost("");
      setOpen(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function reassign(order: DeskShopOrder) {
    if (!moveTo) return;
    setBusy(true);
    try {
      const r = await deskReassignOrder(token, order.id, moveTo);
      showToast("success", `${order.ref} moved to ${r.butcherName}. They need to accept it.`);
      setOpen(null);
      setMoveTo("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not move the order");
    } finally {
      setBusy(false);
    }
  }

  const columns: DataColumn<DeskShopOrder>[] = [
    { key: "ref", header: "Order", render: (o) => <span className="font-mono text-xs font-semibold">{o.ref}</span> },
    { key: "when", header: "Placed", render: (o) => kigaliTime(o.placedAt) },
    { key: "customer", header: "Customer", render: (o) => `${o.customerName} · ${o.customerPhone}` },
    { key: "place", header: "Sector", render: (o) => o.sector },
    { key: "items", header: "Items", render: (o) => o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ") },
    { key: "total", header: "Total", numeric: true, render: (o) => formatRwf(o.totalRwf) },
    { key: "txn", header: "MoMo ID", render: (o) => (o.momoTxnId ? <span className="font-mono text-xs">{o.momoTxnId}</span> : "—") },
    { key: "butcher", header: "Butcher", render: (o) => o.butcherName ?? (o.status === "paid" ? "None yet" : "—") },
    { key: "status", header: "Status", render: (o) => <StatusPill tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</StatusPill> },
  ];

  return (
    <SectionCard
      flushBody
      controls={
        <SegmentedControl
          label="Orders to show"
          value={view}
          onChange={(v) => setView(v as DeskOrderView)}
          options={[
            { value: "to_confirm", label: "Payments to check" },
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
          ]}
        />
      }
    >
      {loading && orders.length === 0 ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(o) => o.id}
          onRowClick={(o) => setOpen(o)}
          emptyTitle={view === "to_confirm" ? "No payments to check" : "No orders"}
          flush
        />
      )}

      {open ? (
        <Modal
          open
          wide
          title={`Order ${open.ref}`}
          onClose={() => {
            setOpen(null);
            setMoveTo("");
          }}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              {open.butcherId && NEXT_STEP[open.status] ? (
                <Button variant="secondary" size="md" disabled={busy} onClick={() => void step(open, NEXT_STEP[open.status]!.action)}>
                  {NEXT_STEP[open.status]!.label}
                </Button>
              ) : null}
              {CANCELLABLE.includes(open.status) ? (
                <Button variant="dangerGhost" size="md" disabled={busy} onClick={() => setReasonFor({ order: open, action: "cancel" })}>
                  Cancel order
                </Button>
              ) : null}
              {open.status === "payment_pending" ? (
                <>
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={busy}
                    onClick={() => setReasonFor({ order: open, action: "reject-payment" })}
                  >
                    Payment not found
                  </Button>
                  <Button variant="primary" size="md" loading={busy} onClick={() => void act(open, "confirm-payment")}>
                    Payment received
                  </Button>
                </>
              ) : null}
            </div>
          }
        >
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <div>
              <dt className="type-label">Status</dt>
              <dd>
                <StatusPill tone={STATUS_TONE[open.status]}>{STATUS_LABEL[open.status]}</StatusPill>
              </dd>
            </div>
            <div>
              <dt className="type-label">Placed</dt>
              <dd>{kigaliTime(open.placedAt)}</dd>
            </div>
            <div>
              <dt className="type-label">Customer</dt>
              <dd>
                {open.customerName} · {open.customerPhone}
              </dd>
            </div>
            <div>
              <dt className="type-label">Deliver to</dt>
              <dd>
                {open.sector}, {open.district} ({open.zoneName ?? "no zone"})
                <br />
                {open.addressNote}
              </dd>
            </div>
            <div>
              <dt className="type-label">Items</dt>
              <dd>{open.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</dd>
            </div>
            <div>
              <dt className="type-label">Butcher</dt>
              <dd>{open.butcherName ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="type-label">Customer pays</dt>
              <dd>
                {formatRwf(open.subtotalRwf)} + {formatRwf(open.deliveryFeeRwf)} delivery = <strong>{formatRwf(open.totalRwf)}</strong>
              </dd>
            </div>
            <div>
              <dt className="type-label">Split</dt>
              <dd>
                Cleva {formatRwf(open.commissionRwf)} · Butcher {formatRwf(open.butcherPayoutRwf)}
                {open.deliveryPaidBy === "cleva" ? " · Cleva pays delivery" : ""}
              </dd>
            </div>
            <div>
              <dt className="type-label">MoMo transaction ID</dt>
              <dd className="font-mono">{open.momoTxnId ?? "—"}</dd>
            </div>
            <div>
              <dt className="type-label">Paid from</dt>
              <dd>{open.payerPhone ?? open.customerPhone}</dd>
            </div>
          </dl>
          {open.deliveryPaidBy === "cleva" ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field
                label="Delivery cost Cleva pays (RWF)"
                help={
                  open.clevaDeliveryCostRwf != null
                    ? `Recorded: ${formatRwf(open.clevaDeliveryCostRwf)}. Paid to the butcher with their payout.`
                    : "Not recorded. The zone's delivery fee is used until you enter the real cost."
                }
                className="min-w-[16rem] flex-1"
              >
                <Input inputMode="numeric" value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} />
              </Field>
              <Button variant="secondary" size="md" disabled={!deliveryCost.trim() || busy} onClick={() => void saveDeliveryCost(open)}>
                Save cost
              </Button>
            </div>
          ) : null}
          {REASSIGNABLE.includes(open.status) ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label={open.butcherId ? "Move to another butcher" : "Give to a butcher"} className="min-w-[16rem] flex-1">
                <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose a butcher</option>
                  {butchers
                    .filter((b) => b.id !== open.butcherId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shopName}
                      </option>
                    ))}
                </Select>
              </Field>
              <Button variant="secondary" size="md" disabled={!moveTo || busy} onClick={() => void reassign(open)}>
                Move
              </Button>
            </div>
          ) : null}
          {open.status === "payment_pending" ? (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              Find {formatRwf(open.totalRwf)} with ID {open.momoTxnId} in the Cleva MoMo account before you confirm.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {reasonFor ? (
        <Modal
          open
          title={reasonFor.action === "cancel" ? `Cancel ${reasonFor.order.ref}` : `Payment not found for ${reasonFor.order.ref}`}
          onClose={() => setReasonFor(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setReasonFor(null)} disabled={busy}>
                Back
              </Button>
              <Button
                variant={reasonFor.action === "cancel" ? "danger" : "primary"}
                size="md"
                loading={busy}
                disabled={!reason.trim()}
                onClick={() => void act(reasonFor.order, reasonFor.action, reason.trim())}
              >
                {reasonFor.action === "cancel" ? "Cancel order" : "Send back to customer"}
              </Button>
            </div>
          }
        >
          <Field
            label="Reason"
            help={
              reasonFor.action === "cancel"
                ? reasonFor.order.paymentStatus === "paid"
                  ? "This order is paid. A refund will be listed for you to send by MoMo."
                  : "The customer sees that the order was cancelled."
                : "The customer gets a fresh pay window to pay or correct the ID."
            }
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </Modal>
      ) : null}
    </SectionCard>
  );
}
