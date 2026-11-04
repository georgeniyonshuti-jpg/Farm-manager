/**
 * Butcher shop cart and last-order memory. Browser storage can be missing
 * (private windows, blocked site data), so every read and write is guarded
 * and the pages work without it.
 */

import type { CartItem, ShopCatalog } from "../../api/shop.api";
import { shopPath } from "../../lib/marketSections.ts";

const CART_KEY = "cleva_shop_cart_v1";
const LAST_ORDER_KEY = "cleva_shop_last_order_v1";

export type ShopCart = { items: CartItem[]; district: string; sector: string };
export type LastOrder = { ref: string; token: string };

export const EMPTY_CART: ShopCart = { items: [], district: "", sector: "" };

function read(storage: Storage | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: unknown) {
  try {
    if (value == null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the page still works for this visit */
  }
}

function session(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function local(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Keeps whole positive quantities only, one line per item. */
export function cleanCart(value: unknown): ShopCart {
  const v = (value ?? {}) as Partial<ShopCart>;
  const qty = new Map<string, number>();
  for (const item of Array.isArray(v.items) ? v.items : []) {
    const sku = typeof item?.sku === "string" ? item.sku : "";
    const n = Number(item?.qty);
    if (!sku || !Number.isInteger(n) || n <= 0) continue;
    qty.set(sku, (qty.get(sku) ?? 0) + n);
  }
  return {
    items: [...qty].map(([sku, n]) => ({ sku, qty: n })),
    district: typeof v.district === "string" ? v.district : "",
    sector: typeof v.sector === "string" ? v.sector : "",
  };
}

export function loadCart(): ShopCart {
  return cleanCart(read(session(), CART_KEY));
}

export const CART_EVENT = "cleva-cart";

export function saveCart(cart: ShopCart | null) {
  write(session(), CART_KEY, cart ? cleanCart(cart) : null);
  try {
    window.dispatchEvent(new Event(CART_EVENT));
  } catch {
    // No window (tests): nothing listens.
  }
}

export function cartCount(cart: ShopCart): number {
  return cart.items.reduce((n, i) => n + i.qty, 0);
}

export function setQty(cart: ShopCart, sku: string, qty: number): ShopCart {
  const rest = cart.items.filter((i) => i.sku !== sku);
  const n = Math.max(0, Math.min(50, Math.round(qty)));
  return { ...cart, items: n > 0 ? [...rest, { sku, qty: n }] : rest };
}

export function qtyOf(cart: ShopCart, sku: string): number {
  return cart.items.find((i) => i.sku === sku)?.qty ?? 0;
}

/** Drops items that are no longer on sale. */
export function cartForCatalog(cart: ShopCart, catalog: ShopCatalog): ShopCart {
  const skus = new Set(catalog.products.map((p) => p.sku));
  return { ...cart, items: cart.items.filter((i) => skus.has(i.sku)) };
}

/** Sectors the shop delivers to, as "District|Sector" values sorted by name. */
export function servedPlaces(catalog: ShopCatalog): Array<{ value: string; district: string; sector: string }> {
  const out = catalog.zones.flatMap((z) =>
    z.sectors.map((sector) => ({ value: `${z.district}|${sector}`, district: z.district, sector }))
  );
  return out.sort((a, b) => a.sector.localeCompare(b.sector) || a.district.localeCompare(b.district));
}

export function loadLastOrder(): LastOrder | null {
  const v = read(local(), LAST_ORDER_KEY) as Partial<LastOrder> | null;
  return v && typeof v.ref === "string" && typeof v.token === "string" ? { ref: v.ref, token: v.token } : null;
}

export function saveLastOrder(order: LastOrder | null) {
  write(local(), LAST_ORDER_KEY, order);
}

export function orderPath(ref: string, token: string): string {
  return `${shopPath(`order/${encodeURIComponent(ref)}`)}?t=${encodeURIComponent(token)}`;
}

/** The WhatsApp message for customers who would rather order by chat. */
export function whatsappOrderText(
  cart: ShopCart,
  products: { sku: string; name: string }[],
  words: { intro: string; deliverTo: string }
): string {
  const names = new Map(products.map((p) => [p.sku, p.name]));
  const lines = cart.items
    .filter((i) => i.qty > 0)
    .map((i) => `- ${i.qty} × ${names.get(i.sku) ?? i.sku}`);
  return [words.intro, ...lines, cart.sector ? words.deliverTo : ""].filter(Boolean).join("\n");
}
