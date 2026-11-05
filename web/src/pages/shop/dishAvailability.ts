/**
 * Whether a BigChix dish can really be ordered: some kitchen that makes it
 * today is open, and (once the customer chose) it reaches them, by delivery
 * to their zone or at the kitchen they collect from. Pure; tested.
 */

import type { ShopCatalog } from "../../api/shop.api";
import { placeKey } from "./placeKey.ts";

export type DishState = "available" | "closed" | "sold_out" | "not_here" | "soon";

export type DishContext = {
  /** The customer's zone, once they chose a place. */
  zoneId?: string | null;
  fulfilment?: "delivery" | "pickup";
  pickupKitchenId?: string;
};

type Catalog = Pick<ShopCatalog, "products" | "kitchens" | "zones">;

/** The delivery zone for a district and sector, or null. */
export function zoneIdFor(catalog: Catalog, district: string, sector: string): string | null {
  const d = placeKey(district);
  const s = placeKey(sector);
  if (!d || !s) return null;
  const z = catalog.zones.find((x) => placeKey(x.district) === d && x.sectors.map(placeKey).includes(s));
  return z?.id ?? null;
}

export function dishState(sku: string, catalog: Catalog, ctx: DishContext = {}): { state: DishState; opensAt?: string } {
  const product = catalog.products.find((p) => p.sku === sku);
  if (!product || product.orderable === false) return { state: "soon" };
  const kitchens = catalog.kitchens ?? [];
  if (kitchens.length === 0) return { state: "soon" };
  const making = kitchens.filter((k) => k.dishSkus.includes(sku));
  if (making.length === 0) return { state: "sold_out" };
  const open = making.filter((k) => k.open);
  if (open.length === 0) {
    const times = making.map((k) => k.opensAt).filter((t): t is string => Boolean(t)).sort();
    return times[0] ? { state: "closed", opensAt: times[0] } : { state: "closed" };
  }
  if (ctx.fulfilment === "pickup" && ctx.pickupKitchenId) {
    return open.some((k) => k.id === ctx.pickupKitchenId) ? { state: "available" } : { state: "not_here" };
  }
  if (ctx.fulfilment !== "pickup" && ctx.zoneId !== undefined && ctx.zoneId !== null) {
    return open.some((k) => k.zoneIds.includes(ctx.zoneId!)) ? { state: "available" } : { state: "not_here" };
  }
  return { state: "available" };
}

/** Kitchens open now that offer pickup and make every dish in the basket. */
export function pickupKitchensFor(catalog: Catalog, skus: string[]) {
  return (catalog.kitchens ?? []).filter((k) => k.pickup && k.open && skus.every((s) => k.dishSkus.includes(s)));
}

/** Whether any dish can be ordered somewhere right now. */
export function anyDishAvailable(catalog: Catalog): boolean {
  return catalog.products.some((p) => p.category === "cooked" && dishState(p.sku, catalog).state === "available");
}

/** The earliest time a closed kitchen opens later today, if any. */
export function kitchensOpenAt(catalog: Catalog): string | null {
  const times = (catalog.kitchens ?? []).map((k) => k.opensAt).filter((t): t is string => Boolean(t)).sort();
  return times[0] ?? null;
}
