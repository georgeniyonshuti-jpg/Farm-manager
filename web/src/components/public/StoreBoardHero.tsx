import type { PublicMarketSummary } from "../../api/publicMarket.api";
import {
  DEMO_STRIP_RATE_RWF,
  defaultWeekBounds,
  displayStripRate,
  formatWeekRange,
  resolveStripRate,
  type MarketBoard,
} from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

function fallbackStripRate() {
  const n = Number(import.meta.env.VITE_MARKET_STRIP_RATE);
  return Number.isFinite(n) && n >= 100 ? Math.round(n) : DEMO_STRIP_RATE_RWF;
}

export function StoreBoardHero({
  board,
  ready,
  summary,
  locale,
  onRequest,
}: {
  board: MarketBoard | null;
  ready: boolean;
  whatsapp?: string | null;
  summary: PublicMarketSummary | null;
  locale: StoreLocale;
  onRequest?: () => void;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const rate = displayStripRate(board, fallbackStripRate());
  const posted = ready ? resolveStripRate(board) : null;
  const trend = posted != null ? board?.trend : null;
  const week = board ?? defaultWeekBounds();
  const birds = summary && summary.birdsThisWeek > 0 ? summary.birdsThisWeek : 0;

  return (
    <section className="store-rate-strip" aria-label={t("rateHow")}>
      <div className="store-wrap">
        <div className="store-rate-board">
          <p className="store-rate-kicker">
            <span>{t("ratePosted")}</span>
            <span>{formatWeekRange(week.validFrom, week.validTo)}</span>
          </p>
          <div className="store-rate-stage">
            <p className="store-rate">
              <span className="store-rate-num tabular-nums">{Math.round(rate).toLocaleString("en-RW")}</span>
              <span className="store-rate-unit">{t("perKg")}</span>
            </p>
            <p className="store-rate-mid">
              <span>{t("finalAtScale")}</span>
            </p>
            {onRequest ? (
              <div className="store-rate-ask">
                <button
                  type="button"
                  className="store-btn store-btn-ember"
                  onClick={onRequest}
                  aria-describedby="store-rate-ask-hint"
                >
                  {t("request")}
                </button>
                <span id="store-rate-ask-hint" className="sr-only">
                  {t("stripAsk")}
                </span>
              </div>
            ) : null}
          </div>
          {birds > 0 || trend ? (
            <p className="store-rate-foot">
              {birds > 0 ? (
                <span>
                  {birds.toLocaleString()} {t("proofBirdsWeek")}
                </span>
              ) : null}
              {trend ? (
                <em className="store-rate-trend" data-dir={trend.changePct >= 0 ? "up" : "down"}>
                  {trend.changePct >= 0 ? "▲" : "▼"}
                  {Math.abs(trend.changePct).toFixed(1)}% {t("vsLastWeek")}
                </em>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
