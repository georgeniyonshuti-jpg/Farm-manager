import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CART_EVENT, cartCount, checkoutPath, loadCart } from "../../pages/shop/shopCart";
import { shopT } from "../../pages/shop/shopCopy";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { shopPath } from "../../lib/marketSections";

/** Cart in the header on shop pages. Goes to checkout, which sends people back if the order is not ready. */
export function StoreCartButton({ locale }: { locale: StoreLocale }) {
  const counts = () => ({ cooked: cartCount(loadCart("cooked")), fresh: cartCount(loadCart("fresh")) });
  const [n, setN] = useState(counts);
  const count = n.cooked + n.fresh;
  useEffect(() => {
    const update = () => setN(counts());
    window.addEventListener(CART_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CART_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const label = `${shopT(locale, "cart")}, ${count}`;
  return (
    // One basket filled: straight to its checkout. Both: the shop, where each basket shows.
    <Link
      to={n.cooked > 0 && n.fresh === 0 ? checkoutPath("cooked") : n.fresh > 0 && n.cooked === 0 ? checkoutPath("fresh") : shopPath()}
      className="grill-cart-btn"
      aria-label={label}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 7h14l-1.5 11h-11z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      {count > 0 ? <span className="grill-cart-count">{count}</span> : null}
    </Link>
  );
}
