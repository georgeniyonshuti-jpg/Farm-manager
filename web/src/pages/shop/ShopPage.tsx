import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { formatRwf } from "../../lib/formatRwf";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import { fetchShopCatalog, quoteShopCart, shopPhotoSrc, type ShopCatalog, type ShopQuote } from "../../api/shop.api";
import {
  cartForCatalog,
  loadCart,
  loadLastOrder,
  orderPath,
  qtyOf,
  saveCart,
  servedPlaces,
  setQty,
  whatsappOrderText,
  type ShopCart,
} from "./shopCart";
import { shopT } from "./shopCopy";
import { ShopSummary, sizeLabel } from "./ShopSummary";

/** Prices the cart on the server, so the page and the order always agree. */
export function useShopQuote(cart: ShopCart) {
  const [quote, setQuote] = useState<ShopQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(cart);
  useEffect(() => {
    if (cart.items.length === 0 || !cart.sector) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      quoteShopCart(cart)
        .then((r) => !cancelled && setQuote(r.quote))
        .catch((e) => !cancelled && setQuote({ ok: false, error: e instanceof Error ? e.message : "Could not price this order." }))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quote, loading };
}

export function ShopPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: Parameters<typeof shopT>[1], v?: Record<string, string | number>) => shopT(locale, k, v);
  usePublicMeta(t("title"), t("lead"));
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<ShopCart>(loadCart);
  const lastOrder = useMemo(loadLastOrder, []);
  const { quote, loading } = useShopQuote(cart);

  useEffect(() => {
    fetchShopCatalog()
      .then((c) => {
        setCatalog(c);
        setCart((prev) => cartForCatalog(prev, c));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the shop."));
  }, []);

  useEffect(() => saveCart(cart), [cart]);

  const places = catalog ? servedPlaces(catalog) : [];
  const placeValue = cart.sector ? `${cart.district}|${cart.sector}` : "";
  const canContinue = Boolean(catalog?.open && quote?.ok);
  const waHref =
    catalog?.open && cart.items.length > 0
      ? waMeHref(
          clevaMarketWhatsapp(),
          whatsappOrderText(cart, catalog.products, {
            intro: t("waOrderIntro"),
            deliverTo: t("waDeliverTo", { sector: cart.sector, district: cart.district }),
          })
        )
      : null;

  return (
    <div>
      <section className="store-hero" id="store-hero-edge">
        <div className="store-wrap relative z-10 py-10 sm:py-14">
          <p className="store-kicker">{t("kicker")}</p>
          <h1 className="store-display mt-3 max-w-3xl">{t("title")}</h1>
          <p className="store-hero-lead max-w-xl">{t("lead")}</p>
        </div>
      </section>

      <div className="store-wrap store-body">
        {lastOrder ? (
          <p className="mb-4 text-sm">
            <Link className="font-semibold text-[var(--store-ember)] underline" to={orderPath(lastOrder.ref, lastOrder.token)}>
              {t("lastOrder", { ref: lastOrder.ref })}
            </Link>
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-[#9a3412]" role="alert">
            {error}
          </p>
        ) : null}

        {catalog && !catalog.open ? (
          <div className="mb-6 rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-4">
            <p className="font-semibold text-[var(--store-ink)]">{t("closed")}</p>
            {catalog.closedMessage ? <p className="mt-1 text-sm text-[var(--store-muted)]">{catalog.closedMessage}</p> : null}
          </div>
        ) : null}

        {catalog ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-4">
              <label className="store-field max-w-md">
                <span>{t("yourSector")}</span>
                <select
                  value={placeValue}
                  onChange={(e) => {
                    const [district = "", sector = ""] = e.target.value.split("|");
                    setCart((prev) => ({ ...prev, district, sector }));
                  }}
                >
                  <option value="">{t("chooseSector")}</option>
                  {places.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.sector} ({p.district})
                    </option>
                  ))}
                </select>
                <span className="store-field-hint">{t("notServedHint")}</span>
              </label>

              <ul className="grid gap-3 sm:grid-cols-2">
                {catalog.products.map((p) => {
                  const qty = qtyOf(cart, p.sku);
                  const name = locale === "rw" && p.nameRw ? p.nameRw : p.name;
                  const description = locale === "rw" && p.descriptionRw ? p.descriptionRw : p.description;
                  const size = sizeLabel(p.weightMinKg, p.weightMaxKg, locale);
                  return (
                    <li key={p.sku} className="rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-4">
                      {p.photoUrl ? (
                        <img src={shopPhotoSrc(p.photoUrl) ?? undefined} alt="" className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" />
                      ) : null}
                      <p className="font-semibold text-[var(--store-ink)]">{name}</p>
                      {size ? <p className="text-sm text-[var(--store-muted)]">{size}</p> : null}
                      {description ? <p className="mt-1 text-sm text-[var(--store-muted)]">{description}</p> : null}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="font-semibold text-[var(--store-ink)]">
                          {formatRwf(p.priceRwf)} <span className="text-xs font-normal text-[var(--store-muted)]">{t("each")}</span>
                        </p>
                        {qty === 0 ? (
                          <button
                            type="button"
                            className="store-btn store-btn-ink"
                            disabled={!catalog.open}
                            onClick={() => setCart((prev) => setQty(prev, p.sku, 1))}
                          >
                            {t("add")}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="store-btn store-btn-ghost"
                              aria-label={t("less")}
                              onClick={() => setCart((prev) => setQty(prev, p.sku, qty - 1))}
                            >
                              −
                            </button>
                            <span className="min-w-6 text-center font-semibold" aria-live="polite">
                              {qty}
                            </span>
                            <button
                              type="button"
                              className="store-btn store-btn-ghost"
                              aria-label={t("more")}
                              onClick={() => setCart((prev) => setQty(prev, p.sku, qty + 1))}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className="h-fit rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 lg:sticky lg:top-24">
              <p className="store-request-title">{t("yourOrder")}</p>
              <ShopSummary locale={locale} catalog={catalog} cart={cart} quote={quote} loading={loading} />
              <button
                type="button"
                className="store-btn store-btn-ember mt-4 w-full"
                disabled={!canContinue}
                onClick={() => navigate("/raw/checkout")}
              >
                {t("continue")}
              </button>
              {waHref ? (
                <a className="store-wa-order" href={waHref} target="_blank" rel="noreferrer">
                  {t("orderOnWhatsapp")}
                </a>
              ) : null}
            </aside>
          </div>
        ) : !error ? (
          <p className="text-sm text-[var(--store-muted)]">…</p>
        ) : null}
      </div>
    </div>
  );
}
