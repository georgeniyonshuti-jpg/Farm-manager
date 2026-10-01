import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { submitPublicRequest, type PublicLot } from "../../api/publicMarket.api";
import { usePublicBoard } from "../../hooks/usePublicBoard";
import { midWeight } from "../../lib/marketQuote";
import {
  buyerBirdsFloor,
  defaultHandover,
  defaultProcess,
  deliveryOptionEnabled,
  type MarketHandover,
  type MarketProcess,
} from "../../lib/marketLogisticsDefaults";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { DistrictSelect } from "../DistrictSelect";
import { StoreButcherPay } from "./StoreButcherPay";
import { StoreChip } from "./StoreChip";
import type { TripState } from "./StoreTripQuote";

type NeededWhen = "this" | "next" | "date";
type Settle = "cash_scale" | "same_week" | "days_7" | "days_14";
type ExpectMode = "board" | "under";

export function StoreRequestForm({
  locale,
  lot,
  district,
  extras: _extras = false,
  onDone,
  trip,
}: {
  locale: StoreLocale;
  lot?: PublicLot | null;
  district?: string;
  extras?: boolean;
  onDone?: () => void;
  trip?: TripState;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const { board } = usePublicBoard();
  const lotKg = lot?.weightBandKg
    ? midWeight({ minKg: lot.weightBandKg.min, maxKg: lot.weightBandKg.max })
    : 1.8;
  const floor = buyerBirdsFloor(lot?.minOrderBirds);
  const [formStartedAt] = useState(() => Date.now());
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [buyerType, setBuyerType] = useState("butcher");
  const [birds, setBirds] = useState(
    () => trip?.birds || Math.min(Math.max(floor, 50), lot?.birdsAvailable || 50)
  );
  const [neededWhen, setNeededWhen] = useState<NeededWhen>(lot?.readyFrom ? "date" : "this");
  const [neededFrom, setNeededFrom] = useState(lot?.readyFrom || "");
  const [typical, setTypical] = useState<number | "">("");
  const [settle, setSettle] = useState<Settle>("cash_scale");
  const [expectMode, setExpectMode] = useState<ExpectMode>("board");
  const [expectRwf, setExpectRwf] = useState(4000);
  const [process, setProcess] = useState<MarketProcess>(() =>
    defaultProcess({
      slaughterAvailable: lot?.slaughterAvailable,
      tripSlaughterPayer: trip?.slaughterPayer ?? null,
    })
  );
  const [handover, setHandover] = useState<MarketHandover>(() =>
    defaultHandover({
      process: "live",
      deliveryAvailable: lot?.deliveryAvailable,
      tripDelivery: trip?.delivery,
    })
  );
  const [ownDistrict, setOwnDistrict] = useState(district || "");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const canDeliver = deliveryOptionEnabled({ deliveryAvailable: lot?.deliveryAvailable });

  useEffect(() => {
    const nextProcess = defaultProcess({
      slaughterAvailable: lot?.slaughterAvailable,
      tripSlaughterPayer: trip?.slaughterPayer ?? null,
    });
    setBirds(trip?.birds || Math.min(Math.max(floor, 50), lot?.birdsAvailable || 50));
    setNeededFrom(lot?.readyFrom || "");
    setNeededWhen(lot?.readyFrom ? "date" : "this");
    setProcess(nextProcess);
    setHandover(
      defaultHandover({
        process: nextProcess,
        deliveryAvailable: lot?.deliveryAvailable,
        tripDelivery: trip?.delivery,
      })
    );
  }, [
    lot?.publicRef,
    lot?.birdsAvailable,
    lot?.readyFrom,
    lot?.deliveryAvailable,
    lot?.slaughterAvailable,
    lot?.minOrderBirds,
    floor,
    trip?.birds,
    trip?.delivery,
    trip?.slaughterPayer,
  ]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await submitPublicRequest({
        publicRef: lot?.publicRef,
        contactName,
        phone,
        businessName: businessName || undefined,
        buyerType,
        district: lot?.district || ownDistrict || district || undefined,
        birds,
        typicalBirdsPerWeek: typical === "" ? undefined : typical,
        settleTerms: settle,
        expectedRwfPerKg: expectMode === "under" ? expectRwf : null,
        handover,
        process,
        neededWhen,
        neededFrom: neededWhen === "date" ? neededFrom || undefined : undefined,
        message: message || undefined,
        website: honeypot,
        formStartedAt,
      });
      setReference(res.reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="space-y-4">
        <p className="text-lg font-semibold text-[var(--store-ink)]">{t("requestIn")}</p>
        <p className="leading-relaxed text-[var(--store-muted)]">
          {t("yourRef")}{" "}
          <strong className="font-mono text-[var(--store-ink)]">{reference}</strong>. {t("willCall")}
        </p>
        <Link
          to="/signup?from=market&accountType=buyer"
          className="store-text-link inline-block text-sm"
        >
          {t("createAccountLots")}
        </Link>
        {onDone ? (
          <button type="button" className="store-btn store-btn-ink w-full" onClick={onDone}>
            {t("ok")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="store-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="store-request-title">{t("request")}</p>
      <div className="store-field-row">
        <label className="store-field">
          <span>
            {t("name")} <em className="store-required">{t("requiredMark")}</em>
          </span>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="store-field">
          <span>
            {t("phone")} <em className="store-required">{t("requiredMark")}</em>
          </span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+250 7…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
          />
        </label>
      </div>
      <div className="store-field">
        <span>{t("birdsNeeded")}</span>
        <div className="store-stepper">
          <button type="button" onClick={() => setBirds((n) => Math.max(floor, n - 10))} aria-label="-">
            −
          </button>
          <input
            type="number"
            min={floor}
            max={lot?.birdsAvailable || undefined}
            value={birds}
            onChange={(e) => setBirds(Math.max(floor, Number(e.target.value) || floor))}
          />
          <button
            type="button"
            onClick={() => setBirds((n) => Math.min(lot?.birdsAvailable || n + 10, n + 10))}
            aria-label="+"
          >
            +
          </button>
        </div>
        <p className="store-field-hint">{t("foodserviceMin")}</p>
      </div>
      <div className="store-logistics">
        <div className="store-field">
          <span>{t("processHow")}</span>
          <div className="flex flex-wrap gap-1.5">
            <StoreChip
              on={process === "live"}
              onClick={() => {
                setProcess("live");
                setHandover("collect");
              }}
            >
              {t("processLive")}
            </StoreChip>
            {lot?.slaughterAvailable !== false ? (
              <StoreChip
                on={process === "slaughter"}
                onClick={() => {
                  setProcess("slaughter");
                  setHandover(
                    defaultHandover({
                      process: "slaughter",
                      deliveryAvailable: lot?.deliveryAvailable,
                    })
                  );
                }}
              >
                {t("slaughter")}
              </StoreChip>
            ) : null}
          </div>
        </div>
        {canDeliver ? (
          <div className="store-field">
            <span>{t("handover")}</span>
            <div className="flex flex-wrap gap-1.5">
              <StoreChip on={handover === "collect"} onClick={() => setHandover("collect")}>
                {t("collect")}
              </StoreChip>
              <StoreChip on={handover === "delivery"} onClick={() => setHandover("delivery")}>
                {t("farmDelivers")}
              </StoreChip>
            </div>
            {process === "live" && handover === "delivery" ? (
              <p className="store-field-hint">{t("liveDeliveryHint")}</p>
            ) : process === "live" ? (
              <p className="store-field-hint">{t("liveCollectHint")}</p>
            ) : null}
          </div>
        ) : (
          <p className="store-field-hint">
            {process === "live" ? t("liveCollectHint") : t("collectOnlyHint")}
          </p>
        )}
      </div>
      <div className="store-field">
        <span>{t("whenNeeded")}</span>
        <div className="flex flex-wrap gap-1.5">
          <StoreChip on={neededWhen === "this"} onClick={() => setNeededWhen("this")}>
            {t("thisWeek")}
          </StoreChip>
          <StoreChip on={neededWhen === "next"} onClick={() => setNeededWhen("next")}>
            {t("nextWeek")}
          </StoreChip>
          <StoreChip on={neededWhen === "date"} onClick={() => setNeededWhen("date")}>
            {t("aDate")}
          </StoreChip>
        </div>
        {neededWhen === "date" ? (
          <label className="store-field">
            <span>{t("neededFrom")}</span>
            <input type="date" value={neededFrom} onChange={(e) => setNeededFrom(e.target.value)} />
          </label>
        ) : null}
      </div>
      {board ? (
        <StoreButcherPay
          board={board}
          birds={birds}
          avgKg={lotKg}
          delivery={handover === "delivery"}
          locale={locale}
        />
      ) : null}
        <DistrictSelect variant="store" locale={locale} value={ownDistrict} onChange={setOwnDistrict} />
      <details className="store-more">
        <summary>{t("shopDetail")}</summary>
        <div className="store-form pt-1">
        <div className="store-field">
          <span>{t("usualWeek")}</span>
          <div className="store-stepper">
            <button
              type="button"
              onClick={() => setTypical((n) => (n === "" ? 40 : Math.max(10, n - 10)))}
              aria-label="-"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              placeholder="—"
              value={typical}
              onChange={(e) => {
                const v = e.target.value;
                setTypical(v === "" ? "" : Math.max(1, Number(v) || 1));
              }}
            />
            <button
              type="button"
              onClick={() => setTypical((n) => (n === "" ? 50 : n + 10))}
              aria-label="+"
            >
              +
            </button>
          </div>
        </div>
        <div className="store-field">
          <span>{t("settleHow")}</span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["cash_scale", "settleCash"],
                ["same_week", "settleSame"],
                ["days_7", "settle7"],
                ["days_14", "settle14"],
              ] as const
            ).map(([id, key]) => (
              <StoreChip key={id} on={settle === id} onClick={() => setSettle(id)}>
                {t(key)}
              </StoreChip>
            ))}
          </div>
        </div>
        <div className="store-field">
          <span>{t("expectPay")}</span>
          <div className="flex flex-wrap gap-1.5">
            <StoreChip on={expectMode === "board"} onClick={() => setExpectMode("board")}>
              {t("expectBoard")}
            </StoreChip>
            <StoreChip on={expectMode === "under"} onClick={() => setExpectMode("under")}>
              {t("expectUnder")}
            </StoreChip>
          </div>
          {expectMode === "under" ? (
            <label className="store-field">
              <span>{t("rwfKg")}</span>
              <input
                type="number"
                min={500}
                step={50}
                value={expectRwf}
                onChange={(e) => setExpectRwf(Math.max(500, Number(e.target.value) || 500))}
              />
            </label>
          ) : null}
        </div>
        <div className="store-field-row">
          <label className="store-field">
            <span>{t("buyerType")}</span>
            <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)}>
              <option value="butcher">{t("butcher")}</option>
              <option value="restaurant">{t("restaurant")}</option>
              <option value="hotel">{t("hotel")}</option>
              <option value="vendor">{t("vendor")}</option>
              <option value="other">{t("other")}</option>
            </select>
          </label>
          <label className="store-field">
            <span>{t("business")}</span>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" />
          </label>
        </div>
        <label className="store-field">
          <span>{t("message")}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
        </label>
        </div>
      </details>

      {error ? <p className="text-sm text-[#9a3412]">{error}</p> : null}
      <button type="submit" className="store-btn store-btn-ember w-full" disabled={busy}>
        {busy ? t("sending") : t("sendRequest")}
      </button>
      <p className="store-form-footer">{t("formFooterBuy")}</p>

      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>
    </form>
  );
}
