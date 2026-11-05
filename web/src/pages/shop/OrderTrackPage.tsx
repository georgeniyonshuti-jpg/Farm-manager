import { shopPath } from "../../lib/marketSections";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { formatRwf } from "../../lib/formatRwf";
import { fetchShopOrder, sendShopPayment, type PublicShopOrder, type ShopOrderStatus } from "../../api/shop.api";
import { shopT, STATUS_COPY } from "./shopCopy";
import { sizeLabel } from "./ShopSummary";

const FINAL: ShopOrderStatus[] = ["delivered", "resolved", "cancelled", "expired"];
const STEPS: ShopOrderStatus[] = ["placed", "payment_pending", "paid", "accepted", "ready", "out_for_delivery", "delivered"];

function kigaliTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

/** What a BigChix dish order is doing, in the customer's words. */
function dishStatusText(
  order: PublicShopOrder,
  pickup: boolean,
  t: (k: Parameters<typeof shopT>[1], v?: Record<string, string | number>) => string
): string {
  switch (order.status) {
    case "paid":
      return t("dishPaid");
    case "accepted":
      return order.readyBy ? t("dishCookingBy", { time: kigaliTime(order.readyBy) }) : t("dishCooking");
    case "ready":
      return pickup ? t("dishReadyPickup") : t("dishReadyRider");
    case "out_for_delivery":
      return order.rider ? t("dishOnTheWayRider", { name: order.rider.name }) : t("statusOut");
    case "delivered":
      return pickup ? t("dishCollected") : t("statusDelivered");
    default:
      return t(STATUS_COPY[order.status]);
  }
}

export function OrderTrackPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: Parameters<typeof shopT>[1], v?: Record<string, string | number>) => shopT(locale, k, v);
  const { ref = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  usePublicMeta(t("orderTitle", { ref }), t("lead"));
  const [order, setOrder] = useState<PublicShopOrder | null>(null);
  const [error, setError] = useState("");
  const [txn, setTxn] = useState("");
  const [payer, setPayer] = useState("");
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetchShopOrder(ref, token);
      setOrder(r.order);
      setError("");
    } catch {
      setError(t("notFound"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Check again every 20 seconds until the order is finished.
  useEffect(() => {
    if (!order || FINAL.includes(order.status)) return;
    const id = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(id);
  }, [order, load]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPayError("");
    try {
      await sendShopPayment(ref, token, { momoTxnId: txn, payerPhone: payer || undefined });
      await load();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not send this.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) {
    return (
      <div className="store-wrap store-body">
        <p className="text-sm text-[var(--store-danger)]" role="alert">
          {error}
        </p>
        <Link className="store-btn store-btn-ember mt-4 inline-flex" to={shopPath()}>
          {t("newOrder")}
        </Link>
      </div>
    );
  }
  if (!order) return <div className="store-wrap store-body">…</div>;

  const dishOrder = order.channel === "kitchen";
  const pickup = order.fulfilment === "pickup";
  // Pickup orders have no "on the way" step.
  const steps = pickup ? STEPS.filter((s) => s !== "out_for_delivery") : STEPS;
  const stepIndex = steps.indexOf(order.status);
  const statusText = dishOrder ? dishStatusText(order, pickup, t) : t(STATUS_COPY[order.status]);

  return (
    <div className="store-wrap store-body">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6">
          <p className="store-kicker">{t("orderTitle", { ref: order.ref })}</p>
          <p className="mt-2 text-lg font-semibold text-[var(--store-ink)]">
            {order.firstName ? `${t("hello", { name: order.firstName })} ` : ""}
            {statusText}
          </p>
          {stepIndex >= 0 ? (
            <ol className="mt-4 flex gap-1" aria-hidden="true">
              {steps.map((s, i) => (
                <li
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-[var(--store-ember)]" : "bg-[var(--store-line)]"}`}
                />
              ))}
            </ol>
          ) : null}
          <p className="mt-3 text-xs text-[var(--store-muted)]">{t("keepLink")}</p>
        </div>

        {order.status === "placed" ? (
          <form
            className="store-form space-y-3 rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6"
            onSubmit={(e) => void pay(e)}
          >
            <p className="store-request-title">{t("payTitle")}</p>
            {order.payToPhone ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--store-ink)]">
                <li>{t("payStep1", { amount: formatRwf(order.totalRwf), phone: order.payToPhone })}</li>
                <li>{t("payStep2", { ref: order.ref })}</li>
                <li>{t("payStep3")}</li>
              </ol>
            ) : (
              <p className="text-sm text-[var(--store-danger)]">{t("payNoNumber")}</p>
            )}
            {order.payBy ? <p className="text-sm text-[var(--store-muted)]">{t("payBy", { time: kigaliTime(order.payBy) })}</p> : null}
            <label className="store-field">
              <span>
                {t("txnId")} <em className="store-required">*</em>
              </span>
              <input value={txn} onChange={(e) => setTxn(e.target.value)} required autoComplete="off" />
            </label>
            <label className="store-field">
              <span>{t("payerPhone")}</span>
              <input type="tel" inputMode="tel" value={payer} onChange={(e) => setPayer(e.target.value)} />
            </label>
            {payError ? (
              <p className="text-sm text-[var(--store-danger)]" role="alert">
                {payError}
              </p>
            ) : null}
            <button type="submit" className="store-btn store-btn-ember w-full" disabled={busy || !order.payToPhone}>
              {busy ? t("sending") : t("sentPayment")}
            </button>
          </form>
        ) : null}

        {pickup && order.pickup ? (
          <div className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6">
            <p className="store-request-title">{t("pickupFrom")}</p>
            <p className="font-semibold text-[var(--store-ink)]">{order.kitchenName}</p>
            <p className="text-sm text-[var(--store-muted)]">
              {[order.pickup.address, order.pickup.sector, order.pickup.district].filter(Boolean).join(", ")}
            </p>
            {order.pickup.directions ? <p className="mt-1 text-sm text-[var(--store-muted)]">{order.pickup.directions}</p> : null}
            <p className="mt-2 text-sm">{t("showCode", { ref: order.ref })}</p>
          </div>
        ) : null}

        <div className="rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6">
          <p className="store-request-title">{t("yourOrder")}</p>
          {pickup ? null : (
            <p className="text-sm text-[var(--store-muted)]">
              {order.sector} ({order.district})
            </p>
          )}
          <dl className="mt-3 space-y-1 text-sm">
            {order.lines.map((l) => (
              <div key={l.name} className="flex justify-between gap-3">
                <dt className="text-[var(--store-muted)]">
                  {l.qty} × {l.name}
                  {sizeLabel(l.weightMinKg, l.weightMaxKg, locale) ? ` · ${sizeLabel(l.weightMinKg, l.weightMaxKg, locale)}` : ""}
                </dt>
                <dd>{formatRwf(l.lineTotalRwf)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-[var(--store-line)] pt-2">
              <dt>{pickup ? t("pickup") : t("delivery")}</dt>
              <dd>{pickup ? "—" : order.deliveryFeeRwf ? formatRwf(order.deliveryFeeRwf) : t("free")}</dd>
            </div>
            <div className="flex justify-between gap-3 text-base font-semibold text-[var(--store-ink)]">
              <dt>{t("total")}</dt>
              <dd>{formatRwf(order.totalRwf)}</dd>
            </div>
          </dl>
        </div>

        {FINAL.includes(order.status) ? (
          <Link className="store-btn store-btn-ghost inline-flex" to={shopPath()}>
            {t("newOrder")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
