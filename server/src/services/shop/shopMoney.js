/**
 * Butcher shop money after delivery: what each butcher is owed, paying them,
 * refunds, and the day's totals. Every write is one SQL statement because
 * dbQuery is a pool.
 *
 * A delivered order owes its butcher `butcher_payout_rwf`. When Cleva pays
 * delivery (free-delivery orders), it also owes the delivery cost: the amount
 * ops recorded, or the zone's delivery fee when nothing was recorded.
 */

const PAYABLE = `o.status IN ('delivered', 'resolved')`;

/** Orders whose butcher payout has not been sent. Failed or cancelled payouts do not count as sent. */
const NOT_PAID_OUT = `NOT EXISTS (
  SELECT 1 FROM shop_settlements x
   WHERE x.order_id = o.id AND x.side = 'butcher_out' AND x.status IN ('pending', 'paid')
)`;

/** Delivery cost Cleva owes on one order, in SQL. Needs `o` and `z` (zone). */
const CLEVA_DELIVERY = `CASE WHEN o.delivery_paid_by = 'cleva'
  THEN COALESCE(o.cleva_delivery_cost_rwf, z.delivery_fee_rwf, 0) ELSE 0 END`;

function fail(status, error) {
  return { ok: false, status, error };
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01") return fail(503, "The shop is not set up in the database yet.");
  return fail(500, e instanceof Error ? e.message : fallback);
}

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanReference(value) {
  const ref = str(value, 60).replace(/\s+/g, "");
  return /^[A-Za-z0-9.-]{4,40}$/.test(ref) ? ref : "";
}

// ---------- payouts ----------

/** Each butcher with orders delivered and not yet paid out, plus problem orders on hold. */
export async function getPayoutSummary(dbQuery) {
  try {
    const owed = await dbQuery(
      `SELECT b.id::text AS "butcherId", b.shop_name AS "shopName", b.momo_payout_phone AS "payoutPhone",
              b.momo_payout_name AS "payoutName",
              o.id::text AS "orderId", o.ref, o.delivered_at AS "deliveredAt",
              o.butcher_payout_rwf AS "payoutRwf", (${CLEVA_DELIVERY})::int AS "clevaDeliveryRwf"
         FROM shop_orders o
         JOIN shop_butchers b ON b.id = o.butcher_id
         LEFT JOIN shop_zones z ON z.id = o.zone_id
        WHERE ${PAYABLE} AND ${NOT_PAID_OUT}
        ORDER BY b.shop_name, o.delivered_at`
    );
    const held = await dbQuery(
      `SELECT o.butcher_id::text AS "butcherId", count(*)::int AS n
         FROM shop_orders o WHERE o.status = 'problem' AND o.butcher_id IS NOT NULL GROUP BY o.butcher_id`
    );
    const heldBy = new Map(held.rows.map((r) => [r.butcherId, r.n]));
    const byButcher = new Map();
    for (const r of owed.rows) {
      if (!byButcher.has(r.butcherId)) {
        byButcher.set(r.butcherId, {
          butcherId: r.butcherId,
          shopName: r.shopName,
          payoutPhone: r.payoutPhone,
          payoutName: r.payoutName,
          orders: [],
          totalRwf: 0,
          heldOrders: heldBy.get(r.butcherId) ?? 0,
        });
      }
      const b = byButcher.get(r.butcherId);
      const amount = Number(r.payoutRwf) + Number(r.clevaDeliveryRwf);
      b.orders.push({
        orderId: r.orderId,
        ref: r.ref,
        deliveredAt: r.deliveredAt,
        payoutRwf: Number(r.payoutRwf),
        clevaDeliveryRwf: Number(r.clevaDeliveryRwf),
        amountRwf: amount,
      });
      b.totalRwf += amount;
    }
    return { ok: true, butchers: [...byButcher.values()] };
  } catch (e) {
    return dbError(e, "Could not load payouts.");
  }
}

/**
 * Records a MoMo payout to one butcher for the listed orders. `expectedTotalRwf`
 * is the amount the desk saw; if the orders changed since, nothing is written.
 */
export async function payButcher(dbQuery, butcherId, body, actor) {
  const reference = cleanReference(body?.reference);
  if (!reference) return fail(400, "Enter the MoMo transaction ID of the payout.");
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.map((x) => str(x, 64)).filter(Boolean) : [];
  if (orderIds.length === 0) return fail(400, "No orders to pay.");
  const expected = Number(body?.expectedTotalRwf);
  if (!Number.isInteger(expected) || expected <= 0) return fail(400, "Missing payout amount.");
  try {
    // Check and write in one statement: if the total no longer matches, `ok` is false and nothing is inserted.
    const r = await dbQuery(
      `WITH due AS (
         SELECT o.id, o.butcher_payout_rwf AS payout, (${CLEVA_DELIVERY})::int AS delivery
           FROM shop_orders o
           LEFT JOIN shop_zones z ON z.id = o.zone_id
          WHERE o.id = ANY($2::uuid[]) AND o.butcher_id = $1::uuid AND ${PAYABLE} AND ${NOT_PAID_OUT}
       ),
       check_total AS (
         SELECT COALESCE(sum(payout + delivery), 0)::int AS total, count(*)::int AS n FROM due
       ),
       b AS (SELECT momo_payout_phone AS phone FROM shop_butchers WHERE id = $1::uuid),
       paid AS (
         INSERT INTO shop_settlements (order_id, side, status, amount_rwf, method, phone, reference, created_by,
                                       confirmed_by, confirmed_at)
         SELECT due.id, 'butcher_out', 'paid', due.payout, 'momo', (SELECT phone FROM b), $3, $4::uuid, $4::uuid, now()
           FROM due, check_total WHERE check_total.total = $5 AND check_total.n = cardinality($2::uuid[])
         RETURNING order_id
       ),
       delivery AS (
         INSERT INTO shop_settlements (order_id, side, status, amount_rwf, method, phone, reference, created_by,
                                       confirmed_by, confirmed_at)
         SELECT due.id, 'delivery_out', 'paid', due.delivery, 'momo', (SELECT phone FROM b), $3, $4::uuid, $4::uuid, now()
           FROM due, check_total
          WHERE due.delivery > 0 AND check_total.total = $5 AND check_total.n = cardinality($2::uuid[])
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, note)
         SELECT order_id, $4::uuid, 'butcher_paid', $3 FROM paid
       )
       SELECT check_total.total, check_total.n, (SELECT count(*)::int FROM paid) AS written FROM check_total`,
      [butcherId, orderIds, reference, actor.userId, expected]
    );
    const row = r.rows[0] || { total: 0, n: 0, written: 0 };
    if (!row.written) {
      return fail(409, "These orders changed since you opened the list. Refresh and check the amount again.");
    }
    actor.audit?.(actor.userId, actor.role, "shop.butcher.paid", "shop_butcher", butcherId, {
      reference,
      totalRwf: row.total,
      orders: row.n,
    });
    return { ok: true, totalRwf: row.total, orders: row.n, reference };
  } catch (e) {
    if (String(e?.code) === "23505") return fail(409, "Some of these orders were just paid out. Refresh the list.");
    return dbError(e, "Could not record the payout.");
  }
}

/** Ops records what a free-delivery order really cost. Only before the butcher is paid for it. */
export async function setDeliveryCost(dbQuery, orderId, body, actor) {
  const amount = Number(body?.amountRwf);
  if (!Number.isInteger(amount) || amount < 0) return fail(400, "Enter the delivery cost in whole RWF.");
  try {
    const r = await dbQuery(
      `UPDATE shop_orders o
          SET cleva_delivery_cost_rwf = $2, updated_at = now()
        WHERE o.id = $1::uuid AND o.delivery_paid_by = 'cleva' AND ${NOT_PAID_OUT}
        RETURNING o.id::text`,
      [orderId, amount]
    );
    if (!r.rows[0]) {
      return fail(409, "Only a free-delivery order that is not paid out yet can change its delivery cost.");
    }
    actor.audit?.(actor.userId, actor.role, "shop.order.delivery_cost", "shop_order", orderId, { amountRwf: amount });
    return { ok: true, amountRwf: amount };
  } catch (e) {
    return dbError(e, "Could not save the delivery cost.");
  }
}

// ---------- refunds ----------

export async function listRefunds(dbQuery) {
  try {
    const r = await dbQuery(
      `SELECT s.id::text, s.order_id::text AS "orderId", o.ref, o.customer_name AS "customerName",
              s.phone, s.amount_rwf AS "amountRwf", s.status, s.reference, s.note, s.created_at AS "createdAt",
              s.confirmed_at AS "confirmedAt"
         FROM shop_settlements s JOIN shop_orders o ON o.id = s.order_id
        WHERE s.side = 'refund' AND (s.status = 'pending' OR s.confirmed_at > now() - interval '14 days')
        ORDER BY (s.status = 'pending') DESC, s.created_at DESC
        LIMIT 100`
    );
    return { ok: true, refunds: r.rows };
  } catch (e) {
    return dbError(e, "Could not load refunds.");
  }
}

export async function markRefundSent(dbQuery, settlementId, body, actor) {
  const reference = cleanReference(body?.reference);
  if (!reference) return fail(400, "Enter the MoMo transaction ID of the refund.");
  try {
    const r = await dbQuery(
      `WITH s AS (
         UPDATE shop_settlements
            SET status = 'paid', reference = $2, confirmed_by = $3::uuid, confirmed_at = now()
          WHERE id = $1::uuid AND side = 'refund' AND status = 'pending'
          RETURNING order_id, amount_rwf
       ),
       o AS (
         UPDATE shop_orders SET payment_status = 'refunded', updated_at = now()
          WHERE id IN (SELECT order_id FROM s)
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, note)
         SELECT order_id, $3::uuid, 'refund_sent', $2 FROM s
       )
       SELECT order_id::text AS "orderId", amount_rwf AS "amountRwf" FROM s`,
      [settlementId, reference, actor.userId]
    );
    if (!r.rows[0]) return fail(409, "This refund is not waiting any more. Refresh the list.");
    actor.audit?.(actor.userId, actor.role, "shop.refund.sent", "shop_order", r.rows[0].orderId, {
      reference,
      amountRwf: r.rows[0].amountRwf,
    });
    return { ok: true, ...r.rows[0], reference };
  } catch (e) {
    return dbError(e, "Could not record the refund.");
  }
}

// ---------- totals ----------

/**
 * Last `days` Kigali days, newest first. An order counts on the day it was
 * paid (confirmed); placed and delivered counts use their own days.
 */
export async function getShopTotals(dbQuery, days = 7) {
  const n = Math.min(31, Math.max(1, Math.round(Number(days) || 7)));
  try {
    const r = await dbQuery(
      `WITH d AS (
         SELECT generate_series(
                  (timezone('Africa/Kigali', now()))::date - ($1::int - 1),
                  (timezone('Africa/Kigali', now()))::date,
                  interval '1 day')::date AS day
       ),
       o AS (
         SELECT o.*, (timezone('Africa/Kigali', o.placed_at))::date AS placed_day,
                (timezone('Africa/Kigali', o.paid_confirmed_at))::date AS paid_day,
                (timezone('Africa/Kigali', o.delivered_at))::date AS delivered_day,
                (${CLEVA_DELIVERY})::int AS cleva_delivery
           FROM shop_orders o LEFT JOIN shop_zones z ON z.id = o.zone_id
          WHERE o.placed_at > now() - make_interval(days => $1::int + 1)
             OR o.paid_confirmed_at > now() - make_interval(days => $1::int + 1)
       )
       SELECT d.day::text AS day,
              (SELECT count(*) FROM o WHERE o.placed_day = d.day)::int AS placed,
              (SELECT count(*) FROM o WHERE o.paid_day = d.day)::int AS paid,
              (SELECT COALESCE(sum(total_rwf), 0) FROM o WHERE o.paid_day = d.day)::int AS "paidRwf",
              (SELECT COALESCE(sum(commission_rwf), 0) FROM o
                WHERE o.paid_day = d.day AND o.status NOT IN ('cancelled'))::int AS "commissionRwf",
              (SELECT COALESCE(sum(cleva_delivery), 0) FROM o
                WHERE o.paid_day = d.day AND o.status NOT IN ('cancelled'))::int AS "clevaDeliveryRwf",
              (SELECT count(*) FROM o WHERE o.delivered_day = d.day)::int AS delivered,
              (SELECT count(*) FROM o WHERE o.paid_day = d.day AND o.status = 'cancelled')::int AS "cancelledAfterPay"
         FROM d ORDER BY d.day DESC`,
      [n]
    );
    const now = await dbQuery(
      `SELECT count(*) FILTER (WHERE status = 'payment_pending')::int AS "paymentsToCheck",
              count(*) FILTER (WHERE status = 'paid')::int AS "waitingForButcher",
              count(*) FILTER (WHERE status IN ('accepted', 'ready', 'out_for_delivery'))::int AS "inProgress",
              count(*) FILTER (WHERE status = 'problem')::int AS problems,
              (SELECT count(*) FROM shop_settlements WHERE side = 'refund' AND status = 'pending')::int AS "refundsToSend"
         FROM shop_orders`
    );
    const days_ = r.rows.map((x) => ({ ...x, clevaNetRwf: x.commissionRwf - x.clevaDeliveryRwf }));
    return { ok: true, days: days_, now: now.rows[0] };
  } catch (e) {
    return dbError(e, "Could not load totals.");
  }
}

// ---------- butcher's own view ----------

/** What a butcher is owed now, and their recent payouts grouped by MoMo reference. */
export async function getButcherMoney(dbQuery, butcherId) {
  try {
    const owed = await dbQuery(
      `SELECT count(*)::int AS orders,
              COALESCE(sum(o.butcher_payout_rwf + (${CLEVA_DELIVERY})), 0)::int AS "owedRwf"
         FROM shop_orders o LEFT JOIN shop_zones z ON z.id = o.zone_id
        WHERE o.butcher_id = $1::uuid AND ${PAYABLE} AND ${NOT_PAID_OUT}`,
      [butcherId]
    );
    const paid = await dbQuery(
      `SELECT s.reference, max(s.confirmed_at) AS "paidAt", sum(s.amount_rwf)::int AS "amountRwf",
              count(DISTINCT s.order_id)::int AS orders
         FROM shop_settlements s JOIN shop_orders o ON o.id = s.order_id
        WHERE o.butcher_id = $1::uuid AND s.side IN ('butcher_out', 'delivery_out') AND s.status = 'paid'
        GROUP BY s.reference
        ORDER BY max(s.confirmed_at) DESC
        LIMIT 20`,
      [butcherId]
    );
    return { ok: true, owed: owed.rows[0] || { orders: 0, owedRwf: 0 }, payouts: paid.rows };
  } catch (e) {
    return dbError(e, "Could not load your payouts.");
  }
}
