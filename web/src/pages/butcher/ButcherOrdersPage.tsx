/**
 * A partner butcher's orders. One screen, phone first: new orders on top,
 * one big button for the next step. Checks every 30 seconds and beeps when
 * a new paid order arrives.
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
  fetchButcherOrders,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notLinked, setNotLinked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenNew = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchButcherOrders(token);
      setOrders(r.orders);
      setShopName(r.shopName);
      setShopStatus(r.shopStatus);
      setError("");
      setNotLinked(false);
      const newIds = new Set(r.orders.filter((o) => o.status === "paid").map((o) => o.id));
      if (seenNew.current && [...newIds].some((id) => !seenNew.current!.has(id))) beep();
      seenNew.current = newIds;
    } catch (e) {
      if (e instanceof ButcherNotLinkedError) setNotLinked(true);
      else setError(e instanceof Error ? e.message : "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  async function next(order: ButcherOrder) {
    const step = NEXT[order.status];
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

  const title = shopName || "My orders";

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
          This login is not linked to a butcher shop yet. Ask Cleva to add your email to your shop.
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

  const open = orders.filter((o) => NEXT[o.status]);
  const recent = orders.filter((o) => !NEXT[o.status]);

  return (
    <ManagerPage>
      <PageHeader title={title} />
      <div className="space-y-4">
        {shopStatus !== "active" ? (
          <NoticeStrip tone="warning">Your shop is not active, so you will not get new orders. Talk to Cleva.</NoticeStrip>
        ) : null}

        {open.length === 0 ? (
          <NoticeStrip tone="neutral">No open orders. This page checks for new ones every 30 seconds.</NoticeStrip>
        ) : null}

        {open.map((o) => {
          const step = NEXT[o.status]!;
          return (
            <SectionCard
              key={o.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{o.ref}</span>
                  <StatusPill tone={TONE[o.status] ?? "neutral"}>{LABEL[o.status] ?? o.status}</StatusPill>
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
                  <p className="font-medium">
                    {o.customerName} · {o.sector}, {o.district}
                  </p>
                  {o.addressNote ? <p className="text-[var(--text-secondary)]">{o.addressNote}</p> : null}
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
                <p className="text-sm text-[var(--text-secondary)]">
                  You receive {formatRwf(o.butcherPayoutRwf)}
                  {o.deliveryPaidBy === "customer" ? ` (includes ${formatRwf(o.deliveryFeeRwf)} delivery)` : " · Cleva pays delivery"}
                  {o.paidConfirmedAt ? ` · Paid at ${kigaliTime(o.paidConfirmedAt)}` : ""}
                </p>
                <Button variant="primary" size="field" className="w-full" loading={busyId === o.id} onClick={() => void next(o)}>
                  {step.label}
                </Button>
              </div>
            </SectionCard>
          );
        })}

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
