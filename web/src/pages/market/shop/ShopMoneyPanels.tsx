/**
 * Desk money views for the butcher shop: today's numbers, butcher payouts,
 * and refunds to send. Payouts and refunds are sent by MoMo outside the app;
 * here staff record them with the MoMo transaction ID.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { Button, DataTable, Field, Input, Modal, SectionCard, StatCard, StatusPill, type DataColumn } from "../../../components/ui";
import { formatRwf } from "../../../lib/formatRwf";
import {
  fetchShopPayouts,
  fetchShopRefunds,
  fetchShopTotals,
  markShopRefundSent,
  payShopButcher,
  type PayoutButcher,
  type ShopDayTotals,
  type ShopNow,
  type ShopRefund,
} from "../../../api/shop.api";

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );
}

function kigaliDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function ShopTodayPanel() {
  const { token } = useAuth();
  const [days, setDays] = useState<ShopDayTotals[]>([]);
  const [now, setNow] = useState<ShopNow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetchShopTotals(token, 7);
      setDays(r.days);
      setNow(r.now);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load totals.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const today = days[0];
  const columns: DataColumn<ShopDayTotals>[] = [
    { key: "day", header: "Day", render: (d) => dayLabel(d.day) },
    { key: "placed", header: "Placed", numeric: true, render: (d) => d.placed },
    { key: "paid", header: "Paid", numeric: true, render: (d) => d.paid },
    { key: "paidRwf", header: "Money in", numeric: true, render: (d) => formatRwf(d.paidRwf) },
    { key: "commission", header: "Commission", numeric: true, render: (d) => formatRwf(d.commissionRwf) },
    { key: "delivery", header: "Delivery Cleva paid", numeric: true, render: (d) => formatRwf(d.clevaDeliveryRwf) },
    { key: "net", header: "Cleva keeps", numeric: true, render: (d) => formatRwf(d.clevaNetRwf) },
    { key: "delivered", header: "Delivered", numeric: true, render: (d) => d.delivered },
  ];

  return (
    <div className="space-y-4">
      {now ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Payments to check" value={now.paymentsToCheck} />
          <StatCard label="Waiting for butcher" value={now.waitingForButcher} />
          <StatCard label="Being prepared or on the way" value={now.inProgress} />
          <StatCard label="Problems" value={now.problems} />
          <StatCard label="Refunds to send" value={now.refundsToSend} />
        </div>
      ) : null}
      {today ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Paid orders today" value={today.paid} />
          <StatCard label="Money in today" value={formatRwf(today.paidRwf)} />
          <StatCard label="Commission today" value={formatRwf(today.commissionRwf)} />
          <StatCard label="Cleva keeps today" value={formatRwf(today.clevaNetRwf)} />
        </div>
      ) : null}
      <SectionCard title="Last 7 days" flushBody>
        <DataTable columns={columns} rows={days} rowKey={(d) => d.day} flush />
      </SectionCard>
      <p className="text-xs text-[var(--text-muted)]">
        Kigali days. Paid orders count on the day the payment was confirmed. Cleva keeps = commission minus delivery Cleva paid on
        free-delivery orders.
      </p>
    </div>
  );
}

export function ShopPayoutsPanel() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [butchers, setButchers] = useState<PayoutButcher[]>([]);
  const [refunds, setRefunds] = useState<ShopRefund[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<PayoutButcher | null>(null);
  const [refunding, setRefunding] = useState<ShopRefund | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetchShopPayouts(token), fetchShopRefunds(token)]);
      setButchers(p.butchers);
      setRefunds(r.refunds);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payouts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function close() {
    setPaying(null);
    setRefunding(null);
    setReference("");
  }

  async function recordPayout(b: PayoutButcher) {
    setBusy(true);
    try {
      await payShopButcher(token, b.butcherId, {
        reference,
        orderIds: b.orders.map((o) => o.orderId),
        expectedTotalRwf: b.totalRwf,
      });
      showToast("success", `Recorded ${formatRwf(b.totalRwf)} to ${b.shopName}`);
      close();
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not record the payout");
    } finally {
      setBusy(false);
    }
  }

  async function recordRefund(r: ShopRefund) {
    setBusy(true);
    try {
      await markShopRefundSent(token, r.id, reference);
      showToast("success", `Refund for ${r.ref} recorded`);
      close();
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not record the refund");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonList rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const payoutColumns: DataColumn<PayoutButcher>[] = [
    { key: "shop", header: "Butcher", render: (b) => <span className="font-medium">{b.shopName}</span> },
    { key: "orders", header: "Delivered orders", numeric: true, render: (b) => b.orders.length },
    { key: "total", header: "To pay", numeric: true, render: (b) => <strong>{formatRwf(b.totalRwf)}</strong> },
    {
      key: "momo",
      header: "MoMo",
      render: (b) => (b.payoutPhone ? `${b.payoutPhone}${b.payoutName ? ` · ${b.payoutName}` : ""}` : "No payout number"),
    },
    {
      key: "held",
      header: "On hold",
      render: (b) => (b.heldOrders ? <StatusPill tone="warning">{b.heldOrders} with a problem</StatusPill> : "—"),
    },
  ];

  const refundColumns: DataColumn<ShopRefund>[] = [
    { key: "ref", header: "Order", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "who", header: "Customer", render: (r) => `${r.customerName}${r.phone ? ` · ${r.phone}` : ""}` },
    { key: "amount", header: "Amount", numeric: true, render: (r) => formatRwf(r.amountRwf) },
    { key: "why", header: "Reason", render: (r) => r.note ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.status === "pending" ? (
          <StatusPill tone="warning">To send</StatusPill>
        ) : (
          <StatusPill tone="success">Sent {r.reference}</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="Butchers to pay" flushBody>
        <DataTable
          columns={payoutColumns}
          rows={butchers}
          rowKey={(b) => b.butcherId}
          onRowClick={(b) => setPaying(b)}
          emptyTitle="Nobody to pay"
          emptyDescription="Delivered orders appear here until their payout is recorded."
          flush
        />
      </SectionCard>

      <SectionCard title="Refunds" flushBody>
        <DataTable
          columns={refundColumns}
          rows={refunds}
          rowKey={(r) => r.id}
          onRowClick={(r) => (r.status === "pending" ? setRefunding(r) : undefined)}
          emptyTitle="No refunds"
          emptyDescription="Cancelling a paid order adds a refund here."
          flush
        />
      </SectionCard>

      {paying ? (
        <Modal
          open
          wide
          title={`Pay ${paying.shopName}`}
          onClose={close}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={close} disabled={busy}>
                Back
              </Button>
              <Button variant="primary" size="md" loading={busy} disabled={!reference.trim()} onClick={() => void recordPayout(paying)}>
                Record {formatRwf(paying.totalRwf)} paid
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            Send <strong>{formatRwf(paying.totalRwf)}</strong> by MoMo to{" "}
            <strong>{paying.payoutPhone ?? "— no payout number on file —"}</strong>
            {paying.payoutName ? ` (${paying.payoutName})` : ""}, then enter the transaction ID.
          </p>
          <ul className="mt-3 divide-y divide-[var(--border-color)] text-sm">
            {paying.orders.map((o) => (
              <li key={o.orderId} className="flex justify-between gap-3 py-1.5">
                <span>
                  <span className="font-mono">{o.ref}</span> · delivered {kigaliDate(o.deliveredAt)}
                </span>
                <span>
                  {formatRwf(o.payoutRwf)}
                  {o.clevaDeliveryRwf ? ` + ${formatRwf(o.clevaDeliveryRwf)} delivery` : ""}
                </span>
              </li>
            ))}
          </ul>
          {paying.heldOrders ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {paying.heldOrders} order(s) with an open problem are not included until the problem is resolved.
            </p>
          ) : null}
          <Field label="MoMo transaction ID" className="mt-4">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
          </Field>
        </Modal>
      ) : null}

      {refunding ? (
        <Modal
          open
          title={`Refund ${refunding.ref}`}
          onClose={close}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={close} disabled={busy}>
                Back
              </Button>
              <Button variant="primary" size="md" loading={busy} disabled={!reference.trim()} onClick={() => void recordRefund(refunding)}>
                Record refund sent
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            Send <strong>{formatRwf(refunding.amountRwf)}</strong> by MoMo to <strong>{refunding.phone ?? "the customer"}</strong>,
            then enter the transaction ID.
          </p>
          <Field label="MoMo transaction ID" className="mt-4">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
