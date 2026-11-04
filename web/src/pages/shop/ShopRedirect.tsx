import { Navigate, useLocation } from "react-router-dom";
import { RAW_PATH, shopRedirectPath } from "../../lib/marketSections";

/** Old /market/shop… links, including order links already sent to customers. */
export function ShopRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={shopRedirectPath(pathname, search) ?? RAW_PATH} replace />;
}
