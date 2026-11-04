import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { type PublicOutletCtx } from "../../components/public/PublicLayout";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { fetchShopCatalog, placeShopOrder, type ShopCatalog } from "../../api/shop.api";
import { loadCart, orderPath, saveCart, saveLastOrder } from "./shopCart";
import { shopT } from "./shopCopy";
import { ShopSummary } from "./ShopSummary";
import { useShopQuote } from "./ShopPage";

export function CheckoutPage() {
  const { locale } = useOutletContext<PublicOutletCtx>();
  const t = (k: Parameters<typeof shopT>[1], v?: Record<string, string | number>) => shopT(locale, k, v);
  usePublicMeta(t("checkoutTitle"), t("lead"));
  const navigate = useNavigate();
  const [cart] = useState(loadCart);
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(Date.now());
  const { quote, loading } = useShopQuote(cart);

  useEffect(() => {
    fetchShopCatalog()
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the shop."));
  }, []);

  if (cart.items.length === 0 || !cart.sector) return <Navigate to="/shop" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await placeShopOrder({
        customerName: name,
        phone,
        district: cart.district,
        sector: cart.sector,
        addressNote: address,
        items: cart.items,
        website,
        formStartedAt: startedAt.current,
      });
      saveLastOrder({ ref: r.ref, token: r.token });
      saveCart(null);
      navigate(orderPath(r.ref, r.token), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place this order.");
      setBusy(false);
    }
  }

  return (
    <div className="store-wrap store-body">
      <p className="mb-4 text-sm">
        <Link className="text-[var(--store-muted)] underline" to="/shop">
          ← {t("back")}
        </Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form
          className="store-form space-y-3 rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5 sm:p-6"
          onSubmit={(e) => void submit(e)}
        >
          <p className="store-request-title">{t("checkoutTitle")}</p>
          <p className="text-sm text-[var(--store-muted)]">
            {cart.sector} ({cart.district})
          </p>
          <label className="store-field">
            <span>
              {t("name")} <em className="store-required">*</em>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
          </label>
          <label className="store-field">
            <span>
              {t("phone")} <em className="store-required">*</em>
            </span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="07…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
            <span className="store-field-hint">{t("phoneHint")}</span>
          </label>
          <label className="store-field">
            <span>
              {t("address")} <em className="store-required">*</em>
            </span>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} required minLength={3} />
            <span className="store-field-hint">{t("addressHint")}</span>
          </label>
          {/* Left empty by people; bots fill it. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-px w-px opacity-0"
          />
          {error ? (
            <p className="text-sm text-[var(--store-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="store-btn store-btn-ember w-full" disabled={busy || !quote?.ok || !catalog?.open}>
            {busy ? t("placing") : t("placeOrder")}
          </button>
        </form>

        <aside className="h-fit rounded-3xl border border-[var(--store-line)] bg-[var(--store-card)] p-5">
          <p className="store-request-title">{t("yourOrder")}</p>
          {catalog ? <ShopSummary locale={locale} catalog={catalog} cart={cart} quote={quote} loading={loading} /> : null}
          {catalog && !catalog.open ? <p className="mt-3 text-sm text-[var(--store-danger)]">{catalog.closedMessage || t("closed")}</p> : null}
        </aside>
      </div>
    </div>
  );
}
