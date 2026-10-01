import { useEffect, useState } from "react";
import { fetchPublicQuote, submitPublicSellRequest } from "../../api/publicMarket.api";
import { type FarmerQuote } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { DistrictSelect } from "../DistrictSelect";
import { StoreOfferCard } from "./StoreOfferCard";

export function StoreSellForm({ locale }: { locale: StoreLocale }) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const [formStartedAt] = useState(() => Date.now());
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [birds, setBirds] = useState(50);
  const [avgKg, setAvgKg] = useState(1.8);
  const [district, setDistrict] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [quote, setQuote] = useState<FarmerQuote | null>(null);
  const [quoteReady, setQuoteReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void fetchPublicQuote({ birds, avgKg })
        .then((r) => {
          if (!cancelled) setQuote(r.quote);
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        })
        .finally(() => {
          if (!cancelled) setQuoteReady(true);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [birds, avgKg]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await submitPublicSellRequest({
        contactName,
        phone,
        birds,
        avgWeightKg: avgKg,
        district: district || undefined,
        website: honeypot,
        formStartedAt,
      });
      setReference(res.reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="space-y-3">
        <p className="text-lg font-semibold text-[var(--store-ink)]">{t("requestIn")}</p>
        <p className="leading-relaxed text-[var(--store-muted)]">
          {t("yourRef")}{" "}
          <strong className="font-mono text-[var(--store-ink)]">{reference}</strong>. {t("willCall")}
        </p>
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
      <p className="store-request-title">{t("listBirds")}</p>
      <div className="store-field-row">
        <div className="store-field">
          <span>{t("birdsForSale")}</span>
          <div className="store-stepper">
            <button type="button" onClick={() => setBirds((n) => Math.max(1, n - 10))} aria-label="-">
              −
            </button>
            <input
              type="number"
              min={1}
              value={birds}
              onChange={(e) => setBirds(Math.max(1, Number(e.target.value) || 1))}
            />
            <button type="button" onClick={() => setBirds((n) => n + 10)} aria-label="+">
              +
            </button>
          </div>
        </div>
        <div className="store-field">
          <span>{t("avgKg")}</span>
          <div className="store-stepper">
            <button type="button" onClick={() => setAvgKg((n) => Math.max(0.8, Math.round((n - 0.1) * 10) / 10))} aria-label="-">
              −
            </button>
            <input
              type="number"
              min={0.8}
              step={0.1}
              value={avgKg}
              onChange={(e) => setAvgKg(Math.max(0.8, Number(e.target.value) || 0.8))}
            />
            <button type="button" onClick={() => setAvgKg((n) => Math.round((n + 0.1) * 10) / 10)} aria-label="+">
              +
            </button>
          </div>
        </div>
      </div>
      {quote ? (
        <StoreOfferCard quote={quote} locale={locale} compact />
      ) : quoteReady ? (
        <p className="store-form-footer">{t("offerWhenPosted")}</p>
      ) : null}
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
        <DistrictSelect variant="store" locale={locale} value={district} onChange={setDistrict} />
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>
      {error ? <p className="text-sm text-[#9a3412]">{error}</p> : null}
      <button type="submit" className="store-btn store-btn-ember w-full" disabled={busy}>
        {busy ? t("sending") : t("listBirds")}
      </button>
      <p className="store-form-footer">{t("formFooterSell")}</p>
      {quote ? <p className="text-center text-xs text-[var(--store-muted)]">{t("finalAtScale")}</p> : null}
    </form>
  );
}
