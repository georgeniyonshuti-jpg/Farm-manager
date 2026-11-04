import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { SHOP_CATEGORIES, categoryFromSlug, categoryPath, type ShopCategory } from "../../lib/marketSections";
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
import { shopT, type ShopCopyKey } from "./shopCopy";
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

type ShopItem = ShopCatalog["products"][number];

const CAT_LABEL: Record<ShopCategory, ShopCopyKey> = {
  whole: "catWhole",
  cuts: "catCuts",
  prepared: "catPrepared",
  cooked: "catCooked",
};

const CAT_SUB: Record<ShopCategory, ShopCopyKey> = {
  whole: "catWholeSub",
  cuts: "catCutsSub",
  prepared: "catPreparedSub",
  cooked: "catCookedSub",
};

function catOf(p: ShopItem): ShopCategory {
  return p.category ?? "whole";
}

export function ShopPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: ShopCopyKey, v?: Record<string, string | number>) => shopT(locale, k, v);
  usePublicMeta(t("title"), t("lead"));
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<ShopCart>(loadCart);
  const lastOrder = useMemo(loadLastOrder, []);
  const { quote, loading } = useShopQuote(cart);
  const { category: categorySlug } = useParams();
  const category = categoryFromSlug(categorySlug);

  useEffect(() => {
    fetchShopCatalog()
      .then((c) => {
        setCatalog(c);
        setCart((prev) => cartForCatalog(prev, c));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the shop."));
  }, []);

  useEffect(() => saveCart(cart), [cart]);

  const products = catalog?.products ?? [];
  const places = catalog ? servedPlaces(catalog) : [];
  const shelves = SHOP_CATEGORIES.filter((c) => products.some((p) => catOf(p) === c.id));
  const cooked = products.filter((p) => catOf(p) === "cooked");
  const placeValue = cart.sector ? `${cart.district}|${cart.sector}` : "";
  const canContinue = Boolean(catalog?.open && quote?.ok);
  const itemCount = cart.items.reduce((n, i) => n + i.qty, 0);
  const waHref =
    catalog?.open && cart.items.length > 0
      ? waMeHref(
          clevaMarketWhatsapp(),
          whatsappOrderText(cart, products, {
            intro: t("waOrderIntro"),
            deliverTo: t("waDeliverTo", { sector: cart.sector, district: cart.district }),
          })
        )
      : null;

  const groups = (category ? shelves.filter((c) => c.id === category) : shelves).map((c) => ({
    ...c,
    items: products.filter((p) => catOf(p) === c.id),
  }));
  const heroCooked = !category && cooked.length > 0;
  const heroPhoto = shopPhotoSrc((heroCooked ? cooked : products).find((p) => p.photoUrl)?.photoUrl);

  function checkout() {
    if (canContinue) navigate("/shop/checkout");
    else document.getElementById("your-order")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function card(p: ShopItem) {
    const qty = qtyOf(cart, p.sku);
    const name = locale === "rw" && p.nameRw ? p.nameRw : p.name;
    const description = locale === "rw" && p.descriptionRw ? p.descriptionRw : p.description;
    const size = sizeLabel(p.weightMinKg, p.weightMaxKg, locale);
    const photo = shopPhotoSrc(p.photoUrl);
    return (
      <li key={p.sku} className="grill-card">
        {photo ? (
          <img src={photo} alt="" className="grill-card-photo" loading="lazy" />
        ) : (
          <span className="grill-card-photo" aria-hidden="true" />
        )}
        <div className="grill-card-body">
          <p className="font-bold leading-snug text-[var(--store-ink)]">{name}</p>
          {size ? <p className="text-xs text-[var(--store-muted)]">{size}</p> : null}
          {description ? <p className="text-xs leading-snug text-[var(--store-muted)]">{description}</p> : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
            <span className="grill-price">{formatRwf(p.priceRwf)}</span>
            {qty === 0 ? (
              <button
                type="button"
                className="grill-add"
                aria-label={`${t("add")}: ${name}`}
                disabled={!catalog?.open}
                onClick={() => setCart((prev) => setQty(prev, p.sku, 1))}
              >
                +
              </button>
            ) : (
              <span className="grill-qty">
                <button type="button" aria-label={t("less")} onClick={() => setCart((prev) => setQty(prev, p.sku, qty - 1))}>
                  −
                </button>
                <span className="min-w-5 text-center font-bold" aria-live="polite">
                  {qty}
                </span>
                <button type="button" aria-label={t("more")} onClick={() => setCart((prev) => setQty(prev, p.sku, qty + 1))}>
                  +
                </button>
              </span>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="store-wrap store-body pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="grill-place">
          <span>{t("deliverTo")}</span>
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
        </label>
        {lastOrder ? (
          <Link className="text-sm font-semibold text-[var(--grill-yellow)] underline" to={orderPath(lastOrder.ref, lastOrder.token)}>
            {t("lastOrder", { ref: lastOrder.ref })}
          </Link>
        ) : null}
      </div>
      {catalog && !cart.sector ? <p className="mt-2 text-xs text-[var(--store-muted)]">{t("notServedHint")}</p> : null}

      {error ? (
        <p className="mt-4 text-sm text-[var(--store-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {catalog && !catalog.open ? (
        <div className="mt-4 rounded-2xl border border-[var(--store-line)] bg-[var(--store-card)] p-4">
          <p className="font-semibold">{t("closed")}</p>
          {catalog.closedMessage ? <p className="mt-1 text-sm text-[var(--store-muted)]">{catalog.closedMessage}</p> : null}
        </div>
      ) : null}

      {!category ? (
        <Link to={heroCooked ? categoryPath("cooked") : categoryPath(shelves[0]?.id ?? null)} className="grill-hero mt-4">
          {heroPhoto ? <img src={heroPhoto} alt="" className="grill-hero-photo" /> : <span className="grill-hero-photo" aria-hidden="true" />}
          <span className="grill-hero-body block">
            <span className="grill-kicker block">{t(heroCooked ? "heroHotKicker" : "heroFreshKicker")}</span>
            <span className="grill-display grill-hero-title block">{t(heroCooked ? "heroHotTitle" : "title")}</span>
            <span className="mt-2 block text-sm text-[var(--store-ink-soft)]">{t("lead")}</span>
            <span className="grill-cta">{t(heroCooked ? "heroHotCta" : "heroFreshCta")} →</span>
          </span>
        </Link>
      ) : (
        <p className="mt-5">
          <Link to={categoryPath(null)} className="text-sm font-semibold text-[var(--store-muted)] underline">
            ← {t("catAll")}
          </Link>
        </p>
      )}

      {shelves.length > 1 ? (
        <nav className="mt-6" aria-label={t("categoriesLabel")}>
          <h2 className="grill-display text-2xl">{t("shopChicken")}</h2>
          <div className="grill-tiles mt-3">
            {shelves.map((c) => {
              const from = Math.min(...products.filter((p) => catOf(p) === c.id).map((p) => p.priceRwf));
              return (
                <Link
                  key={c.id}
                  to={categoryPath(c.id)}
                  className={`grill-tile grill-tile--${c.id}`}
                  aria-current={category === c.id ? "page" : undefined}
                >
                  <span className="grill-display grill-tile-name">{t(CAT_LABEL[c.id])}</span>
                  <span className="grill-tile-sub">{c.id === "cooked" ? t(CAT_SUB[c.id]) : t("fromPrice", { amount: formatRwf(from) })}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {catalog ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-7">
            {category && groups.length === 0 ? (
              <p className="text-sm text-[var(--store-muted)]">
                <Link className="font-semibold text-[var(--grill-yellow)] underline" to={categoryPath(null)}>
                  {t("emptyCategory")}
                </Link>
              </p>
            ) : null}
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`shelf-${g.id}`}>
                <h2 id={`shelf-${g.id}`} className="grill-display text-2xl">
                  {t(CAT_LABEL[g.id])}
                </h2>
                <ul className="grill-products mt-3">{g.items.map(card)}</ul>
              </section>
            ))}
          </div>

          <aside id="your-order" className="h-fit rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 lg:sticky lg:top-24">
            <p className="store-request-title">{t("yourOrder")}</p>
            <ShopSummary locale={locale} catalog={catalog} cart={cart} quote={quote} loading={loading} />
            <button type="button" className="store-btn store-btn-ember mt-4 w-full" disabled={!canContinue} onClick={checkout}>
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
        <p className="mt-6 text-sm text-[var(--store-muted)]">…</p>
      ) : null}

      {itemCount > 0 ? (
        <div className="grill-cartbar">
          <span>
            <strong>{t(itemCount === 1 ? "oneItem" : "nItems", { n: itemCount })}</strong>
            {quote?.ok && quote.totalRwf != null ? ` · ${formatRwf(quote.totalRwf)}` : ""}
          </span>
          <button type="button" onClick={checkout}>
            {t("checkout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
