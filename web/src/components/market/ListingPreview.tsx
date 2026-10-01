import type { PublicLot } from "../../api/publicMarket.api";
import { useOptionalMarketLocale } from "../../context/MarketLocaleContext";
import { storeT } from "../../lib/publicStoreCopy";
import { MarketLotCard } from "./MarketLotCard";

export function ListingPreview({
  lot,
  lines,
  verified = false,
  showRequest = false,
}: {
  lot: PublicLot;
  lines: string[];
  verified?: boolean;
  showRequest?: boolean;
}) {
  const locale = useOptionalMarketLocale()?.locale || "en";
  const t = (key: Parameters<typeof storeT>[1]) => storeT(locale, key);
  return (
    <div className="space-y-3">
      <p className="type-label">{t("farmerWhatPublicSees")}</p>
      <MarketLotCard
        lot={lot}
        cta={showRequest ? t("requestThese") : ""}
        to={`/market/lot/${lot.publicRef}`}
        preview
        verified={verified}
        hideRef={lot.publicRef === "LOT-PREVIEW"}
      />
      <ul className="space-y-1 type-caption text-[var(--text-secondary)]">
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}
