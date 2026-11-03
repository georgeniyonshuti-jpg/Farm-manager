/**
 * Butcher shop pricing. One function prices the cart page, checkout and the
 * stored order, so they never disagree. All money is integer RWF.
 * Commission is taken on the chicken subtotal only, never on delivery.
 */

export const MAX_QTY_PER_LINE = 50;

function int(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeProduct(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id ?? ""),
    sku: String(raw.sku ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    weightMinKg: numOrNull(raw.weightMinKg ?? raw.weight_min_kg),
    weightMaxKg: numOrNull(raw.weightMaxKg ?? raw.weight_max_kg),
    priceRwf: int(raw.priceRwf ?? raw.price_rwf, 0),
    active: (raw.active ?? true) !== false,
  };
}

export function normalizeZone(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    deliveryFeeRwf: Math.max(0, int(raw.deliveryFeeRwf ?? raw.delivery_fee_rwf, 0)),
    freeDeliveryOverRwf: (() => {
      const v = numOrNull(raw.freeDeliveryOverRwf ?? raw.free_delivery_over_rwf);
      return v === null ? null : Math.max(0, Math.round(v));
    })(),
  };
}

export function normalizeShopSettings(raw) {
  const pct = Number(raw?.commissionPct ?? raw?.commission_pct ?? 0);
  return {
    commissionPct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0,
    minOrderRwf: Math.max(0, int(raw?.minOrderRwf ?? raw?.min_order_rwf, 0)),
    minOrderItems: Math.max(0, int(raw?.minOrderItems ?? raw?.min_order_items, 0)),
  };
}

/**
 * The order meets the minimum when it reaches either the item count or the
 * amount. A rule set to 0 is off. Both off means no minimum.
 */
export function meetsMinimum(itemCount, subtotalRwf, settings) {
  const rules = [];
  if (settings.minOrderItems > 0) rules.push(itemCount >= settings.minOrderItems);
  if (settings.minOrderRwf > 0) rules.push(subtotalRwf >= settings.minOrderRwf);
  return rules.length === 0 || rules.some(Boolean);
}

export function commissionFor(subtotalRwf, commissionPct) {
  return Math.round((subtotalRwf * commissionPct) / 100);
}

/**
 * @param {{
 *   items: Array<{ sku?: string, productId?: string, qty: number }>,
 *   products: Array<object>,
 *   zone: object | null,
 *   settings: object,
 * }} input
 */
export function quoteShopOrder({ items, products, zone, settings }) {
  const cfg = normalizeShopSettings(settings);
  const catalog = (products || []).map(normalizeProduct).filter(Boolean);
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  const byId = new Map(catalog.map((p) => [p.id, p]));

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, code: "empty", error: "Add at least one item." };
  }

  const merged = new Map();
  for (const raw of items) {
    const product = (raw?.sku && bySku.get(String(raw.sku).trim())) || (raw?.productId && byId.get(String(raw.productId)));
    if (!product) return { ok: false, code: "unknown_product", error: "One item is no longer on sale." };
    if (!product.active) {
      return { ok: false, code: "inactive_product", error: `${product.name} is not available right now.` };
    }
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      return { ok: false, code: "bad_qty", error: "Quantity must be a whole number above 0." };
    }
    const nextQty = (merged.get(product.sku)?.qty ?? 0) + qty;
    if (nextQty > MAX_QTY_PER_LINE) {
      return { ok: false, code: "too_many", error: `At most ${MAX_QTY_PER_LINE} of one item per order.` };
    }
    merged.set(product.sku, { product, qty: nextQty });
  }

  const lines = [...merged.values()].map(({ product, qty }) => ({
    productId: product.id,
    sku: product.sku,
    name: product.name,
    weightMinKg: product.weightMinKg,
    weightMaxKg: product.weightMaxKg,
    unitPriceRwf: product.priceRwf,
    qty,
    lineTotalRwf: product.priceRwf * qty,
  }));
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotalRwf = lines.reduce((sum, l) => sum + l.lineTotalRwf, 0);

  const z = normalizeZone(zone);
  if (!z) {
    return { ok: false, code: "not_served", error: "We do not deliver to this sector yet.", lines, itemCount, subtotalRwf };
  }

  if (!meetsMinimum(itemCount, subtotalRwf, cfg)) {
    return {
      ok: false,
      code: "below_minimum",
      error: "This order is below the minimum.",
      lines,
      itemCount,
      subtotalRwf,
      minOrderRwf: cfg.minOrderRwf,
      minOrderItems: cfg.minOrderItems,
    };
  }

  const freeDelivery = z.freeDeliveryOverRwf !== null && subtotalRwf >= z.freeDeliveryOverRwf;
  const deliveryFeeRwf = freeDelivery ? 0 : z.deliveryFeeRwf;
  const deliveryPaidBy = deliveryFeeRwf > 0 ? "customer" : "cleva";
  const commissionRwf = commissionFor(subtotalRwf, cfg.commissionPct);
  const butcherPayoutRwf = subtotalRwf - commissionRwf + (deliveryPaidBy === "customer" ? deliveryFeeRwf : 0);
  const amountToFreeDeliveryRwf =
    z.freeDeliveryOverRwf !== null && !freeDelivery ? z.freeDeliveryOverRwf - subtotalRwf : null;

  return {
    ok: true,
    lines,
    itemCount,
    subtotalRwf,
    deliveryFeeRwf,
    totalRwf: subtotalRwf + deliveryFeeRwf,
    deliveryPaidBy,
    freeDeliveryOverRwf: z.freeDeliveryOverRwf,
    amountToFreeDeliveryRwf,
    commissionPct: cfg.commissionPct,
    commissionRwf,
    butcherPayoutRwf,
  };
}

/** What the customer may see. No commission and no butcher payout. */
export function publicQuoteView(quote) {
  if (!quote) return null;
  const { commissionPct, commissionRwf, butcherPayoutRwf, ...rest } = quote;
  return rest;
}
