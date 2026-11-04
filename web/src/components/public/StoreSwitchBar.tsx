import { Link, useLocation } from "react-router-dom";
import { SHOP_PATH, WHOLESALE_PATH, storePageFor } from "../../lib/marketSections";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { useShopOpen } from "../../lib/useShopOpen";
import { shopT } from "../../pages/shop/shopCopy";

/**
 * One slim line that sends people to the other side of the market:
 * shoppers see the way to wholesale, traders see the way to the shop.
 * Hidden until the shop is open, so the wholesale market looks as it always has.
 */
export function StoreSwitchBar({ locale }: { locale: StoreLocale }) {
  const { pathname } = useLocation();
  const shopOpen = useShopOpen();
  if (!shopOpen) return null;
  const page = storePageFor(pathname, true);
  if (!page) return null;
  const toWholesale = page === "shop";
  return (
    <div className="store-switch-bar">
      <div className="store-wrap store-switch-row">
        <span>{shopT(locale, toWholesale ? "wholesaleBarAsk" : "shopBarAsk")}</span>
        <Link to={toWholesale ? WHOLESALE_PATH : SHOP_PATH} className="store-switch-link">
          {shopT(locale, toWholesale ? "wholesaleBarLink" : "shopBarLink")} →
        </Link>
      </div>
    </div>
  );
}
