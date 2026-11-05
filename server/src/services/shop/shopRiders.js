/**
 * BigChix riders: the saved list, booking a rider for a dish order, and paying
 * riders their fares. Cleva books by hand for now (call or WhatsApp, then
 * record it here); a rider app can replace that step later.
 * Every write is one SQL statement because dbQuery is a pool.
 */

import { normalizeRwandaPhone, rwandaPhoneError } from "../pipeline/rwandaPhone.js";

function fail(status, error) {
  return { ok: false, status, error };
}

function bad(error) {
  return fail(400, error);
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01" || String(e?.code) === "42703") return fail(503, "Riders are not set up in the database yet.");
  return fail(500, e instanceof Error ? e.message : fallback);
}

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/** Orders a rider can still be booked or changed for: a kitchen has it, nobody has left yet. */
export const BOOKABLE_STATUSES = ["paid", "accepted", "ready"];

/** The most a single trip fare may be, to catch typing mistakes (an extra zero). */
export const MAX_FARE_RWF = 20000;

export function riderFromBody(body) {
  const name = str(body?.name, 80);
  if (name.length < 2) return bad("Rider name is required.");
  const phoneErr = rwandaPhoneError(body?.phone, { required: true });
  if (phoneErr) return bad(phoneErr);
  const momoErr = rwandaPhoneError(body?.momoPhone);
  if (momoErr) return bad(`MoMo number: ${momoErr}`);
  return {
    ok: true,
    values: {
      name,
      phone: normalizeRwandaPhone(body?.phone),
      momoPhone: normalizeRwandaPhone(body?.momoPhone) || normalizeRwandaPhone(body?.phone),
      momoName: str(body?.momoName, 100),
      plate: str(body?.plate, 20).toUpperCase(),
      active: body?.active !== false,
      notes: str(body?.notes, 500),
    },
  };
}

export function fareFromBody(body) {
  const fare = Number(body?.fareRwf);
  if (!Number.isInteger(fare) || fare <= 0) return bad("Enter the agreed fare in whole RWF.");
  if (fare > MAX_FARE_RWF) return bad(`A fare above ${MAX_FARE_RWF} RWF looks like a mistake. Check the amount.`);
  return { ok: true, fareRwf: fare };
}

function mapRider(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    momoPhone: r.momo_phone,
    momoName: r.momo_name,
    plate: r.plate,
    active: r.active,
    notes: r.notes,
  };
}

export async function saveRider(dbQuery, id, body, actor) {
  const parsed = riderFromBody(body);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  const params = [v.name, v.phone, v.momoPhone, v.momoName, v.plate, v.active, v.notes];
  const cols = `id::text, name, phone, momo_phone, momo_name, plate, active, notes`;
  try {
    const r = id
      ? await dbQuery(
          `UPDATE shop_riders
              SET name = $1, phone = $2, momo_phone = $3, momo_name = $4, plate = $5, active = $6, notes = $7,
                  updated_at = now()
            WHERE id = $8::uuid
            RETURNING ${cols}`,
          [...params, id]
        )
      : await dbQuery(
          `INSERT INTO shop_riders (name, phone, momo_phone, momo_name, plate, active, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid)
           RETURNING ${cols}`,
          [...params, actor.userId]
        );
    if (!r.rows[0]) return fail(404, "Rider not found.");
    actor.audit?.(actor.userId, actor.role, id ? "shop.rider.update" : "shop.rider.create", "shop_rider", r.rows[0].id, {
      active: v.active,
    });
    return { ok: true, rider: mapRider(r.rows[0]) };
  } catch (e) {
    return dbError(e, "Could not save the rider.");
  }
}

/**
 * Everything the Riders tab shows: dish orders that need a rider, orders a
 * rider is carrying, the saved riders, and what each rider is owed.
 */
export async function getRiderBoard(dbQuery) {
  try {
    const [riders, orders, owed] = await Promise.all([
      dbQuery(`SELECT id::text, name, phone, momo_phone, momo_name, plate, active, notes FROM shop_riders ORDER BY active DESC, name`),
      dbQuery(
        `SELECT o.id::text, o.ref, o.status, o.district, o.sector, o.address_note AS "addressNote",
                o.customer_name AS "customerName", o.customer_phone AS "customerPhone",
                o.delivery_fee_rwf AS "deliveryFeeRwf", o.accepted_at AS "acceptedAt", o.ready_at AS "readyAt",
                o.out_at AS "outAt", o.rider_fare_rwf AS "fareRwf", o.rider_id::text AS "riderId",
                r.name AS "riderName", r.phone AS "riderPhone",
                k.shop_name AS "kitchenName", k.phone AS "kitchenPhone", k.district AS "kitchenDistrict",
                k.sector AS "kitchenSector", k.address_note AS "kitchenAddress",
                CASE WHEN o.accepted_at IS NULL THEN NULL
                     ELSE o.accepted_at + make_interval(mins => COALESCE(s.prep_minutes, 25)) END AS "readyBy"
           FROM shop_orders o
           LEFT JOIN shop_butchers k ON k.id = o.butcher_id
           LEFT JOIN shop_kitchen_settings s ON s.partner_id = o.butcher_id
           LEFT JOIN shop_riders r ON r.id = o.rider_id
          WHERE o.channel = 'kitchen' AND o.fulfilment = 'delivery'
            AND o.status IN ('paid', 'accepted', 'ready', 'out_for_delivery')
            AND o.butcher_id IS NOT NULL
          ORDER BY COALESCE(o.accepted_at, o.paid_confirmed_at, o.placed_at)`
      ),
      dbQuery(
        `SELECT r.id::text AS "riderId", r.name, r.momo_phone AS "momoPhone", r.momo_name AS "momoName",
                o.id::text AS "orderId", o.ref, o.delivered_at AS "deliveredAt", o.rider_fare_rwf AS "fareRwf"
           FROM shop_orders o JOIN shop_riders r ON r.id = o.rider_id
          WHERE o.status IN ('delivered', 'resolved') AND COALESCE(o.rider_fare_rwf, 0) > 0
            AND NOT EXISTS (SELECT 1 FROM shop_settlements x
                             WHERE x.order_id = o.id AND x.side = 'rider_out' AND x.status IN ('pending', 'paid'))
          ORDER BY r.name, o.delivered_at`
      ),
    ]);
    const byRider = new Map();
    for (const row of owed.rows) {
      if (!byRider.has(row.riderId)) {
        byRider.set(row.riderId, { riderId: row.riderId, name: row.name, momoPhone: row.momoPhone, momoName: row.momoName, orders: [], totalRwf: 0 });
      }
      const x = byRider.get(row.riderId);
      x.orders.push({ orderId: row.orderId, ref: row.ref, deliveredAt: row.deliveredAt, fareRwf: row.fareRwf });
      x.totalRwf += row.fareRwf;
    }
    return {
      ok: true,
      riders: riders.rows.map(mapRider),
      needsRider: orders.rows.filter((o) => !o.riderId),
      withRider: orders.rows.filter((o) => o.riderId),
      owed: [...byRider.values()],
    };
  } catch (e) {
    return dbError(e, "Could not load riders.");
  }
}

/** Books (or changes) the rider for a delivered dish order, with the agreed fare. */
export async function bookRider(dbQuery, orderId, body, actor) {
  const riderId = str(body?.riderId, 64);
  if (!riderId) return bad("Choose a rider.");
  const fare = fareFromBody(body);
  if (!fare.ok) return fare;
  try {
    const r = await dbQuery(
      `WITH rider AS (SELECT id, name FROM shop_riders WHERE id = $2::uuid AND active),
            o AS (
              UPDATE shop_orders
                 SET rider_id = (SELECT id FROM rider), rider_fare_rwf = $3, rider_booked_at = now(), updated_at = now()
               WHERE id = $1::uuid AND channel = 'kitchen' AND fulfilment = 'delivery'
                 AND status = ANY($5::text[]) AND butcher_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM rider)
               RETURNING id
            ),
            e AS (
              INSERT INTO shop_order_events (order_id, actor_user_id, kind, note)
              SELECT o.id, $4::uuid, 'rider', 'Rider ' || (SELECT name FROM rider) || ', ' || $3 || ' RWF' FROM o
            )
       SELECT (SELECT id::text FROM o) AS "orderId", (SELECT name FROM rider) AS "riderName"`,
      [orderId, riderId, fare.fareRwf, actor.userId, BOOKABLE_STATUSES]
    );
    const row = r.rows[0] || {};
    if (!row.riderName) return bad("Choose an active rider.");
    if (!row.orderId) return fail(409, "This order cannot take a rider now: it is not a delivery, or it has already left.");
    actor.audit?.(actor.userId, actor.role, "shop.order.rider", "shop_order", orderId, { riderId, fareRwf: fare.fareRwf });
    return { ok: true, riderName: row.riderName, fareRwf: fare.fareRwf };
  } catch (e) {
    if (String(e?.code) === "22P02") return bad("Choose a rider.");
    return dbError(e, "Could not book the rider.");
  }
}

/**
 * Records a MoMo payout to one rider for the listed delivered orders. If the
 * orders or fares changed since the desk loaded them, nothing is written.
 */
export async function payRider(dbQuery, riderId, body, actor) {
  const reference = str(body?.reference, 60).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9.-]{4,40}$/.test(reference)) return bad("Enter the MoMo transaction ID of the payout.");
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.map((x) => str(x, 64)).filter(Boolean) : [];
  if (orderIds.length === 0) return bad("No orders to pay.");
  const expected = Number(body?.expectedTotalRwf);
  if (!Number.isInteger(expected) || expected <= 0) return bad("Missing payout amount.");
  try {
    const r = await dbQuery(
      `WITH due AS (
         SELECT o.id, o.rider_fare_rwf AS fare
           FROM shop_orders o
          WHERE o.id = ANY($2::uuid[]) AND o.rider_id = $1::uuid AND o.status IN ('delivered', 'resolved')
            AND COALESCE(o.rider_fare_rwf, 0) > 0
            AND NOT EXISTS (SELECT 1 FROM shop_settlements x
                             WHERE x.order_id = o.id AND x.side = 'rider_out' AND x.status IN ('pending', 'paid'))
       ),
       check_total AS (SELECT COALESCE(sum(fare), 0)::int AS total, count(*)::int AS n FROM due),
       rider AS (SELECT momo_phone AS phone FROM shop_riders WHERE id = $1::uuid),
       paid AS (
         INSERT INTO shop_settlements (order_id, side, status, amount_rwf, method, phone, reference, created_by,
                                       confirmed_by, confirmed_at)
         SELECT due.id, 'rider_out', 'paid', due.fare, 'momo', (SELECT phone FROM rider), $3, $4::uuid, $4::uuid, now()
           FROM due, check_total WHERE check_total.total = $5 AND check_total.n = cardinality($2::uuid[])
         RETURNING order_id
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, note)
         SELECT order_id, $4::uuid, 'rider_paid', $3 FROM paid
       )
       SELECT check_total.total, check_total.n, (SELECT count(*)::int FROM paid) AS written FROM check_total`,
      [riderId, orderIds, reference, actor.userId, expected]
    );
    const row = r.rows[0] || { total: 0, n: 0, written: 0 };
    if (!row.written) return fail(409, "These orders changed since you opened the list. Refresh and check the amount again.");
    actor.audit?.(actor.userId, actor.role, "shop.rider.paid", "shop_rider", riderId, { reference, totalRwf: row.total, orders: row.n });
    return { ok: true, totalRwf: row.total, orders: row.n, reference };
  } catch (e) {
    if (String(e?.code) === "23505") return fail(409, "Some of these orders were just paid out. Refresh the list.");
    return dbError(e, "Could not record the rider payout.");
  }
}
