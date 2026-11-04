import { Link, useLocation } from "react-router-dom";
import { SHOP_PATH, WHOLESALE_PATH, storePageFor } from "../../lib/marketSections";
import type { StoreLocale } from "../../lib/publicStoreCopy";
import { useShopOpen } from "../../lib/useShopOpen";
import { shopT } from "../../pages/shop/shopCopy";

/**
 * One slim line that sends people to the other side of the market:
 * shoppers see the way to wholesale, traders see the way to the shop
 * (or that it is coming soon, while it is closed).
 */
export function StoreSwitchBar({ locale }: { locale: StoreLocale }) {
  const { pathname } = useLocation();
  const shopOpen = useShopOpen();
  if (shopOpen === null) return null;
  const page = storePageFor(pathname, shopOpen);
  if (!page) return null;
  const toWholesale = page === "shop";
  const ask = toWholesale ? "wholesaleBarAsk" : shopOpen ? "shopBarAsk" : "comingSoonBar";
  const link = toWholesale ? "wholesaleBarLink" : shopOpen ? "shopBarLink" : "comingSoonBarLink";
  return (
    <div className="store-switch-bar">
      <div className="store-wrap store-switch-row">
        <span>{shopT(locale, ask)}</span>
        <Link to={toWholesale ? WHOLESALE_PATH : SHOP_PATH} className="store-switch-link">
          {shopT(locale, link)} →
        </Link>
      </div>
    </div>
  );
}
