import { useEffect, useState } from "react";
import {
  confirmBuyerPayment,
  confirmFulfillment,
  fetchBookingPayment,
  markBuyerPaymentSent,
  markFarmPaid,
  openFulfillmentException,
  planMatchLogistics,
  resolveFulfillmentException,
  settleFulfillment,
  type FulfillmentJob,
} from "../../api/pipeline.api";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT } from "../../lib/publicStoreCopy";
import { Button, Field, Input, Modal, SegmentedControl, Select, StatusPill, Textarea } from "../ui";
import { useToast } from "../Toast";
import {
  EXCEPTION_LABEL,
  HANDSHAKE_LABEL,
  handshakeTone,
  logisticsLabel,
  viewerNeedsConfirm,
  type FulfillmentViewer,
  type HandshakePhase,
} from "../../lib/fulfillment";
import { BuyerMoneySplitView, FarmerMoneySplitView, type BuyerMoneySplit, type FarmerMoneySplit } from "./MoneySplit";

function formatDay(d: string | null | undefined) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function phaseOf(job: FulfillmentJob): HandshakePhase {
  return (job.handshake as HandshakePhase) || (job.status === "delivered" ? "settled" : "reserved");
}

export function FulfillmentCard({
  job,
  viewer,
  token,
  onChanged,
}: {
  job: FulfillmentJob;
  viewer: FulfillmentViewer;
  token: string | null;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const locale = useOptionalMarketLocale()?.locale || "en";
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const phase = phaseOf(job);
  const [sheet, setSheet] = useState<"plan" | "confirm" | "exception" | "resolve" | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyerSplit, setBuyerSplit] = useState<BuyerMoneySplit | null>(null);
  const [farmerSplit, setFarmerSplit] = useState<FarmerMoneySplit | null>(null);
  const [collect, setCollect] = useState(job.collectOrDelivery || "collect");
  const [slaughter, setSlaughter] = useState(job.slaughterMode || "none");
  const [deliveryActor, setDeliveryActor] = useState<"buyer" | "farm" | "cleva">(
    job.deliveryActor || (job.collectOrDelivery === "delivery" ? "farm" : "buyer")
  );
  const [windowStart, setWindowStart] = useState(job.fulfillWindowStart ? String(job.fulfillWindowStart).slice(0, 16) : "");
  const [notes, setNotes] = useState(job.logisticsNotes || "");
  const [actualBirds, setActualBirds] = useState(String(job.actualBirds ?? job.birds));
  const [actualKg, setActualKg] = useState(job.actualWeightKg != null ? String(job.actualWeightKg) : job.avgWeightKg != null ? String(job.avgWeightKg) : "");
  const [actualPrice, setActualPrice] = useState(
    job.actualPricePerKg != null ? String(job.actualPricePerKg) : job.agreedPricePerKg != null ? String(job.agreedPricePerKg) : ""
  );
  const [exKind, setExKind] = useState("short");
  const [exNotes, setExNotes] = useState("");
  const [resolveAction, setResolveAction] = useState("settle");

  const title = `${job.actualBirds ?? job.birds} birds · ${job.lotDistrict || job.lotFarmLabel || job.farmDisplayName || "Lot"}`;
  const canPlan = phase === "reserved" || phase === "planned" || phase === "buyer_confirmed" || phase === "farmer_confirmed";
  const canConfirm = viewerNeedsConfirm(phase, viewer);
  const canException = phase !== "settled" && phase !== "cancelled" && phase !== "failed" && phase !== "exception";
  const payStatus = job.buyerPaymentStatus;
  const payoutStatus = job.farmerPayoutStatus;
  const canMarkSent = viewer === "buyer" && payStatus === "unpaid";
  const canConfirmPay = viewer === "ops" && (payStatus === "unpaid" || payStatus === "pending");
  const canPayFarm = viewer === "ops" && payStatus === "paid" && payoutStatus !== "paid";
  const canAskDeliveryHelp =
    (viewer === "buyer" || viewer === "ops") && canPlan && !job.needClevaDelivery && payStatus === "paid";

  useEffect(() => {
    let cancelled = false;
    void fetchBookingPayment(token, job.id)
      .then((res) => {
        if (cancelled) return;
        setBuyerSplit(res.split || null);
        setFarmerSplit(res.farmerSplit || null);
      })
      .catch(() => {
        if (!cancelled) {
          setBuyerSplit(null);
          setFarmerSplit(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, token]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      showToast("success", ok);
      setSheet(null);
      onChanged();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Ready {formatDay(job.lotReadyFrom || job.readyDate)}
            {job.publicRef ? ` · ${job.publicRef}` : ""}
            {viewer !== "buyer" && job.buyerName ? ` · ${job.buyerName}` : ""}
          </p>
        </div>
        <StatusPill tone={handshakeTone(phase)}>{HANDSHAKE_LABEL[phase]}</StatusPill>
      </div>

      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {logisticsLabel(job.collectOrDelivery, job.slaughterMode, job.deliveryActor)}
        {job.agreedPricePerKg != null ? ` · ${Math.round(Number(job.agreedPricePerKg))} RWF/kg` : ""}
      </p>
      {job.needClevaDelivery ? (
        <p className="mt-1 text-xs font-semibold text-[var(--status-warning)]">{t("needClevaDeliveryDone")}</p>
      ) : null}

      {payStatus && payStatus !== "paid" ? (
        <p className="mt-2 text-sm font-semibold text-[var(--status-warning)]">
          {payStatus === "pending" ? t("payPending") : t("awaitingPay")}
          {job.buyerPaidRwf != null ? ` · ${Math.round(Number(job.buyerPaidRwf))} RWF` : ""}
          {job.buyerPaymentRef ? ` · ${job.buyerPaymentRef}` : ""}
        </p>
      ) : payoutStatus === "paid" ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t("payFarmerPaid")}
          {job.farmerPaidRwf != null ? ` · ${Math.round(Number(job.farmerPaidRwf))} RWF` : ""}
        </p>
      ) : payStatus === "paid" && viewer !== "buyer" ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t("payPaid")}
          {payoutStatus === "due" || payoutStatus === "unpaid" ? ` · ${t("payFarmerDue")}` : ""}
          {job.farmerPaidRwf != null ? ` · ${Math.round(Number(job.farmerPaidRwf))} RWF` : ""}
        </p>
      ) : null}

      {viewer !== "farmer" && buyerSplit ? <BuyerMoneySplitView split={buyerSplit} locale={locale} /> : null}
      {viewer !== "buyer" && farmerSplit ? <FarmerMoneySplitView split={farmerSplit} locale={locale} /> : null}

      {phase === "exception" ? (
        <p className="mt-2 text-sm text-[var(--status-warning)]">
          {EXCEPTION_LABEL[job.exceptionKind || ""] || job.exceptionKind} — {job.exceptionNotes || "Ops will review."}
        </p>
      ) : null}

      {job.farmPhone || job.buyerPhone || job.farmExactLocation ? (
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          {job.farmPhone ? `Farm ${job.farmPhone}` : ""}
          {job.buyerPhone ? `${job.farmPhone ? " · " : ""}Buyer ${job.buyerPhone}` : ""}
          {job.farmExactLocation ? ` · ${job.farmExactLocation}` : ""}
        </p>
      ) : null}

      <ol className="mt-3 flex flex-wrap gap-1.5 type-caption text-[var(--text-muted)]">
        {(
          (phase === "awaiting_payment"
            ? ["awaiting_payment", "reserved", "planned", "settled"]
            : ["reserved", "planned", viewer === "farmer" ? "farmer_confirmed" : "buyer_confirmed", "settled"]) as HandshakePhase[]
        ).map((step, i, arr) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className={phase === step || (phase === "settled" && step === "settled") ? "font-semibold text-[var(--text-primary)]" : ""}>
                {step === "awaiting_payment" ? t("awaitingPay") : HANDSHAKE_LABEL[step]}
              </span>
              {i < arr.length - 1 ? <span aria-hidden>→</span> : null}
            </li>
          ))}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        {canMarkSent ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void run(() => markBuyerPaymentSent(token, job.id), t("payPending"))}
          >
            {t("paySent")}
          </Button>
        ) : null}
        {canConfirmPay ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void run(() => confirmBuyerPayment(token, job.id), t("payPaid"))}
          >
            Confirm buyer payment
          </Button>
        ) : null}
        {canPayFarm ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void run(() => markFarmPaid(token, job.id), t("payFarmerPaid"))}
          >
            Pay farm
          </Button>
        ) : null}
        {canPlan ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => setSheet("plan")}>
            Plan handover
          </Button>
        ) : null}
        {canAskDeliveryHelp ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  planMatchLogistics(token, job.id, {
                    collectOrDelivery: job.collectOrDelivery || "collect",
                    slaughterMode: job.slaughterMode || "none",
                    needClevaDelivery: true,
                    logisticsNotes: job.logisticsNotes || null,
                  }),
                t("needClevaDeliveryDone")
              )
            }
          >
            {t("needClevaDelivery")}
          </Button>
        ) : null}
        {canConfirm && viewer !== "ops" ? (
          <Button type="button" size="sm" onClick={() => setSheet("confirm")}>
            Confirm my side
          </Button>
        ) : null}
        {viewer === "ops" && canConfirm ? (
          <Button type="button" size="sm" onClick={() => setSheet("confirm")}>
            Settle trade
          </Button>
        ) : null}
        {canException ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setSheet("exception")}>
            Report problem
          </Button>
        ) : null}
        {viewer === "ops" && phase === "exception" ? (
          <Button type="button" size="sm" onClick={() => setSheet("resolve")}>
            Resolve
          </Button>
        ) : null}
      </div>

      <Modal
        open={sheet === "plan"}
        onClose={() => setSheet(null)}
        title="Plan handover"
        footer={
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  planMatchLogistics(token, job.id, {
                    collectOrDelivery: collect,
                    slaughterMode: slaughter,
                    deliveryActor: collect === "collect" ? "buyer" : deliveryActor,
                    fulfillWindowStart: windowStart || null,
                    logisticsNotes: notes || null,
                  }),
                "Handover planned"
              )
            }
          >
            {busy ? "Saving…" : "Save plan"}
          </Button>
        }
      >
        <div className="space-y-3">
          <SegmentedControl
            label="Process"
            value={slaughter}
            onChange={setSlaughter}
            options={[
              { value: "none", label: "Live" },
              { value: "farm", label: "Slaughter at farm" },
              { value: "buyer", label: "Slaughter at buyer" },
            ]}
          />
          <SegmentedControl
            label="How birds move"
            value={collect}
            onChange={(v) => {
              setCollect(v);
              setDeliveryActor(v === "collect" ? "buyer" : deliveryActor === "buyer" ? "farm" : deliveryActor);
            }}
            options={[
              { value: "collect", label: "Buyer collects" },
              ...(job.deliveryAvailable || viewer === "ops"
                ? [{ value: "delivery", label: "Farm delivers" }]
                : []),
            ]}
          />
          {collect === "delivery" && viewer === "ops" ? (
            <SegmentedControl
              label="Who delivers"
              value={deliveryActor === "cleva" ? "cleva" : "farm"}
              onChange={(v) => setDeliveryActor(v === "cleva" ? "cleva" : "farm")}
              options={[
                { value: "farm", label: "Farm" },
                { value: "cleva", label: "Cleva" },
              ]}
            />
          ) : null}
          <Field label="Ready window" help="Date and time for pickup or delivery.">
            <Input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={sheet === "confirm"}
        onClose={() => setSheet(null)}
        title={viewer === "ops" ? "Settle trade" : "Confirm handover"}
        footer={
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const body = {
                  actualBirds: Number(actualBirds) || job.birds,
                  actualWeightKg: actualKg ? Number(actualKg) : null,
                  actualPricePerKg: actualPrice ? Number(actualPrice) : null,
                };
                if (viewer === "ops") {
                  await settleFulfillment(token, job.id, body);
                  return;
                }
                const res = await confirmFulfillment(token, job.id, body);
                if (res.conflict) {
                  throw new Error(`Numbers do not match (${res.conflict.kind}). Ops will review.`);
                }
              }, viewer === "ops" ? "Trade settled" : "Your side confirmed")
            }
          >
            {busy ? "Saving…" : viewer === "ops" ? "Settle now" : "Confirm"}
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Both sides must agree on birds, kg, and price. Commission accrues only after both confirm.
          </p>
          <Field label="Birds at handover">
            <Input type="number" min={0} value={actualBirds} onChange={(e) => setActualBirds(e.target.value)} />
          </Field>
          <Field label="Avg kg">
            <Input type="number" step="0.01" value={actualKg} onChange={(e) => setActualKg(e.target.value)} />
          </Field>
          <Field label="Price RWF/kg">
            <Input type="number" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={sheet === "exception"}
        onClose={() => setSheet(null)}
        title="Report a problem"
        footer={
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => openFulfillmentException(token, job.id, { kind: exKind, notes: exNotes }),
                "Exception opened"
              )
            }
          >
            {busy ? "Saving…" : "Report"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="What happened">
            <Select value={exKind} onChange={(e) => setExKind(e.target.value)}>
              <option value="short">Short count or weight</option>
              <option value="no_show">No-show</option>
              <option value="price_dispute">Price dispute</option>
              <option value="failed">Trade failed</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={exNotes} onChange={(e) => setExNotes(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={sheet === "resolve"}
        onClose={() => setSheet(null)}
        title="Resolve exception"
        footer={
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  resolveFulfillmentException(token, job.id, {
                    action: resolveAction,
                    notes: exNotes,
                    actualBirds: Number(actualBirds) || job.birds,
                    actualWeightKg: actualKg ? Number(actualKg) : null,
                    actualPricePerKg: actualPrice ? Number(actualPrice) : null,
                  }),
                "Exception resolved"
              )
            }
          >
            {busy ? "Saving…" : "Resolve"}
          </Button>
        }
      >
        <div className="space-y-3">
          <SegmentedControl
            label="Outcome"
            value={resolveAction}
            onChange={setResolveAction}
            options={[
              { value: "settle", label: "Settle" },
              { value: "fail", label: "Fail" },
              { value: "reopen", label: "Reopen" },
            ]}
          />
          {resolveAction === "settle" ? (
            <>
              <Field label="Birds">
                <Input type="number" value={actualBirds} onChange={(e) => setActualBirds(e.target.value)} />
              </Field>
              <Field label="Avg kg">
                <Input type="number" step="0.01" value={actualKg} onChange={(e) => setActualKg(e.target.value)} />
              </Field>
              <Field label="Price RWF/kg">
                <Input type="number" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="Notes">
            <Textarea value={exNotes} onChange={(e) => setExNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </Modal>
    </li>
  );
}
