import { useState } from "react";
import type { PublicLot } from "../../api/publicMarket.api";
import { formatRwf } from "../../lib/marketQuote";
import { formatWeightBand } from "../../lib/publicMarketFilters";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";
import { BuyerMoneySplitView } from "../market/MoneySplit";

export function StoreBoardCard({
  lot,
  locale,
  onRequest,
}: {
  lot: PublicLot;
  locale: StoreLocale;
  onRequest: () => void;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const priced = lot.priced !== false && lot.buyerRwfPerKg != null;
  const weight = formatWeightBand(lot.weightBandKg);
  const [openSplit, setOpenSplit] = useState(false);

  return (
    <article className="store-card store-board-card">
      <div className="store-board-card-top">
        <h3 className="store-board-card-district">{lot.district || "Rwanda"}</h3>
        <span className="store-board-card-badge">✓ {t("verified")}</span>
      </div>
      <p className="store-board-card-meta">
        {lot.birdsAvailable.toLocaleString()} {t("birds")}
        {weight !== "—" ? ` · ${weight}` : ""}
        {lot.readyLabel ? ` · ${lot.readyLabel}` : ""}
        <em>{t("lotOpen")}</em>
      </p>
      <p className="mb-2 flex flex-wrap gap-1.5 text-xs font-semibold text-[var(--store-ink-soft)]">
        <span className="rounded-full border border-[var(--store-line)] px-2 py-0.5">{t("chipCollectLive")}</span>
        {lot.slaughterAvailable ? (
          <span className="rounded-full border border-[var(--store-line)] px-2 py-0.5">{t("chipSlaughter")}</span>
        ) : null}
        {lot.deliveryAvailable ? (
          <span className="rounded-full border border-[var(--store-line)] px-2 py-0.5">{t("chipFarmDelivery")}</span>
        ) : null}
      </p>
      <p className="store-board-card-price">
        {priced ? (
          <>
            <strong className="tabular-nums">{formatRwf(lot.buyerRwfPerKg)}</strong>
            <span>/{t("perKg").replace("RWF/", "")}</span>
          </>
        ) : (
          <strong>{t("priceOnRequest")}</strong>
        )}
      </p>
      {lot.moneySplit ? (
        <button type="button" className="store-text-link mb-2 text-left" onClick={() => setOpenSplit((v) => !v)}>
          {t("splitSee")}
        </button>
      ) : null}
      {openSplit && lot.moneySplit ? <BuyerMoneySplitView split={lot.moneySplit} locale={locale} /> : null}
      <button type="button" className="store-btn store-btn-ink w-full" onClick={onRequest}>
        {t("requestLot")}
      </button>
    </article>
  );
}

export function StoreBoardGhosts({ locale }: { locale: StoreLocale }) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);

  return (
    <div className="store-lots-grid" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <article key={i} className="store-card store-board-card store-board-ghost">
          <div className="store-board-card-top">
            <h3 className="store-board-card-district">{t("district")}</h3>
          </div>
          <p className="store-board-card-meta">
            — {t("birds")} · — kg
            <em>{t("lotOpen")}</em>
          </p>
          <p className="store-board-card-price">
            <strong>—</strong>
            <span>/{t("perKg").replace("RWF/", "")}</span>
          </p>
          <span className="store-board-ghost-cta">{t("requestLot")}</span>
        </article>
      ))}
    </div>
  );
}
