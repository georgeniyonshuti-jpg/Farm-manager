/**
 * A partner's orders: a butcher's fresh chicken, or a BigChix kitchen's dishes.
 * One screen, phone first: new orders on top, one big button for the next step.
 * Checks every 30 seconds (every 15 for kitchens) and beeps when a new paid order arrives.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { useToast } from "../../components/Toast";
import { Button, NoticeStrip, SectionCard, StatusPill } from "../../components/ui";
import { formatRwf } from "../../lib/formatRwf";
import {
  ButcherNotLinkedError,
  butcherOrderStep,
  fetchButcherMoney,
  fetchButcherOrders,
  partnerDeclineOrder,
  type ButcherOrder,
  type OrderStep,
  type ShopOrderStatus,
} from "../../api/shop.api";

const NEXT: Partial<Record<ShopOrderStatus, { action: OrderStep; label: string }>> = {
  paid: { action: "accept", label: "Accept order" },
  accepted: { action: "ready", label: "Packed and ready" },
  ready: { action: "out", label: "On the way" },
  out_for_delivery: { action: "delivered", label: "Delivered" },
};

/** Kitchen steps: cook, then hand to the rider or the customer who collects. */
function nextStep(o: ButcherOrder, kitchen: boolean): { action: OrderStep; label: string } | undefined {
  if (!kitchen) return NEXT[o.status];
  const pickup = o.fulfilment === "pickup";
  switch (o.status) {
    case "paid":
      return { action: "accept", label: "Accept and start cooking" };
    case "accepted":
      return { action: "ready", label: "Food is ready" };
    case "ready":
      return pickup ? { action: "collected", label: "Customer collected it" } : { action: "out", label: "Rider has it" };
    case "out_for_delivery":
      return { action: "delivered", label: "Delivered" };
    default:
      return undefined;
  }
}

const LABEL: Partial<Record<ShopOrderStatus, string>> = {
  paid: "New",
  accepted: "Accepted",
  ready: "Ready",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  problem: "Problem reported",
  resolved: "Closed",
};

const TONE: Partial<Record<ShopOrderStatus, "success" | "warning" | "danger" | "info" | "neutral">> = {
  paid: "warning",
  accepted: "info",
  ready: "info",
  out_for_delivery: "info",
  delivered: "success",
  problem: "danger",
  resolved: "neutral",
};

function kigaliTime(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function sizeText(min: number | null, max: number | null): string {
  if (min != null && max != null) return ` (${Number(min)}–${Number(max)} kg)`;
  return "";
}

/** Short beep without an audio file. Browsers may stay silent until the page has been tapped once. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    /* no sound available */
  }
}

function whatsappHref(phone: string, ref: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("250") ? digits : digits.startsWith("0") ? `250${digits.slice(1)}` : `250${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(`Hello, this is your Cleva chicken order ${ref}.`)}`;
}

export function ButcherOrdersPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<ButcherOrder[]>([]);
  const [shopName, setShopName] = useState("");
  const [shopStatus, setShopStatus] = useState("");
  const [kind, setKind] = useState<"butcher" | "kitchen">("butcher");
  const kitchen = kind === "kitchen";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notLinked, setNotLinked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenNew = useRef<Set<string> | null>(null);
  const [money, setMoney] = useState<Awaited<ReturnType<typeof fetchButcherMoney>> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchButcherOrders(token);
      setOrders(r.orders);
      setShopName(r.shopName);
      setShopStatus(r.shopStatus);
      setKind(r.kind);
      setError("");
      setNotLinked(false);
      const newIds = new Set(r.orders.filter((o) => o.status === "paid").map((o) => o.id));
      if (seenNew.current && [...newIds].some((id) => !seenNew.current!.has(id))) beep();
      seenNew.current = newIds;
      fetchButcherMoney(token)
        .then(setMoney)
        .catch(() => {});
    } catch (e) {
      if (e instanceof ButcherNotLinkedError) setNotLinked(true);
      else setError(e instanceof Error ? e.message : "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    // Hot food cannot wait: kitchens check twice as often.
    const id = window.setInterval(() => void load(), kitchen ? 15000 : 30000);
    return () => window.clearInterval(id);
  }, [load, kitchen]);

  async function decline(order: ButcherOrder) {
    const reason = window.prompt("Why can't you take this order? (for example: out of a dish, too busy)") ?? "";
    if (!reason.trim()) return;
    setBusyId(order.id);
    try {
      await partnerDeclineOrder(token, order.id, reason.trim());
      showToast("success", "Order passed on");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not decline");
    } finally {
      setBusyId(null);
    }
  }

  async function next(order: ButcherOrder) {
    const step = nextStep(order, kitchen);
    if (!step) return;
    setBusyId(order.id);
    try {
      await butcherOrderStep(token, order.id, step.action);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  const title = shopName || (kitchen ? "Kitchen orders" : "My orders");

  if (loading) {
    return (
      <ManagerPage>
        <PageHeader title={title} />
        <SkeletonList rows={3} />
      </ManagerPage>
    );
  }
  if (notLinked) {
    return (
      <ManagerPage>
        <PageHeader title="My orders" />
        <NoticeStrip tone="warning">
          This login is not linked to a butcher shop or kitchen yet. Ask Cleva to add your email to it.
        </NoticeStrip>
      </ManagerPage>
    );
  }
  if (error && orders.length === 0) {
    return (
      <ManagerPage>
        <PageHeader title={title} />
        <ErrorState message={error} onRetry={() => void load()} />
      </ManagerPage>
    );
  }

  const open = orders.filter((o) => nextStep(o, kitchen));
  const recent = orders.filter((o) => !nextStep(o, kitchen));

  return (
    <ManagerPage>
      <PageHeader title={title} />
      <div className="space-y-4">
        {shopStatus !== "active" ? (
          <NoticeStrip tone="warning">
            {kitchen ? "Your kitchen" : "Your shop"} is not active, so you will not get new orders. Talk to Cleva.
          </NoticeStrip>
        ) : null}

        {open.length === 0 ? (
          <NoticeStrip tone="neutral">No open orders. This page checks for new ones every 30 seconds.</NoticeStrip>
        ) : null}

        {open.map((o) => {
          const step = nextStep(o, kitchen)!;
          const pickup = o.fulfilment === "pickup";
          return (
            <SectionCard
              key={o.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{o.ref}</span>
                  <StatusPill tone={TONE[o.status] ?? "neutral"}>
                    {kitchen && o.status === "accepted" ? "Cooking" : (LABEL[o.status] ?? o.status)}
                  </StatusPill>
                  {kitchen ? <StatusPill tone="neutral">{pickup ? "Pickup" : "Delivery"}</StatusPill> : null}
                  {o.acceptLate ? <StatusPill tone="danger">Waiting too long</StatusPill> : null}
                </span>
              }
            >
              <div className="space-y-3">
                <ul className="text-base font-semibold text-[var(--text-primary)]">
                  {o.lines.map((l) => (
                    <li key={l.name}>
                      {l.qty} × {l.name}
                      <span className="font-normal text-[var(--text-secondary)]">{sizeText(l.weightMinKg, l.weightMaxKg)}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-sm">
                  {pickup ? (
                    <p className="font-medium">{o.customerName} will collect it here.</p>
                  ) : (
                    <>
                      <p className="font-medium">
                        {o.customerName} · {o.sector}, {o.district}
                      </p>
                      {o.addressNote ? <p className="text-[var(--text-secondary)]">{o.addressNote}</p> : null}
                    </>
                  )}
                </div>
                {o.customerPhone ? (
                  <div className="flex flex-wrap gap-2">
                    <a className="inline-flex min-h-control-md items-center rounded-control border border-[var(--border-color)] px-3 text-sm font-medium" href={`tel:${o.customerPhone}`}>
                      Call {o.customerPhone}
                    </a>
                    <a
                      className="inline-flex min-h-control-md items-center rounded-control border border-[var(--border-color)] px-3 text-sm font-medium"
                      href={whatsappHref(o.customerPhone, o.ref)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                ) : null}
                {kitchen && !pickup ? (
                  <p className="text-sm">
                    {o.riderName ? (
                      <>
                        Rider: <strong>{o.riderName}</strong>
                        {o.riderPhone ? (
                          <>
                            {" · "}
                            <a className="underline" href={`tel:${o.riderPhone}`}>
                              {o.riderPhone}
                            </a>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[var(--text-secondary)]">Cleva is booking a rider.</span>
                    )}
                  </p>
                ) : null}
                <p className="text-sm text-[var(--text-secondary)]">
                  You receive {formatRwf(o.butcherPayoutRwf)}
                  {kitchen
                    ? ""
                    : o.deliveryPaidBy === "customer"
                      ? ` (includes ${formatRwf(o.deliveryFeeRwf)} delivery)`
                      : " · Cleva pays delivery"}
                  {o.paidConfirmedAt ? ` · Paid at ${kigaliTime(o.paidConfirmedAt)}` : ""}
                </p>
                <Button variant="primary" size="field" className="w-full" loading={busyId === o.id} onClick={() => void next(o)}>
                  {step.label}
                </Button>
                {kitchen && o.status === "paid" ? (
                  <Button variant="ghost" size="sm" className="w-full" disabled={busyId === o.id} onClick={() => void decline(o)}>
                    Can&apos;t take this order
                  </Button>
                ) : null}
              </div>
            </SectionCard>
          );
        })}

        {money ? (
          <SectionCard title="My money">
            <p className="text-base">
              Cleva owes you <strong>{formatRwf(money.owed.owedRwf)}</strong> for {money.owed.orders} delivered order
              {money.owed.orders === 1 ? "" : "s"}.
            </p>
            {money.payouts.length > 0 ? (
              <ul className="mt-3 divide-y divide-[var(--border-color)] text-sm">
                {money.payouts.map((p) => (
                  <li key={p.reference} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      Paid {kigaliTime(p.paidAt)} {new Date(p.paidAt).toLocaleDateString("en-GB", { timeZone: "Africa/Kigali" })} ·{" "}
                      {p.orders} order{p.orders === 1 ? "" : "s"}
                    </span>
                    <span>
                      {formatRwf(p.amountRwf)} <span className="font-mono text-xs text-[var(--text-secondary)]">{p.reference}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">No payouts yet.</p>
            )}
          </SectionCard>
        ) : null}

        {recent.length > 0 ? (
          <SectionCard title="Last 7 days">
            <ul className="divide-y divide-[var(--border-color)] text-sm">
              {recent.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono">{o.ref}</span> · {o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatRwf(o.butcherPayoutRwf)}
                    <StatusPill tone={TONE[o.status] ?? "neutral"}>{LABEL[o.status] ?? o.status}</StatusPill>
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>
    </ManagerPage>
  );
}
