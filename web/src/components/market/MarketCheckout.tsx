import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { bookMarketLot, markBuyerPaymentSent } from "../../api/pipeline.api";
import type { PublicLot } from "../../api/publicMarket.api";
import { formatRwf } from "../../lib/marketQuote";
import {
  buyerBirdsFloor,
  defaultHandover,
  defaultProcess,
  deliveryOptionEnabled,
  resolveDeliveryActor,
  type MarketHandover,
  type MarketProcess,
} from "../../lib/marketLogisticsDefaults";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { BuyerMoneySplitView, type BuyerMoneySplit } from "./MoneySplit";

export function MarketCheckout({
  locale,
  lot,
  onDone,
}: {
  locale: StoreLocale;
  lot: PublicLot;
  onDone?: () => void;
}) {
  const { token } = useAuth();
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const floor = buyerBirdsFloor(lot.minOrderBirds);
  const [birds, setBirds] = useState(Math.min(Math.max(floor, 50), lot.birdsAvailable || 50));
  const [process, setProcess] = useState<MarketProcess>(() =>
    defaultProcess({ slaughterAvailable: lot.slaughterAvailable })
  );
  const [handover, setHandover] = useState<MarketHandover>(() =>
    defaultHandover({ process: "live", deliveryAvailable: lot.deliveryAvailable })
  );
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{
    matchId: string;
    status: string;
    amountRwf: number | null;
    reference: string | null;
    payToPhone: string | null;
    split: BuyerMoneySplit | null;
  } | null>(null);

  const preview = lot.moneySplit || null;
  const canDeliver = deliveryOptionEnabled({ deliveryAvailable: lot.deliveryAvailable });

  useEffect(() => {
    setHandover((prev) => {
      const next = defaultHandover({ process, deliveryAvailable: lot.deliveryAvailable });
      if (process === "live" && prev === "delivery" && canDeliver) return prev;
      return next;
    });
  }, [process, lot.deliveryAvailable, canDeliver]);

  async function startOrder() {
    setBusy(true);
    setError(null);
    try {
      const deliveryActor = resolveDeliveryActor({ collectOrDelivery: handover });
      const res = await bookMarketLot(token, {
        publicRef: lot.publicRef,
        birds,
        collectOrDelivery: handover,
        slaughterMode: process === "slaughter" ? "farm" : "none",
        deliveryActor,
      });
      const pay = res.payment;
      setPayment({
        matchId: res.match.id,
        status: pay?.status || res.match.buyerPaymentStatus || "unpaid",
        amountRwf: pay?.amountRwf ?? null,
        reference: pay?.reference || null,
        payToPhone: pay?.payToPhone || null,
        split: (pay?.split as BuyerMoneySplit | undefined) || preview,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reserve");
    } finally {
      setBusy(false);
    }
  }

  async function sent() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      const res = await markBuyerPaymentSent(token, payment.matchId, { payerPhone: phone });
      setPayment((prev) =>
        prev ? { ...prev, status: res.status || "pending", payToPhone: res.payToPhone || prev.payToPhone } : prev
      );
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  if (payment) {
    const split = payment.split || preview;
    return (
      <div className="space-y-4">
        {split ? <BuyerMoneySplitView split={split} locale={locale} /> : null}
        <p className="text-sm text-[var(--store-ink-soft)]">{t("payInstructions")}</p>
        {payment.amountRwf != null ? (
          <p className="text-2xl font-extrabold tabular-nums">{formatRwf(payment.amountRwf)}</p>
        ) : null}
        {payment.payToPhone ? (
          <p className="text-sm">
            MoMo · <strong>{payment.payToPhone}</strong>
          </p>
        ) : (
          <p className="text-sm text-[var(--store-muted)]">Cleva will confirm the MoMo number by phone.</p>
        )}
        {payment.reference ? (
          <p className="text-sm">
            {t("payRef")} · <strong>{payment.reference}</strong>
          </p>
        ) : null}
        {payment.status === "pending" || payment.status === "paid" ? (
          <p className="text-sm font-semibold">{payment.status === "paid" ? t("payPaid") : t("payPending")}</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="font-semibold">{t("payPhone")}</span>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--store-line)] bg-[var(--store-card)] px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
              />
            </label>
            <button type="button" className="store-btn store-btn-ember w-full" disabled={busy} onClick={() => void sent()}>
              {busy ? t("sending") : t("paySent")}
            </button>
          </>
        )}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preview ? <BuyerMoneySplitView split={preview} locale={locale} /> : null}
      <label className="block text-sm">
        <span className="font-semibold">{t("birdsNeeded")}</span>
        <input
          className="mt-1 w-full rounded-xl border border-[var(--store-line)] bg-[var(--store-card)] px-3 py-2"
          type="number"
          min={floor}
          max={lot.birdsAvailable}
          value={birds}
          onChange={(e) => setBirds(Math.max(floor, Number(e.target.value) || floor))}
        />
        <span className="mt-1 block text-xs text-[var(--store-muted)]">{t("foodserviceMin")}</span>
      </label>
      {lot.slaughterAvailable ? (
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t("processHow")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className={process === "live" ? "store-btn store-btn-ink" : "store-btn"}
              onClick={() => setProcess("live")}
            >
              {t("processLive")}
            </button>
            <button
              type="button"
              className={process === "slaughter" ? "store-btn store-btn-ink" : "store-btn"}
              onClick={() => setProcess("slaughter")}
            >
              {t("slaughter")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--store-muted)]">{t("liveCollectHint")}</p>
      )}
      <div>
        <p className="mb-1.5 text-sm font-semibold">{t("handover")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={handover === "collect" ? "store-btn store-btn-ink" : "store-btn"}
            onClick={() => setHandover("collect")}
          >
            {t("collect")}
          </button>
          {canDeliver ? (
            <button
              type="button"
              className={handover === "delivery" ? "store-btn store-btn-ink" : "store-btn"}
              onClick={() => setHandover("delivery")}
            >
              {t("farmDelivers")}
            </button>
          ) : null}
        </div>
        {process === "live" ? (
          <p className="mt-1.5 text-xs text-[var(--store-muted)]">{t("liveCollectHint")}</p>
        ) : null}
        {process === "live" && handover === "delivery" && canDeliver ? (
          <p className="mt-1 text-xs text-[var(--store-muted)]">{t("liveDeliveryHint")}</p>
        ) : null}
      </div>
      <button type="button" className="store-btn store-btn-ember w-full" disabled={busy} onClick={() => void startOrder()}>
        {busy ? t("sending") : t("payToConfirm")}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
