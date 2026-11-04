/**
 * market.cleva.rw is organised by why people buy:
 * Shop chicken (/shop, for homes) and Wholesale and supply (/wholesale, the farm market).
 * Older addresses (/raw, /live, /market/shop) redirect; /market stays the wholesale board.
 */

export type ShopCategory = "whole" | "cuts" | "prepared" | "cooked";

export const SHOP_PATH = "/shop";
export const WHOLESALE_PATH = "/wholesale";

/** Shelf order and the words used in links, e.g. /shop/skewers-and-more. */
export const SHOP_CATEGORIES: { id: ShopCategory; slug: string }[] = [
  { id: "whole", slug: "whole-chicken" },
  { id: "cuts", slug: "cuts" },
  { id: "prepared", slug: "skewers-and-more" },
  { id: "cooked", slug: "ready-to-eat" },
];

export function categoryFromSlug(slug: string | undefined): ShopCategory | null {
  return SHOP_CATEGORIES.find((c) => c.slug === slug)?.id ?? null;
}

export function categoryPath(category: ShopCategory | null): string {
  const slug = SHOP_CATEGORIES.find((c) => c.id === category)?.slug;
  return slug ? `${SHOP_PATH}/${slug}` : SHOP_PATH;
}

/** Where an older address now lives. Null when it is not an old address. */
export function legacyRedirectPath(pathname: string, search = ""): string | null {
  const shop = pathname.match(/^\/(?:raw|market\/shop)(\/.*)?$/);
  if (shop) return `${SHOP_PATH}${(shop[1] || "").replace(/\/+$/, "")}${search}`;
  if (pathname.replace(/\/+$/, "") === "/live") return `${WHOLESALE_PATH}${search}`;
  return null;
}

export type StorePage = "shop" | "wholesale" | null;

/** Which side of the market a page belongs to, for the switch bar. Checkout and order pages get none. */
export function storePageFor(pathname: string, shopOpen: boolean): StorePage {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return shopOpen ? "shop" : "wholesale";
  if (path === WHOLESALE_PATH || path === "/market") return "wholesale";
  if (path === SHOP_PATH) return "shop";
  const m = path.match(/^\/shop\/([^/]+)$/);
  if (m && categoryFromSlug(m[1])) return "shop";
  return null;
}

/** Public pages that need no sign-in. */
export function isSectionPath(pathname: string): boolean {
  return (
    pathname === SHOP_PATH ||
    pathname.startsWith(`${SHOP_PATH}/`) ||
    pathname === WHOLESALE_PATH ||
    pathname === "/live" ||
    pathname === "/raw" ||
    pathname.startsWith("/raw/")
  );
}
