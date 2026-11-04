import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { categoryFromSlug, shopHostPath, shopPath } from "../../lib/marketSections";
import { PrivacyPage } from "../public/PrivacyPage";
import { CheckoutPage } from "./CheckoutPage";
import { OrderTrackPage } from "./OrderTrackPage";
import { ShopLayout } from "./ShopLayout";
import { ShopPage } from "./ShopPage";

/** Older shop addresses (/shop/…, /raw/…, /market/shop/…), including order links already sent. */
export function OldShopAddress() {
  const { pathname, search } = useLocation();
  return <Navigate to={shopPath(shopHostPath(pathname, search) ?? "/")} replace />;
}

/** A category shelf; any other word goes to the shop front (or its old address). */
function ShopShelf() {
  const { category } = useParams();
  if (!categoryFromSlug(category)) return <OldShopAddress />;
  return <ShopPage />;
}

/** Everything on shop.cleva.rw. */
export function ShopRoutes() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route path="/" element={<ShopPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/:ref" element={<OrderTrackPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/:category" element={<ShopShelf />} />
      </Route>
      <Route path="*" element={<OldShopAddress />} />
    </Routes>
  );
}

/** The same shop under /shop, for local development and hosts other than shop.cleva.rw. */
export function shopRoutesUnderPrefix() {
  return (
    <Route path="/shop" element={<ShopLayout />}>
      <Route index element={<ShopPage />} />
      <Route path="checkout" element={<CheckoutPage />} />
      <Route path="order/:ref" element={<OrderTrackPage />} />
      <Route path=":category" element={<ShopShelf />} />
    </Route>
  );
}
