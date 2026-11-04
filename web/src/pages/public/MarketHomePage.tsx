import { useShopOpen } from "../../lib/useShopOpen";
import { ShopPage } from "../shop/ShopPage";
import { PublicMarketPage } from "./PublicMarketPage";

/** market.cleva.rw/ opens on Fresh chicken once the shop is open, else on Live birds. */
export function MarketHomePage() {
  const shopOpen = useShopOpen();
  if (shopOpen === null) return <div className="store-wrap store-body" aria-busy="true" />;
  return shopOpen ? <ShopPage /> : <PublicMarketPage />;
}
