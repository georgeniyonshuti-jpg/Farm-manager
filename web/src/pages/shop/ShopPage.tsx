import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ShopComingSoon } from "./ShopComingSoon";
import { FRESH_SLUG, SHOP_CATEGORIES, categoryFromSlug, categoryPath, shopPath, type ShopCategory } from "../../lib/marketSections";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { formatRwf } from "../../lib/formatRwf";
import { clevaMarketWhatsapp, waMeHref } from "../../lib/marketWhatsapp";
import { fetchShopCatalog, quoteShopCart, shopPhotoSrc, type ShopCatalog, type ShopQuote } from "../../api/shop.api";
import {
  basketOfCategory,
  cartForCatalog,
  checkoutPath,
  loadCart,
  loadLastOrder,
  orderPath,
  qtyOf,
  saveCart,
  servedPlaces,
  setQty,
  whatsappOrderText,
  type Basket,
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


function catOf(p: ShopItem): ShopCategory {
  return p.category ?? "whole";
}

export function ShopPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: ShopCopyKey, v?: Record<string, string | number>) => shopT(locale, k, v);
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [error, setError] = useState("");
  const [carts, setCarts] = useState<Record<Basket, ShopCart>>(() => ({
    cooked: loadCart("cooked"),
    fresh: loadCart("fresh"),
  }));
  const lastOrder = useMemo(loadLastOrder, []);
  const { category: categorySlug } = useParams();
  const freshAll = (categorySlug || "").toLowerCase() === FRESH_SLUG;
  const category = categoryFromSlug(categorySlug);
  const { search } = useLocation();
  const preview = new URLSearchParams(search).has("preview");

  useEffect(() => {
    fetchShopCatalog({ preview })
      .then((c) => {
        setCatalog(c);
        setCarts((prev) => ({ cooked: cartForCatalog(prev.cooked, c), fresh: cartForCatalog(prev.fresh, c) }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the shop."));
  }, [preview]);

  useEffect(() => {
    saveCart(carts.cooked, "cooked");
    saveCart(carts.fresh, "fresh");
  }, [carts]);

  const products = catalog?.products ?? [];
  const places = catalog ? servedPlaces(catalog) : [];
  const shelves = SHOP_CATEGORIES.filter((c) => products.some((p) => catOf(p) === c.id));
  const cooked = products.filter((p) => catOf(p) === "cooked");
  // BigChix leads with its menu once there are dishes; until then the shop is fresh chicken.
  const menuFirst = cooked.length > 0;
  const onFresh = freshAll || (category !== null && category !== "cooked");
  const basket: Basket = menuFirst && !onFresh ? "cooked" : "fresh";
  const otherBasket: Basket = basket === "cooked" ? "fresh" : "cooked";
  const cart = carts[basket];
  const otherCount = carts[otherBasket].items.reduce((n, i) => n + i.qty, 0);
  const { quote, loading } = useShopQuote(cart);
  usePublicMeta(t(menuFirst && !onFresh ? "heroTitle" : onFresh ? "freshTitle" : "title"), t("heroNote"));

  function changeQty(p: ShopItem, qty: number) {
    const b = basketOfCategory(catOf(p));
    setCarts((prev) => ({ ...prev, [b]: setQty(prev[b], p.sku, qty) }));
  }
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

  const freshShelves = shelves.filter((c) => c.id !== "cooked");
  const shown = freshAll
    ? freshShelves
    : category
    ? shelves.filter((c) => c.id === category)
    : menuFirst
      ? shelves.filter((c) => c.id === "cooked")
      : shelves;
  const groups = shown.map((c) => ({ ...c, items: products.filter((p) => catOf(p) === c.id) }));
  const heroPhoto = shopPhotoSrc((cooked.find((p) => p.photoUrl) ?? products.find((p) => p.photoUrl))?.photoUrl);

  const extraClosedMessage =
    catalog?.closedMessage && !/^The shop is (closed for now|not open yet)\.?$/i.test(catalog.closedMessage.trim())
      ? catalog.closedMessage
      : "";

  function checkout() {
    if (canContinue) navigate(checkoutPath(basket));
    else document.getElementById("your-order")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function card(p: ShopItem) {
    const qty = qtyOf(carts[basketOfCategory(catOf(p))], p.sku);
    const orderable = p.orderable !== false;
    const name = locale === "rw" && p.nameRw ? p.nameRw : p.name;
    const description = locale === "rw" && p.descriptionRw ? p.descriptionRw : p.description;
    const size = sizeLabel(p.weightMinKg, p.weightMaxKg, locale);
    const photo = shopPhotoSrc(p.photoUrl);
    const cat = catOf(p);
    return (
      <li key={p.sku} className="sh-card">
        <div className="sh-card-media">
          {photo ? (
            <img src={photo} alt="" loading="lazy" />
          ) : (
            <span className={`sh-art sh-art--${cat}`} aria-hidden="true" />
          )}
        </div>
        <div className="sh-card-body">
          <p className="sh-card-name">{name}</p>
          {size || description ? <p className="sh-card-meta">{size || description}</p> : null}
          <div className="sh-card-foot">
            <span className="sh-price">{formatRwf(p.priceRwf)}</span>
            {qty === 0 ? (
              <button
                type="button"
                className="sh-add"
                aria-label={`${t("add")}: ${name}`}
                disabled={!catalog?.open || !orderable}
                title={orderable ? undefined : t("dishSoon")}
                onClick={() => changeQty(p, 1)}
              >
                <Plus size={20} strokeWidth={2.6} aria-hidden />
              </button>
            ) : (
              <span className="sh-qty">
                <button type="button" aria-label={t("less")} onClick={() => changeQty(p, qty - 1)}>
                  <Minus size={16} strokeWidth={2.6} aria-hidden />
                </button>
                <span aria-live="polite">{qty}</span>
                <button type="button" aria-label={t("more")} onClick={() => changeQty(p, qty + 1)}>
                  <Plus size={16} strokeWidth={2.6} aria-hidden />
                </button>
              </span>
            )}
          </div>
        </div>
      </li>
    );
  }

  // Nothing until the shop answers, so visitors never see the wrong page flash by.
  if (!catalog && !error) return <div className="store-wrap store-body sh-page" aria-busy="true" style={{ minHeight: "60vh" }} />;

  if (catalog && !preview && (catalog.closedReason === "closed" || products.length === 0)) {
    return <ShopComingSoon locale={locale} />;
  }

  const placePicker = (
    <label className="sh-place">
      <span>{t("deliverTo")}</span>
      <select
        value={placeValue}
        onChange={(e) => {
          const [district = "", sector = ""] = e.target.value.split("|");
          // One delivery place for both baskets.
          setCarts((prev) => ({ cooked: { ...prev.cooked, district, sector }, fresh: { ...prev.fresh, district, sector } }));
        }}
      >
        <option value="">{t("chooseSector")}</option>
        {places.map((p) => (
          <option key={p.value} value={p.value}>
            {p.sector} ({p.district})
          </option>
        ))}
        {places.length > 0 ? <option disabled>{t("notServedHint")}</option> : null}
      </select>
    </label>
  );

  return (
    <div className="store-wrap store-body sh-page">
      {lastOrder ? (
        <p className="sh-lastline">
          <Link className="sh-last" to={orderPath(lastOrder.ref, lastOrder.token)}>
            {t("lastOrder", { ref: lastOrder.ref })} →
          </Link>
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[var(--store-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {catalog && !catalog.open ? (
        <div className="sh-note">
          <p className="font-semibold">
            {preview && catalog.closedReason !== "hours" ? t("previewNote") : t("hoursClosed", { time: catalog.openTime ?? "08:00" })}
          </p>
          {extraClosedMessage ? <p className="mt-1 text-sm text-[var(--store-muted)]">{extraClosedMessage}</p> : null}
        </div>
      ) : null}

      {!category && !freshAll ? (
        <section className="sh-hero">
          {heroPhoto ? <img src={heroPhoto} alt="" className="sh-hero-img" /> : <span className="sh-hero-art" aria-hidden="true" />}
          <span className="sh-hero-shade" aria-hidden="true" />
          <div className="sh-hero-body">
            <span className="sh-kicker">{t("heroKicker")}</span>
            <h1 className="grill-display sh-hero-title">{t(menuFirst ? "heroTitle" : "title")}</h1>
            <p className="sh-hero-lead">{t("heroNote")}</p>
          </div>
        </section>
      ) : onFresh ? (
        <div className="sh-fresh-head">
          {menuFirst ? (
            <Link className="sh-back" to={categoryPath(null)}>
              ← {t("backToMenu")}
            </Link>
          ) : null}
          <h1 className="grill-display sh-fresh-title">{t("freshTitle")}</h1>
          <p className="sh-shelf-sub">{t("freshSub")}</p>
          {freshShelves.length > 1 ? (
            <nav className="sh-cats" aria-label={t("categoriesLabel")}>
              <Link to={shopPath(FRESH_SLUG)} className="sh-chip" aria-current={freshAll ? "page" : undefined}>
                {t("catAll")}
              </Link>
              {freshShelves.map((c) => (
                <Link key={c.id} to={categoryPath(c.id)} className="sh-chip" aria-current={category === c.id ? "page" : undefined}>
                  {t(CAT_LABEL[c.id])}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      ) : (
        <Link className="sh-back" to={categoryPath(null)}>
          ← {t("backToMenu")}
        </Link>
      )}

      {otherCount > 0 ? (
        <p className="sh-basket-note">
          {t(otherBasket === "fresh" ? "otherFresh" : "otherCooked", { n: otherCount })}{" "}
          <Link to={otherBasket === "fresh" ? shopPath(FRESH_SLUG) : shopPath()}>{t("openBasket")} →</Link>
        </p>
      ) : null}

      {catalog ? (
        <div className={itemCount > 0 ? "mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]" : "mt-6"}>
          <div className="space-y-9">
            {category && groups.length === 0 ? (
              <p className="text-sm text-[var(--store-muted)]">
                <Link className="sh-last" to={categoryPath(null)}>
                  {t("emptyCategory")}
                </Link>
              </p>
            ) : null}
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`shelf-${g.id}`}>
                {!onFresh || freshAll || freshShelves.length === 1 ? (
                  <div className="sh-shelf-head">
                    <h2 id={`shelf-${g.id}`} className="grill-display sh-shelf-title">
                      {g.id === "cooked" ? t("menuTitle") : t(CAT_LABEL[g.id])}
                    </h2>
                  </div>
                ) : (
                  <h2 id={`shelf-${g.id}`} className="sr-only">
                    {t(CAT_LABEL[g.id])}
                  </h2>
                )}
                <ul className="sh-grid">{g.items.map(card)}</ul>
              </section>
            ))}

            {menuFirst && !category && freshShelves.length > 0 ? (
              <p className="sh-fresh-line">
                {t("freshAsk")}{" "}
                <Link to={shopPath(FRESH_SLUG)} className="sh-fresh-go">
                  {t("freshLink")}
                  <ArrowRight size={15} strokeWidth={2.4} aria-hidden />
                </Link>
              </p>
            ) : null}
          </div>

          {itemCount > 0 ? (
            <aside id="your-order" className="sh-order h-fit lg:sticky lg:top-24">
              <p className="store-request-title">{t("yourOrder")}</p>
              {placePicker}
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
          ) : null}
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
