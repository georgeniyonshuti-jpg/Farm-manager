/**
 * BigChix dish orders in the database: loading kitchens, giving a paid order
 * to a kitchen (with its fees), a kitchen declining, and orders that waited
 * too long moving on. The rules themselves live in kitchenRouting.js.
 */

import { kigaliNow, kitchenPayout, pickKitchen } from "./kitchenRouting.js";

function fail(status, error, code) {
  return { ok: false, status, error, ...(code ? { code } : {}) };
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01" || String(e?.code) === "42703") {
    return fail(503, "Kitchens are not set up in the database yet.");
  }
  return fail(500, e instanceof Error ? e.message : fallback);
}

/** Kitchens with their settings, dishes, zones and how many open orders each has now. */
export async function loadKitchens(dbQuery) {
  const [kitchens, links, dishes, open] = await Promise.all([
    dbQuery(
      `SELECT b.id::text, b.shop_name AS "name", b.status, b.district, b.sector,
              COALESCE(s.hours, '{}'::jsonb) AS hours, COALESCE(s.prep_minutes, 25) AS "prepMinutes",
              COALESCE(s.max_open_orders, 10) AS "maxOpenOrders", COALESCE(s.taking_orders, false) AS "takingOrders",
              COALESCE(s.pickup_enabled, false) AS "pickupEnabled", COALESCE(s.pickup_address, '') AS "pickupAddress",
              COALESCE(s.pickup_directions, '') AS "pickupDirections"
         FROM shop_butchers b LEFT JOIN shop_kitchen_settings s ON s.partner_id = b.id
        WHERE b.kind = 'kitchen'`
    ),
    dbQuery(
      `SELECT l.butcher_id::text AS "kitchenId", l.zone_id::text AS "zoneId", l.priority
         FROM shop_butcher_zones l JOIN shop_butchers b ON b.id = l.butcher_id
        WHERE b.kind = 'kitchen'`
    ),
    dbQuery(
      `SELECT partner_id::text AS "kitchenId", product_id::text AS "productId", fee_rwf AS "feeRwf",
              sold_out_on::text AS "soldOutOn"
         FROM shop_kitchen_dishes`
    ),
    dbQuery(
      `SELECT butcher_id::text AS "kitchenId", count(*)::int AS n
         FROM shop_orders
        WHERE channel = 'kitchen' AND butcher_id IS NOT NULL
          AND status IN ('paid', 'accepted', 'ready', 'out_for_delivery')
        GROUP BY butcher_id`
    ),
  ]);
  const openBy = new Map(open.rows.map((r) => [r.kitchenId, r.n]));
  return kitchens.rows.map((k) => ({
    ...k,
    zones: links.rows.filter((l) => l.kitchenId === k.id).map((l) => ({ zoneId: l.zoneId, priority: l.priority })),
    dishes: dishes.rows.filter((d) => d.kitchenId === k.id),
    openOrders: openBy.get(k.id) ?? 0,
  }));
}

async function loadKitchenOrder(dbQuery, orderId) {
  const r = await dbQuery(
    `SELECT o.id::text, o.status, o.channel, o.fulfilment, o.zone_id::text AS "zoneId",
            o.butcher_id::text AS "kitchenId", o.declined_partner_ids::text[] AS declined,
            COALESCE((SELECT json_agg(json_build_object(
                        'id', l.id::text, 'productId', l.product_id::text, 'qty', l.qty,
                        'lineTotalRwf', l.line_total_rwf))
                        FROM shop_order_lines l WHERE l.order_id = o.id), '[]'::json) AS lines
       FROM shop_orders o WHERE o.id = $1::uuid`,
    [orderId]
  );
  return r.rows[0] || null;
}

/**
 * Gives a paid dish order to a kitchen and stores what that kitchen is paid.
 * Delivery: the first kitchen that can take it. Pickup: the kitchen the
 * customer chose, unless it declined. No kitchen: the order stays paid with
 * nobody on it, for Cleva staff to refund or call the customer.
 */
export async function routeKitchenOrder(dbQuery, orderId, { now = new Date(), actorUserId = null, note = null } = {}) {
  const o = await loadKitchenOrder(dbQuery, orderId);
  if (!o || o.channel !== "kitchen" || o.status !== "paid") return { ok: false, kitchenId: null };
  const declined = o.declined || [];
  const kitchens = await loadKitchens(dbQuery);
  const need = {
    fulfilment: o.fulfilment,
    zoneId: o.zoneId,
    pickupKitchenId: o.kitchenId,
    productIds: [...new Set(o.lines.map((l) => l.productId))],
  };
  // A pickup order is already at its kitchen; payment can land after hours, so it is not re-checked here.
  const kitchen =
    o.fulfilment === "pickup"
      ? kitchens.find((k) => k.id === o.kitchenId && !declined.includes(k.id)) ?? null
      : pickKitchen(kitchens, need, kigaliNow(now), declined);
  const pay = kitchen ? kitchenPayout(o.lines, kitchen.dishes) : null;

  if (!kitchen || !pay?.ok) {
    await dbQuery(
      `WITH o AS (
         UPDATE shop_orders SET butcher_id = NULL, updated_at = now()
          WHERE id = $1::uuid AND status = 'paid' RETURNING id
       )
       INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
       SELECT id, $2::uuid, 'assign', 'paid', 'paid', $3 FROM o`,
      [orderId, actorUserId, note || "No kitchen can take this order. Call the customer or refund."]
    );
    return { ok: true, kitchenId: null };
  }

  await dbQuery(
    `WITH o AS (
       UPDATE shop_orders
          SET butcher_id = $2::uuid, butcher_payout_rwf = $3, commission_rwf = $4, updated_at = now()
        WHERE id = $1::uuid AND status = 'paid'
        RETURNING id
     ),
     l AS (
       UPDATE shop_order_lines ol SET partner_fee_rwf = t.fee
         FROM unnest($5::uuid[], $6::int[]) AS t(line_id, fee)
        WHERE ol.id = t.line_id AND ol.order_id IN (SELECT id FROM o)
     )
     INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
     SELECT id, $7::uuid, 'assign', 'paid', 'paid', $8 FROM o`,
    [
      orderId,
      kitchen.id,
      pay.payoutRwf,
      pay.clevaShareRwf,
      pay.lines.map((l) => l.id),
      pay.lines.map((l) => l.partnerFeeRwf),
      actorUserId,
      note || `Sent to ${kitchen.name}`,
    ]
  );
  return { ok: true, kitchenId: kitchen.id, kitchenName: kitchen.name };
}

/**
 * The assigned kitchen says no (or the system says no for it, when it waited
 * too long). It is never offered this order again; the order moves on.
 */
export async function declineKitchenOrder(dbQuery, orderId, kitchenId, { now = new Date(), actorUserId = null, reason = "" } = {}) {
  try {
    const r = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET declined_partner_ids = array_append(declined_partner_ids, $2::uuid), updated_at = now()
          WHERE id = $1::uuid AND channel = 'kitchen' AND status = 'paid' AND butcher_id = $2::uuid
          RETURNING id
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
         SELECT id, $3::uuid, 'decline', 'paid', 'paid', $4 FROM o
       )
       SELECT id::text FROM o`,
      [orderId, kitchenId, actorUserId, reason || null]
    );
    if (!r.rows[0]) return fail(409, "This order is no longer waiting for you. Refresh the page.");
    const next = await routeKitchenOrder(dbQuery, orderId, { now, actorUserId });
    return { ok: true, status: "paid", nextKitchenId: next.kitchenId };
  } catch (e) {
    return dbError(e, "Could not decline the order.");
  }
}

/**
 * Paid dish orders a kitchen has not accepted in time move to the next
 * kitchen. Runs whenever orders are listed; there is no background timer.
 */
export async function sweepLateKitchenOrders(dbQuery, now = new Date()) {
  try {
    const late = await dbQuery(
      `SELECT o.id::text, o.butcher_id::text AS "kitchenId"
         FROM shop_orders o CROSS JOIN shop_settings s
        WHERE s.id = 1 AND o.channel = 'kitchen' AND o.status = 'paid' AND o.butcher_id IS NOT NULL
          AND o.updated_at < $1::timestamptz - make_interval(mins => s.kitchen_accept_within_minutes)
        LIMIT 50`,
      [now.toISOString()]
    );
    for (const o of late.rows) {
      await declineKitchenOrder(dbQuery, o.id, o.kitchenId, { now, reason: "Not accepted in time" });
    }
    return late.rows.length;
  } catch {
    // Before the kitchen migration, or a passing error: listing orders must still work.
    return 0;
  }
}
