import type { ShopCatalog, ShopQuote } from "../../api/shop.api";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { formatRwf } from "../../lib/formatRwf";
import type { ShopCart } from "./shopCart";
import { shopT } from "./shopCopy";

export function sizeLabel(min: number | null, max: number | null, locale: StoreLocale): string {
  if (min != null && max != null) return shopT(locale, "sizeRange", { min, max });
  if (min != null) return `${min}+ kg`;
  if (max != null) return `≤ ${max} kg`;
  return "";
}

function minimumText(locale: StoreLocale, catalog: ShopCatalog): string {
  const items = catalog.minOrderItems;
  const amount = formatRwf(catalog.minOrderRwf);
  if (items > 0 && catalog.minOrderRwf > 0) return shopT(locale, "minimum", { items, amount });
  if (items > 0) return shopT(locale, "minimumItems", { items });
  if (catalog.minOrderRwf > 0) return shopT(locale, "minimumAmount", { amount });
  return "";
}

/** The money box on the shop and checkout pages. */
export function ShopSummary({
  locale,
  catalog,
  cart,
  quote,
  loading,
}: {
  locale: StoreLocale;
  catalog: ShopCatalog;
  cart: ShopCart;
  quote: ShopQuote | null;
  loading: boolean;
}) {
  const t = (k: Parameters<typeof shopT>[1], v?: Record<string, string | number>) => shopT(locale, k, v);
  const minimum = minimumText(locale, catalog);

  if (cart.items.length === 0) {
    return (
      <div className="mt-2 space-y-2 text-sm text-[var(--store-muted)]">
        <p>{t("emptyCart")}</p>
        {minimum ? <p>{minimum}</p> : null}
      </div>
    );
  }
  if (!cart.sector) return <p className="mt-2 text-sm text-[var(--store-muted)]">{t("pickSectorFirst")}</p>;
  if (!quote) return <p className="mt-2 text-sm text-[var(--store-muted)]">{loading ? "…" : ""}</p>;

  if (!quote.ok) {
    return (
      <div className="mt-2 space-y-2 text-sm">
        <p className="text-[#9a3412]" role="alert">
          {quote.code === "below_minimum" && minimum ? minimum : quote.error}
        </p>
        {quote.subtotalRwf ? (
          <p className="text-[var(--store-muted)]">
            {t("subtotal")}: {formatRwf(quote.subtotalRwf)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <dl className={`mt-2 space-y-1 text-sm ${loading ? "opacity-60" : ""}`}>
      {quote.lines?.map((l) => (
        <div key={l.sku} className="flex justify-between gap-3">
          <dt className="text-[var(--store-muted)]">
            {l.qty} × {l.name}
          </dt>
          <dd>{formatRwf(l.lineTotalRwf)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-[var(--store-line)] pt-2">
        <dt>{t("subtotal")}</dt>
        <dd>{formatRwf(quote.subtotalRwf ?? 0)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>{t("delivery")}</dt>
        <dd>{quote.deliveryFeeRwf ? formatRwf(quote.deliveryFeeRwf) : t("free")}</dd>
      </div>
      <div className="flex justify-between gap-3 text-base font-semibold text-[var(--store-ink)]">
        <dt>{t("total")}</dt>
        <dd>{formatRwf(quote.totalRwf ?? 0)}</dd>
      </div>
      {quote.amountToFreeDeliveryRwf ? (
        <p className="pt-1 text-xs text-[var(--store-ember)]">
          {t("toFree", { amount: formatRwf(quote.amountToFreeDeliveryRwf) })}
        </p>
      ) : null}
    </dl>
  );
}
