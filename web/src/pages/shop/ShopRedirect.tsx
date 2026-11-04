import { Navigate, useLocation } from "react-router-dom";
import { SHOP_PATH, legacyRedirectPath } from "../../lib/marketSections";

/** Older addresses (/raw, /live, /market/shop), including order links already sent to customers. */
export function ShopRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={legacyRedirectPath(pathname, search) ?? SHOP_PATH} replace />;
}
