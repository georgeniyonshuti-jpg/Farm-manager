import type { PublicLot } from "../../api/publicMarket.api";
import { formatRwf } from "../../lib/marketQuote";
import { formatWeightBand } from "../../lib/publicMarketFilters";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreOfferRow({
  lot,
  locale,
  cta,
  onSelect,
}: {
  lot: PublicLot;
  locale: StoreLocale;
  cta: string;
  onSelect: () => void;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const priced = lot.priced !== false && lot.buyerRwfPerKg != null;
  const thumb = lot.coverUrl || lot.media?.find((m) => m.url)?.url || null;

  return (
    <button type="button" className="store-offer-row" onClick={onSelect}>
      {thumb ? <img src={thumb} alt="" className="store-offer-thumb" /> : <span className="store-offer-thumb store-offer-thumb-empty" />}
      <span className="store-offer-copy">
        <span className="store-offer-price">
          {priced ? (
            <>
              <strong className="tabular-nums">{formatRwf(lot.buyerRwfPerKg)}</strong>
              <span className="store-offer-unit">/{t("perKg").replace("RWF/", "")}</span>
              {lot.youPayRwf != null ? (
                <span className="store-offer-trip tabular-nums">
                  {formatRwf(lot.youPayRwf)} {t("thisTrip")}
                </span>
              ) : null}
            </>
          ) : (
            <strong>{t("moreThisWeek")}</strong>
          )}
          {lot.merchantTier === "cleva_run" && priced ? <span className="store-offer-badge">{t("clevaRun")}</span> : null}
        </span>
        <span className="store-offer-meta">
          {lot.birdsAvailable.toLocaleString()} {t("birds")}
          {" · "}
          {formatWeightBand(lot.weightBandKg)}
          {lot.district ? ` · ${lot.district}` : ""}
          {lot.readyLabel ? ` · ${lot.readyLabel}` : ""}
          {lot.slaughterAvailable ? ` · ${t("slaughter")}` : ""}
        </span>
      </span>
      <span className="store-offer-cta">{cta}</span>
    </button>
  );
}
