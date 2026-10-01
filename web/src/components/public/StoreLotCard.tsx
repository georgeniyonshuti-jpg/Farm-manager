import { Link } from "react-router-dom";
import type { PublicLot } from "../../api/publicMarket.api";
import { formatPriceBand, formatWeightBand } from "../../lib/publicMarketFilters";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreLotCard({
  lot,
  locale,
  to,
}: {
  lot: PublicLot;
  locale: StoreLocale;
  to: string;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const cover = lot.coverUrl || lot.media?.find((m) => m.url)?.url || lot.farm?.coverUrl;

  return (
    <Link to={to} className="store-card store-lot group flex flex-col no-underline">
      <div className="store-lot-media relative aspect-[5/4] overflow-hidden bg-[#2a1c14]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col justify-end p-5 text-[var(--store-cream)]">
            <p className="store-kicker">{lot.district || "Rwanda"}</p>
            <p className="store-display text-5xl">{lot.birdsAvailable.toLocaleString()}</p>
            <p className="text-sm opacity-70">{t("birds")}</p>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[var(--store-cream)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--store-moss)]">
            {t("verified")}
          </span>
          {lot.farm ? (
            <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              {lot.farm.displayName}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="font-[var(--font-display)] text-xl font-bold leading-tight text-[var(--store-ink)]">
            {lot.title || lot.district || "Rwanda"}
          </p>
          <p className="mt-1 text-sm text-[var(--store-muted)]">
            {lot.readyLabel || t("ready")} · {formatWeightBand(lot.weightBandKg)}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-[var(--store-ink)]">
          {lot.birdsAvailable.toLocaleString()}{" "}
          <span className="text-base font-medium text-[var(--store-muted)]">{t("birds")}</span>
        </p>
        <p className="text-lg font-semibold text-[var(--store-ember)]">
          {lot.priceBandRwf ? formatPriceBand(lot.priceBandRwf) : t("priceOnRequest")}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--store-muted)]">
            {[lot.slaughterAvailable ? t("slaughter") : null, lot.deliveryAvailable ? t("delivery") : t("pickup")]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="text-sm font-bold text-[var(--store-ember)]">{t("requestThese")} →</span>
        </div>
      </div>
    </Link>
  );
}
