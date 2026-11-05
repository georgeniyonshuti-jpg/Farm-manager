/**
 * BigChix kitchens: which kitchen takes a dish order, and what it is paid.
 * Pure: callers load the rows and pass the clock.
 *
 * A kitchen can take an order when it serves the place (its zone for delivery,
 * or it is the customer's chosen kitchen for pickup), is open now, is taking
 * orders, makes every dish in the order with none sold out today, and has room
 * under its limit of open orders. Kitchens that already declined are skipped.
 */

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Kigali weekday key ("mon"...), "HH:MM" and date "YYYY-MM-DD" for `now`. */
export function kigaliNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Kigali",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const weekday = String(parts.weekday || "").slice(0, 3).toLowerCase();
  return {
    day: WEEKDAY_KEYS.includes(weekday) ? weekday : "mon",
    time: `${hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Open at this Kigali day and time, by the kitchen's weekly hours. */
export function isKitchenOpen(hours, clock) {
  const h = hours?.[clock.day];
  if (!h || !h.open || !h.close) return false;
  return clock.time >= h.open && clock.time < h.close;
}

/**
 * Whether one kitchen can take this order, and why not.
 *
 * @param {object} kitchen  { id, status, takingOrders, hours, maxOpenOrders, openOrders, pickupEnabled,
 *                            zones: [{zoneId, priority}], dishes: [{productId, feeRwf, soldOutOn}] }
 * @param {object} need     { fulfilment: "delivery"|"pickup", zoneId?, pickupKitchenId?, productIds: string[] }
 * @param {object} clock    from kigaliNow()
 */
export function kitchenCanTake(kitchen, need, clock) {
  if (!kitchen || kitchen.status !== "active") return { ok: false, reason: "not_active" };
  if (need.fulfilment === "pickup") {
    if (kitchen.id !== need.pickupKitchenId) return { ok: false, reason: "not_chosen" };
    if (!kitchen.pickupEnabled) return { ok: false, reason: "no_pickup" };
  } else if (!(kitchen.zones || []).some((z) => z.zoneId === need.zoneId)) {
    return { ok: false, reason: "not_in_zone" };
  }
  if (!kitchen.takingOrders) return { ok: false, reason: "paused" };
  if (!isKitchenOpen(kitchen.hours, clock)) return { ok: false, reason: "closed" };
  const dishes = new Map((kitchen.dishes || []).map((d) => [d.productId, d]));
  for (const id of need.productIds || []) {
    const d = dishes.get(id);
    if (!d) return { ok: false, reason: "no_dish" };
    if (d.soldOutOn && d.soldOutOn === clock.date) return { ok: false, reason: "sold_out" };
  }
  if ((kitchen.openOrders ?? 0) >= (kitchen.maxOpenOrders ?? 10)) return { ok: false, reason: "full" };
  return { ok: true };
}

function zonePriority(kitchen, zoneId) {
  return (kitchen.zones || []).find((z) => z.zoneId === zoneId)?.priority ?? 100;
}

/**
 * The kitchen for this order: the first that can take it, lowest zone
 * priority first (ties by id, so the choice is stable). Null when none can.
 * `exclude` = kitchens that already declined this order.
 */
export function pickKitchen(kitchens, need, clock, exclude = []) {
  const skip = new Set(exclude);
  const ranked = (kitchens || [])
    .filter((k) => k && !skip.has(k.id))
    .sort(
      (a, b) =>
        zonePriority(a, need.zoneId) - zonePriority(b, need.zoneId) || String(a.id).localeCompare(String(b.id))
    );
  return ranked.find((k) => kitchenCanTake(k, need, clock).ok) ?? null;
}

/** The most useful reason no kitchen can take this order, for the customer. */
export function noKitchenMessage(kitchens, need, clock) {
  const reasons = new Set((kitchens || []).map((k) => kitchenCanTake(k, need, clock).reason));
  if (need.fulfilment === "pickup" && reasons.has("not_chosen") && reasons.size === 1) {
    return "Choose a kitchen to collect from.";
  }
  if (reasons.has("sold_out") || reasons.has("no_dish")) return "Some of these dishes are not available right now.";
  if (reasons.has("full")) return "Our kitchens are very busy. Try again in a few minutes.";
  if (reasons.has("closed") || reasons.has("paused")) return "Our kitchens are closed right now.";
  return "BigChix does not deliver here yet.";
}

/**
 * The kitchen's pay for this order: its fixed fee per dish times quantity.
 * Cleva's share is the rest of the dish subtotal. Delivery money is not
 * included: Cleva books and pays the rider.
 *
 * @param {Array<{ productId: string, qty: number, lineTotalRwf: number }>} lines
 * @param {Array<{ productId: string, feeRwf: number }>} dishes  the kitchen's dishes
 */
export function kitchenPayout(lines, dishes) {
  const fee = new Map((dishes || []).map((d) => [d.productId, d.feeRwf]));
  const withFees = (lines || []).map((l) => ({ ...l, partnerFeeRwf: fee.get(l.productId) ?? null }));
  if (withFees.some((l) => l.partnerFeeRwf === null)) return { ok: false, error: "This kitchen does not make every dish." };
  const subtotalRwf = withFees.reduce((s, l) => s + l.lineTotalRwf, 0);
  const payoutRwf = withFees.reduce((s, l) => s + l.partnerFeeRwf * l.qty, 0);
  return { ok: true, lines: withFees, payoutRwf, clevaShareRwf: subtotalRwf - payoutRwf };
}
