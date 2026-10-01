import { formatRwf, type FarmerQuote } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreOfferCard({
  quote,
  locale,
  compact = false,
}: {
  quote: FarmerQuote;
  locale: StoreLocale;
  compact?: boolean;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const f = quote.farmer;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--store-muted)]">{t("youReceive")}</p>
        <p className={`font-[var(--font-display)] font-extrabold tabular-nums tracking-[-0.02em] text-[var(--store-ink)] ${compact ? "text-3xl" : "text-4xl"}`}>
          {formatRwf(f.youReceiveRwf)}
        </p>
      </div>
      <ul className="space-y-1 text-sm text-[var(--store-ink-soft)]">
        <li className="flex justify-between gap-3">
          <span>{t("meatLine")}</span>
          <span className="tabular-nums">{formatRwf(f.meatRwf)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>
            {t("commissionLine")} ({f.commissionPct}%)
          </span>
          <span className="tabular-nums">−{formatRwf(f.commissionRwf)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>{t("processingLine")}</span>
          <span className="tabular-nums">{f.processingRwf ? `−${formatRwf(f.processingRwf)}` : formatRwf(0)}</span>
        </li>
      </ul>
      <p className="text-xs leading-relaxed text-[var(--store-muted)]">
        {t("finalAtScale")} {t("rateUntil")} {quote.validTo}.
      </p>
    </div>
  );
}
