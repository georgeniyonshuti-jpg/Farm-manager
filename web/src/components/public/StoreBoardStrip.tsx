import { formatKgRange, formatRwf, formatWeekRange, type MarketBoard } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreBoardStrip({
  board,
  ready = true,
  locale,
}: {
  board: MarketBoard | null;
  ready?: boolean;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  if (!ready || !board) return null;
  const range = formatWeekRange(board.validFrom, board.validTo);

  return (
    <section className="store-board" aria-label={t("thisWeeksBoard")}>
      <div className="store-wrap store-board-inner">
        <p className="store-board-meta">
          <span className="store-board-label">{t("thisWeek")}</span>
          <span className="store-board-date">{range}</span>
        </p>
        <ul className="store-board-bands">
          {board.bands.map((b) => (
            <li key={`${b.minKg}-${b.maxKg}`}>
              {formatKgRange(b.minKg, b.maxKg)}{" "}
              <strong>
                {t("fromPerKg")} {formatRwf(b.fromRwfPerKg)}/kg
              </strong>
            </li>
          ))}
          {board.slaughterRwfPerBird > 0 ? (
            <li>
              {t("slaughterFee")} {formatRwf(board.slaughterRwfPerBird)}/{t("perBird")}
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
