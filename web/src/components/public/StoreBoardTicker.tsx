import type { PublicMarketSummary } from "../../api/publicMarket.api";
import { defaultWeekBounds, formatWeekRange, type MarketBoard } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreBoardTicker({
  board,
  summary,
  locale,
}: {
  board: MarketBoard | null;
  summary: PublicMarketSummary | null;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const week = board ?? defaultWeekBounds();
  const birds = summary && summary.birdsThisWeek > 0 ? summary.birdsThisWeek : 0;

  return (
    <div className="store-ticker-inner">
      <p className="store-ticker-week">
        <span className="store-ticker-label">{t("thisWeek")}</span>
        <span className="store-ticker-date">{formatWeekRange(week.validFrom, week.validTo)}</span>
      </p>
      {birds > 0 ? (
        <p className="store-ticker-stats">
          <strong className="tabular-nums">{birds.toLocaleString()}</strong> {t("proofBirdsWeek")}
        </p>
      ) : null}
    </div>
  );
}
