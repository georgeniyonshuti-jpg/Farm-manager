import { butcherPayFromBoard, formatRwf, type MarketBoard } from "../../lib/marketQuote";
import { storeT, type StoreLocale } from "../../lib/publicStoreCopy";

export function StoreButcherPay({
  board,
  birds,
  avgKg,
  delivery,
  locale,
}: {
  board: MarketBoard;
  birds: number;
  avgKg: number;
  delivery?: boolean;
  locale: StoreLocale;
}) {
  const t = (k: Parameters<typeof storeT>[1]) => storeT(locale, k);
  const pay = butcherPayFromBoard(board, { birds, avgKg, delivery });
  if (!pay) return null;

  return (
    <div className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-paper)] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--store-muted)]">{t("youPay")}</p>
      <p className="font-[var(--font-display)] text-3xl font-extrabold tabular-nums text-[var(--store-ink)]">
        {formatRwf(pay.youPayRwf)}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--store-ink-soft)]">
        <li className="flex justify-between gap-3">
          <span>{t("meatLine")}</span>
          <span className="tabular-nums">{formatRwf(pay.meatRwf)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>{t("slaughterFee")}</span>
          <span className="tabular-nums">{formatRwf(pay.slaughterRwf)}</span>
        </li>
        {pay.deliveryRwf > 0 ? (
          <li className="flex justify-between gap-3">
            <span>{t("deliveryFee")}</span>
            <span className="tabular-nums">{formatRwf(pay.deliveryRwf)}</span>
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-xs text-[var(--store-muted)]">{t("indicativeUntilScale")}</p>
    </div>
  );
}
