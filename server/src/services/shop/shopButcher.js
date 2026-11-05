/**
 * Butcher side of shop orders: the butcher's own list, and the accept /
 * ready / out / delivered steps. Ops can take the same steps and reassign.
 * Each change is one SQL statement (dbQuery is a pool).
 */

import { isAcceptLate, nextShopOrderStatus } from "./orderStatus.js";

const STAMP_COLUMN = {
  acceptedAt: "accepted_at",
  readyAt: "ready_at",
  outAt: "out_at",
  deliveredAt: "delivered_at",
};

const STEP_ACTIONS = ["accept", "ready", "out", "delivered"];

/** Days after delivery that the butcher still sees the customer's phone and directions. */
export const CONTACT_DAYS_AFTER_DELIVERY = 7;

function fail(status, error) {
  return { ok: false, status, error };
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01") return fail(503, "The shop is not set up in the database yet.");
  return fail(500, e instanceof Error ? e.message : fallback);
}

/** The shop this login belongs to. Ended shops see nothing. */
export async function loadButcherForUser(dbQuery, userId) {
  if (!userId) return null;
  const r = await dbQuery(
    `SELECT id::text, shop_name AS "shopName", status
       FROM shop_butchers
      WHERE user_id = $1::uuid AND kind = 'butcher' AND status IN ('active', 'paused', 'pending')
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Whether the butcher may still see who the customer is. Open orders yes;
 * delivered orders for a week; cancelled orders never.
 */
export function butcherSeesContact(order, now = new Date()) {
  if (["paid", "accepted", "ready", "out_for_delivery"].includes(order.status)) return true;
  if (!order.deliveredAt) return false;
  const age = now.getTime() - new Date(order.deliveredAt).getTime();
  return age <= CONTACT_DAYS_AFTER_DELIVERY * 24 * 60 * 60 * 1000;
}

/** What one order looks like to its butcher. No commission, no Cleva margin. */
export function butcherOrderView(row, acceptWithinMinutes, now = new Date()) {
  const contact = butcherSeesContact(row, now);
  return {
    id: row.id,
    ref: row.ref,
    status: row.status,
    placedAt: row.placedAt,
    paidConfirmedAt: row.paidConfirmedAt,
    acceptedAt: row.acceptedAt,
    readyAt: row.readyAt,
    outAt: row.outAt,
    deliveredAt: row.deliveredAt,
    district: row.district,
    sector: row.sector,
    customerName: contact ? row.customerName : null,
    customerPhone: contact ? row.customerPhone : null,
    addressNote: contact ? row.addressNote : null,
    lines: row.lines || [],
    deliveryFeeRwf: row.deliveryFeeRwf,
    deliveryPaidBy: row.deliveryPaidBy,
    butcherPayoutRwf: row.butcherPayoutRwf,
    acceptLate: isAcceptLate(row, acceptWithinMinutes, now),
  };
}

export async function listButcherOrders(dbQuery, butcher, now = new Date()) {
  try {
    const r = await dbQuery(
      `SELECT o.id::text, o.ref, o.status, o.placed_at AS "placedAt", o.paid_confirmed_at AS "paidConfirmedAt",
              o.accepted_at AS "acceptedAt", o.ready_at AS "readyAt", o.out_at AS "outAt",
              o.delivered_at AS "deliveredAt", o.district, o.sector,
              o.customer_name AS "customerName", o.customer_phone AS "customerPhone", o.address_note AS "addressNote",
              o.delivery_fee_rwf AS "deliveryFeeRwf", o.delivery_paid_by AS "deliveryPaidBy",
              o.butcher_payout_rwf AS "butcherPayoutRwf", s.accept_within_minutes AS "acceptWithin",
              COALESCE((SELECT json_agg(json_build_object(
                          'name', l.name, 'qty', l.qty, 'weightMinKg', l.weight_min_kg, 'weightMaxKg', l.weight_max_kg)
                          ORDER BY l.name)
                          FROM shop_order_lines l WHERE l.order_id = o.id), '[]'::json) AS lines
         FROM shop_orders o CROSS JOIN shop_settings s
        WHERE s.id = 1
          AND o.butcher_id = $1::uuid
          AND (o.status IN ('paid', 'accepted', 'ready', 'out_for_delivery')
               OR (o.status IN ('delivered', 'problem', 'resolved') AND o.delivered_at > now() - interval '7 days'))
        ORDER BY CASE o.status WHEN 'paid' THEN 0 WHEN 'accepted' THEN 1 WHEN 'ready' THEN 2
                               WHEN 'out_for_delivery' THEN 3 ELSE 4 END,
                 COALESCE(o.paid_confirmed_at, o.placed_at)
        LIMIT 100`,
      [butcher.id]
    );
    const orders = r.rows.map((row) => butcherOrderView(row, Number(row.acceptWithin) || 20, now));
    return { ok: true, shopName: butcher.shopName, shopStatus: butcher.status, orders };
  } catch (e) {
    return dbError(e, "Could not load your orders.");
  }
}

/**
 * One step on an order. `actor.kind` is "butcher" (with butcherId) or "ops".
 * A butcher acting on another shop's order gets "not found".
 */
export async function applyOrderStep(dbQuery, orderId, action, actor, audit) {
  if (!STEP_ACTIONS.includes(action)) return fail(400, "Unknown step.");
  try {
    const r = await dbQuery(
      `SELECT id::text, status, butcher_id::text AS "butcherId" FROM shop_orders WHERE id = $1::uuid`,
      [orderId]
    );
    const order = r.rows[0];
    if (!order) return fail(404, "Order not found.");
    const step = nextShopOrderStatus(order, action, actor);
    if (!step.ok) return fail(step.code === "not_found" ? 404 : step.code === "forbidden" ? 403 : 409, step.error);
    const column = STAMP_COLUMN[step.stamp];
    const w = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = $2, ${column} = now(), updated_at = now()
          WHERE id = $1::uuid AND status = $3 AND butcher_id = $4::uuid
          RETURNING id
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status)
         SELECT id, $5::uuid, $6, $3, $2 FROM o
       )
       SELECT id::text FROM o`,
      [orderId, step.to, order.status, order.butcherId, actor.userId || null, action]
    );
    if (!w.rows[0]) return fail(409, "This order changed. Refresh the page.");
    audit?.(`shop.order.${action}`, orderId, { by: actor.kind });
    return { ok: true, status: step.to };
  } catch (e) {
    return dbError(e, "Could not update the order.");
  }
}

/**
 * Ops moves an order to another active butcher. The new butcher starts from
 * "paid" and must accept it themselves.
 */
export async function reassignOrder(dbQuery, orderId, butcherId, actor) {
  try {
    const [orderR, butcherR] = await Promise.all([
      dbQuery(`SELECT id::text, status, butcher_id::text AS "butcherId" FROM shop_orders WHERE id = $1::uuid`, [orderId]),
      dbQuery(`SELECT id::text, status, shop_name AS "shopName" FROM shop_butchers WHERE id = $1::uuid AND kind = 'butcher'`, [butcherId]),
    ]);
    const order = orderR.rows[0];
    const butcher = butcherR.rows[0];
    if (!order) return fail(404, "Order not found.");
    if (!butcher || butcher.status !== "active") return fail(400, "Choose an active butcher.");
    if (order.butcherId === butcher.id) return fail(400, "That butcher already has this order.");
    const step = nextShopOrderStatus(order, "assign", { kind: "ops" }, { butcherId });
    if (!step.ok) return fail(409, step.error);
    const w = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = 'paid', butcher_id = $2::uuid, accepted_at = NULL, ready_at = NULL, updated_at = now()
          WHERE id = $1::uuid AND status = $3
          RETURNING id
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
         SELECT id, $4::uuid, 'assign', $3, 'paid', $5 FROM o
       )
       SELECT id::text FROM o`,
      [orderId, butcher.id, order.status, actor.userId, `To ${butcher.shopName}`]
    );
    if (!w.rows[0]) return fail(409, "This order changed. Refresh the list.");
    actor.audit?.(actor.userId, actor.role, "shop.order.assign", "shop_order", orderId, { butcherId });
    return { ok: true, status: "paid", butcherId: butcher.id, butcherName: butcher.shopName };
  } catch (e) {
    return dbError(e, "Could not reassign the order.");
  }
}
