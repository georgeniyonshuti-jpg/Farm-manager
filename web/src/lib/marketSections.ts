/**
 * Two front doors:
 * - shop.cleva.rw is BigChix, the food shop for homes (fresh chicken and hot food, one delivery),
 *   with short addresses: shop.cleva.rw, shop.cleva.rw/hot-and-ready, shop.cleva.rw/checkout, shop.cleva.rw/order/CK-…
 * - market.cleva.rw is the business market (live and dressed birds), behind a login.
 * Anywhere else (local dev) the shop lives under /shop.
 */

export type ShopCategory = "whole" | "cuts" | "prepared" | "cooked";

export const SHOP_HOST = "shop.cleva.rw";
/** Local stand-in for shop.cleva.rw (browsers send *.localhost to this machine). */
export const SHOP_DEV_HOST = "shop.localhost";
export const SHOP_PREFIX = "/shop";

/** Shelf order and the words used in links, e.g. shop.cleva.rw/skewers-and-more. */
export const SHOP_CATEGORIES: { id: ShopCategory; slug: string }[] = [
  { id: "cooked", slug: "hot-and-ready" },
  { id: "whole", slug: "whole-chicken" },
  { id: "cuts", slug: "cuts" },
  { id: "prepared", slug: "skewers-and-more" },
];

/** Earlier category words that still open the same shelf. */
const SLUG_ALIASES: Record<string, ShopCategory> = { "ready-to-eat": "cooked", bigchix: "cooked" };

export function isShopHostname(hostname: string): boolean {
  return hostname === SHOP_HOST || hostname === SHOP_DEV_HOST;
}

function currentHost(): string {
  return typeof window === "undefined" ? "" : window.location.hostname;
}

/** A shop page address: "/cuts" on the shop host, "/shop/cuts" anywhere else. */
export function shopPath(sub = "", host = currentHost()): string {
  const rest = sub.replace(/^\/+/, "");
  if (isShopHostname(host)) return `/${rest}`;
  return rest ? `${SHOP_PREFIX}/${rest}` : SHOP_PREFIX;
}

export function categoryFromSlug(slug: string | undefined): ShopCategory | null {
  const s = (slug || "").toLowerCase();
  return SHOP_CATEGORIES.find((c) => c.slug === s)?.id ?? SLUG_ALIASES[s] ?? null;
}

export function categoryPath(category: ShopCategory | null, host = currentHost()): string {
  const slug = SHOP_CATEGORIES.find((c) => c.id === category)?.slug;
  return shopPath(slug ?? "", host);
}

/**
 * Where an older shop address now lives on the shop host, as a path there.
 * Covers /shop/…, /raw/… and /market/shop/…, including order links already sent to customers.
 */
export function shopHostPath(pathname: string, search = ""): string | null {
  const m = pathname.match(/^\/(?:shop|raw|market\/shop)(\/.*)?$/);
  if (!m) return null;
  const rest = (m[1] || "").replace(/\/+$/, "");
  return `${rest || "/"}${search}`;
}

/** Old business-side addresses that are now the market home. */
export function isOldWholesalePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === "/wholesale" || path === "/live";
}

/** Shop pages under /shop (local dev, and old links before they move to the shop host). */
export function isShopPrefixPath(pathname: string): boolean {
  return shopHostPath(pathname) !== null;
}

/** Public pages that need no sign-in. */
export function isSectionPath(pathname: string): boolean {
  return isShopPrefixPath(pathname) || isOldWholesalePath(pathname);
}
