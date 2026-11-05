/**
 * Butcher shop orders: catalog, quote, place, track, payment sent, and the
 * desk's confirm / reject / cancel. Every write that touches more than one
 * table is one SQL statement, because dbQuery is a pool and BEGIN/COMMIT
 * across calls would not be one transaction.
 */

import { isSectorInDistrict } from "../pipeline/rwandaLocations.js";
import { normalizeRwandaPhone, rwandaPhoneError } from "../pipeline/rwandaPhone.js";
import { pickButcher, zoneForSector } from "./assignButcher.js";
import { hashToken, newOrderRef, newTrackToken, normalizeOrderRef, trackTokenMatches } from "./orderRef.js";
import { nextShopOrderStatus } from "./orderStatus.js";
import { normalizeShopSettings, publicQuoteView, quoteShopOrder } from "./shopQuote.js";
import { isKitchenOpen, kigaliNow, kitchenPayout, noKitchenMessage, pickKitchen } from "./kitchenRouting.js";
import { loadKitchens, routeKitchenOrder, sweepLateKitchenOrders } from "./shopKitchenOrders.js";

const DESK_VIEWS = ["to_confirm", "open", "done", "all"];

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function fail(status, error, code) {
  return { ok: false, status, error, ...(code ? { code } : {}) };
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01") {
    return fail(503, "The shop is not set up in the database yet.");
  }
  return fail(500, e instanceof Error ? e.message : fallback);
}

// ---------- time ----------

/** "HH:MM" in Kigali for `now`. */
export function kigaliClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

/** Whether customers can order right now, and why not. */
export function shopOpenState(settingsRow, now = new Date()) {
  if (!settingsRow) return { open: false, reason: "closed", message: "The shop is not open yet." };
  const hours = settingsRow.order_hours || {};
  const openTime = hours.open || "08:00";
  const closeTime = hours.close || "18:00";
  const message = String(settingsRow.closed_message || "").trim();
  if (!settingsRow.is_open) {
    return { open: false, reason: "closed", message: message || "The shop is closed for now.", openTime, closeTime };
  }
  const clock = kigaliClock(now);
  if (clock < openTime || clock >= closeTime) {
    return {
      open: false,
      reason: "hours",
      message: `We take orders from ${openTime} to ${closeTime}, Kigali time.`,
      openTime,
      closeTime,
    };
  }
  return { open: true, reason: null, message: "", openTime, closeTime };
}

// ---------- input ----------

/**
 * Checks the checkout form. Honeypot and a too-fast submit reject bots,
 * the same way public buyer requests do.
 */
export function customerFromBody(body, now = Date.now(), { pickup = false } = {}) {
  if (str(body?.website ?? body?.honeypot, 200)) return fail(400, "Rejected.");
  const started = Number(body?.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const elapsed = now - started;
    if (elapsed >= 0 && elapsed < 1500) return fail(400, "Please wait a moment and try again.");
  }
  const name = str(body?.customerName ?? body?.name, 80);
  if (name.length < 2) return fail(400, "Your name is required.");
  const phoneErr = rwandaPhoneError(body?.phone, { required: true });
  if (phoneErr) return fail(400, phoneErr);
  const district = str(body?.district, 60);
  const sector = str(body?.sector, 60);
  if (!isSectorInDistrict(district, sector)) return fail(400, "Choose your district and sector.");
  const addressNote = str(body?.addressNote, 300);
  if (!pickup && addressNote.length < 3) return fail(400, "Tell us where to deliver.");
  return {
    ok: true,
    values: { name, phone: normalizeRwandaPhone(body?.phone), district, sector, addressNote },
  };
}

/** MoMo transaction IDs are digits and letters. Spaces are dropped. */
export function momoTxnFromBody(body) {
  const txn = str(body?.momoTxnId ?? body?.txnId, 60).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9.-]{4,40}$/.test(txn)) return fail(400, "Enter the MoMo transaction ID from your payment message.");
  const payerErr = rwandaPhoneError(body?.payerPhone);
  if (payerErr) return fail(400, `Paying number: ${payerErr}`);
  return { ok: true, values: { txn, payerPhone: normalizeRwandaPhone(body?.payerPhone) || null } };
}

function itemsFromBody(body) {
  const raw = Array.isArray(body?.items) ? body.items : [];
  return raw.slice(0, 20).map((i) => ({ sku: str(i?.sku, 20).toUpperCase(), qty: Number(i?.qty) }));
}

// ---------- loading ----------

/**
 * Cooked BigChix dishes stay off sale until kitchen partners exist: every order
 * is routed to a butcher today, so a dish order would reach the wrong partner.
 * The desk can still build the menu, and the shop shows it in preview only.
 */
export function cookedOnSale(env = process.env) {
  return String(env.SHOP_COOKED_ON_SALE || "").trim() === "1";
}

/** Kept for callers that read it once; the live switch is cookedOnSale(). */
export const COOKED_ON_SALE = cookedOnSale();

/** Dishes are on sale when a superuser switched them on (or the server says so). */
export function dishesOnSale(settingsRow, env = process.env) {
  return cookedOnSale(env) || settingsRow?.dishes_on_sale === true;
}

export function isOrderable(row, onSale = cookedOnSale()) {
  return onSale || (row.category || "whole") !== "cooked";
}

/** Dishes and fresh chicken are separate orders. Returns the order's channel, or an error. */
export function channelForItems(items, products) {
  const bySku = new Map(products.map((p) => [String(p.sku).trim().toUpperCase(), p]));
  const kinds = new Set(
    items.map((i) => bySku.get(String(i.sku).toUpperCase())).filter(Boolean).map((p) => (p.category === "cooked" ? "kitchen" : "fresh"))
  );
  if (kinds.size > 1) return { ok: false, error: "Dishes and fresh chicken are separate orders. Check out one at a time." };
  return { ok: true, channel: kinds.has("kitchen") ? "kitchen" : "fresh" };
}

/**
 * Prices a BigChix dish order: the BigChix price, plus the zone's delivery fee
 * (none for pickup), with the first kitchen that can take it right now. That
 * kitchen's fees are an estimate until payment, when the order is routed again.
 */
function quoteKitchenOrder(ctx, body, items, now) {
  const fulfilment = body?.fulfilment === "pickup" ? "pickup" : "delivery";
  const pickupKitchenId = str(body?.pickupKitchenId, 64);
  const zone = fulfilment === "pickup" ? null : zoneForSector(ctx.zones, body?.district, body?.sector);
  const pricingZone = fulfilment === "pickup" ? { id: "", deliveryFeeRwf: 0, freeDeliveryOverRwf: null } : zone;
  // The shop's minimum order is for fresh chicken from butchers; a single dish is a fine order.
  const dishSettings = { ...(ctx.settings || {}), min_order_rwf: 0, min_order_items: 0 };
  const quote = quoteShopOrder({ items, products: ctx.products, zone: pricingZone, settings: dishSettings });
  if (!quote.ok) return { quote, fulfilment, zone };
  const lines = quote.lines.map((l) => ({ ...l }));
  const need = { fulfilment, zoneId: zone?.id ?? null, pickupKitchenId, productIds: [...new Set(lines.map((l) => l.productId))] };
  const clock = kigaliNow(now);
  const kitchen = pickKitchen(ctx.kitchens, need, clock);
  if (!kitchen) {
    return {
      quote: { ...quote, ok: false, code: "no_kitchen", error: noKitchenMessage(ctx.kitchens, need, clock) },
      fulfilment,
      zone,
    };
  }
  const pay = kitchenPayout(lines, kitchen.dishes);
  return {
    quote: {
      ...quote,
      deliveryPaidBy: quote.deliveryFeeRwf > 0 ? "customer" : "cleva",
      commissionPct: 0,
      commissionRwf: pay.clevaShareRwf,
      butcherPayoutRwf: pay.payoutRwf,
      readyInMinutes: kitchen.prepMinutes,
    },
    fulfilment,
    zone,
    kitchen,
  };
}

async function loadContext(dbQuery, { withKitchens = false } = {}) {
  const [settings, products, zones] = await Promise.all([
    dbQuery(`SELECT * FROM shop_settings WHERE id = 1`),
    dbQuery(
      `SELECT id::text, sku, name, name_rw, description, description_rw, weight_min_kg, weight_max_kg,
              price_rwf, photo_url, active, sort_order, category
         FROM shop_products ORDER BY sort_order, name`
    ),
    dbQuery(
      `SELECT id::text, name, district, sectors, delivery_fee_rwf, free_delivery_over_rwf, active
         FROM shop_zones WHERE active`
    ),
  ]);
  const settingsRow = settings.rows[0] || null;
  const onSale = dishesOnSale(settingsRow);
  return {
    kitchens: withKitchens ? await loadKitchens(dbQuery) : [],
    settings: settingsRow,
    dishesOnSale: onSale,
    allProducts: products.rows,
    products: products.rows.filter((p) => isOrderable(p, onSale)),
    zones: zones.rows,
  };
}

export async function loadPayTo(dbQuery, env = process.env) {
  const fallback = String(env.MARKET_CLEVA_MOMO || "").trim() || null;
  try {
    const r = await dbQuery(`SELECT setting_value FROM app_settings WHERE setting_key = 'market_cleva_momo' LIMIT 1`);
    return String(r.rows[0]?.setting_value || "").trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Unpaid orders past the pay window become expired, with one event each. */
export async function expireUnpaidOrders(dbQuery) {
  await dbQuery(
    `WITH gone AS (
       UPDATE shop_orders o
          SET status = 'expired', updated_at = now()
         FROM shop_settings s
        WHERE s.id = 1
          AND o.status = 'placed'
          AND o.updated_at < now() - make_interval(mins => s.pay_within_minutes)
        RETURNING o.id
     )
     INSERT INTO shop_order_events (order_id, kind, from_status, to_status, note)
     SELECT id, 'expire', 'placed', 'expired', 'Not paid in time' FROM gone`
  );
}

// ---------- public ----------

/**
 * What the shop may know about kitchens to show dishes honestly: which are
 * open now, where they deliver, which dishes they can make today, and pickup
 * details. Never fees, payout numbers or contacts.
 */
export function publicKitchens(kitchens, now = new Date(), products = []) {
  const clock = kigaliNow(now);
  const skuOf = new Map(products.map((p) => [String(p.id), p.sku]));
  return (kitchens || [])
    .filter((k) => k.status === "active")
    .map((k) => ({
      id: k.id,
      name: k.name,
      open: Boolean(k.takingOrders) && isKitchenOpen(k.hours, clock) && (k.openOrders ?? 0) < (k.maxOpenOrders ?? 10),
      zoneIds: (k.zones || []).map((z) => z.zoneId),
      // Dish codes (the shop's item key) it can make today.
      dishSkus: (k.dishes || [])
        .filter((d) => !(d.soldOutOn && d.soldOutOn === clock.date))
        .map((d) => skuOf.get(String(d.productId)))
        .filter(Boolean),
      readyInMinutes: k.prepMinutes ?? 25,
      opensAt: nextOpening(k.hours, clock),
      pickup: k.pickupEnabled
        ? { district: k.district, sector: k.sector, address: k.pickupAddress, directions: k.pickupDirections }
        : null,
    }));
}

/** "Opens at 11:00" (today, later) or null. */
function nextOpening(hours, clock) {
  const h = hours?.[clock.day];
  return h && h.open && clock.time < h.open ? h.open : null;
}

function publicProduct(r) {
  return {
    sku: r.sku,
    name: r.name,
    nameRw: r.name_rw,
    description: r.description,
    descriptionRw: r.description_rw,
    weightMinKg: r.weight_min_kg === null ? null : Number(r.weight_min_kg),
    weightMaxKg: r.weight_max_kg === null ? null : Number(r.weight_max_kg),
    priceRwf: r.price_rwf,
    photoUrl: r.photo_url,
    category: r.category || "whole",
    orderable: isOrderable(r, r.__onSale),
  };
}

export async function getShopCatalog(dbQuery, now = new Date(), { preview = false } = {}) {
  try {
    const ctx = await loadContext(dbQuery);
    const showDishes = ctx.dishesOnSale || preview;
    const kitchens = showDishes ? publicKitchens(await loadKitchens(dbQuery), now, ctx.allProducts) : [];
    const state = shopOpenState(ctx.settings, now);
    const cfg = normalizeShopSettings(ctx.settings || {});
    return {
      ok: true,
      open: state.open,
      closedReason: state.reason,
      closedMessage: state.message,
      openTime: state.openTime ?? null,
      closeTime: state.closeTime ?? null,
      minOrderRwf: cfg.minOrderRwf,
      minOrderItems: cfg.minOrderItems,
      dishesOnSale: ctx.dishesOnSale,
      products: (preview ? ctx.allProducts : ctx.products)
        .filter((p) => p.active)
        .map((p) => publicProduct({ ...p, __onSale: ctx.dishesOnSale })),
      kitchens,
      zones: ctx.zones.map((z) => ({
        id: z.id,
        name: z.name,
        district: z.district,
        sectors: z.sectors || [],
        deliveryFeeRwf: z.delivery_fee_rwf,
        freeDeliveryOverRwf: z.free_delivery_over_rwf,
      })),
    };
  } catch (e) {
    return dbError(e, "Could not load the shop.");
  }
}

export async function quoteForCustomer(dbQuery, body, now = new Date()) {
  try {
    const ctx = await loadContext(dbQuery);
    const items = itemsFromBody(body);
    const channel = channelForItems(items, ctx.allProducts);
    if (!channel.ok) return { ok: true, quote: { ok: false, code: "mixed", error: channel.error } };
    if (channel.channel === "kitchen" && !ctx.dishesOnSale) {
      return { ok: true, quote: { ok: false, code: "dishes_off", error: "BigChix dishes are not on sale yet." } };
    }
    if (channel.channel === "kitchen") {
      ctx.kitchens = await loadKitchens(dbQuery);
      const k = quoteKitchenOrder(ctx, body, items, now);
      return { ok: true, quote: { ...publicQuoteView(k.quote), fulfilment: k.fulfilment } };
    }
    const zone = zoneForSector(ctx.zones, body?.district, body?.sector);
    const quote = quoteShopOrder({ items: itemsFromBody(body), products: ctx.products, zone, settings: ctx.settings || {} });
    return { ok: true, quote: publicQuoteView(quote) };
  } catch (e) {
    return dbError(e, "Could not price this order.");
  }
}

/**
 * Places an order. Returns the ref and the raw tracking token; the token is
 * shown to the customer once, in their link, and only its hash is stored.
 */
/**
 * `test`: a staff test order from the desk. It may include dishes before they
 * are on sale and ignores the shop's opening, but still needs a kitchen that
 * can take it, and is paid and handled like any order.
 */
export async function placeShopOrder(dbQuery, body, { attribution = {}, now = new Date(), test = false } = {}) {
  // Bots and empty forms stop here, before any database work.
  const early = customerFromBody(body, now.getTime(), { pickup: body?.fulfilment === "pickup" });
  if (!early.ok && early.error !== "Choose your district and sector.") return early;
  try {
    const ctx = await loadContext(dbQuery);
    if (test) ctx.products = ctx.allProducts;
    const items = itemsFromBody(body);
    // Judge the channel on the whole menu, so a dish off sale says so instead of "closed".
    const channel = channelForItems(items, ctx.allProducts);
    if (!channel.ok) return fail(400, channel.error, "mixed");
    if (channel.channel === "fresh") {
      // Fresh chicken follows the shop's hours. Dishes follow each kitchen's own hours instead.
      const state = shopOpenState(ctx.settings, now);
      if (!state.open && !test) return fail(409, state.message, "shop_closed");
    } else if (!ctx.dishesOnSale && !test) {
      return fail(409, "BigChix dishes are not on sale yet.", "dishes_off");
    }

    let zone = null;
    let quote = null;
    let fulfilment = "delivery";
    let kitchenId = null;
    let input = body;
    if (channel.channel === "kitchen") {
      ctx.kitchens = await loadKitchens(dbQuery);
      const k = quoteKitchenOrder(ctx, body, items, now);
      if (!k.quote.ok) return fail(400, k.quote.error, k.quote.code);
      ({ zone, quote, fulfilment } = k);
      if (fulfilment === "pickup") {
        // Collected at the kitchen: the order carries the kitchen's place, and the kitchen from the start.
        kitchenId = k.kitchen.id;
        input = { ...body, district: k.kitchen.district, sector: k.kitchen.sector };
      }
    }
    const customer = customerFromBody(input, now.getTime(), { pickup: fulfilment === "pickup" });
    if (!customer.ok) return customer;
    const c = customer.values;
    if (channel.channel === "fresh") {
      zone = zoneForSector(ctx.zones, c.district, c.sector);
      quote = quoteShopOrder({ items, products: ctx.products, zone, settings: ctx.settings });
      if (!quote.ok) return fail(400, quote.error, quote.code);
    }

    const token = newTrackToken();
    const lines = quote.lines;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ref = newOrderRef();
      try {
        const r = await dbQuery(
          `WITH o AS (
             INSERT INTO shop_orders
               (ref, track_token_hash, customer_name, customer_phone, district, sector, address_note, zone_id,
                subtotal_rwf, delivery_fee_rwf, total_rwf, commission_pct, commission_rwf, butcher_payout_rwf,
                delivery_paid_by, source, attribution, channel, fulfilment, butcher_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb,
                     $25, $26, $27::uuid)
             RETURNING id, ref, placed_at
           ),
           l AS (
             INSERT INTO shop_order_lines
               (order_id, product_id, sku, name, weight_min_kg, weight_max_kg, unit_price_rwf, qty, line_total_rwf)
             SELECT o.id, t.product_id, t.sku, t.name, t.wmin, t.wmax, t.price, t.qty, t.price * t.qty
               FROM o CROSS JOIN unnest($18::uuid[], $19::text[], $20::text[], $21::numeric[], $22::numeric[],
                                        $23::int[], $24::int[])
                    AS t(product_id, sku, name, wmin, wmax, price, qty)
           ),
           e AS (
             INSERT INTO shop_order_events (order_id, kind, to_status, note)
             SELECT o.id, 'place', 'placed', NULL FROM o
           )
           SELECT ref, placed_at AS "placedAt" FROM o`,
          [
            ref,
            hashToken(token),
            c.name,
            c.phone,
            c.district,
            c.sector,
            c.addressNote,
            zone?.id || null,
            quote.subtotalRwf,
            quote.deliveryFeeRwf,
            quote.totalRwf,
            quote.commissionPct,
            quote.commissionRwf,
            quote.butcherPayoutRwf,
            quote.deliveryPaidBy,
            str(attribution.source, 40) || null,
            JSON.stringify(attribution || {}),
            lines.map((x) => x.productId),
            lines.map((x) => x.sku),
            lines.map((x) => x.name),
            lines.map((x) => x.weightMinKg),
            lines.map((x) => x.weightMaxKg),
            lines.map((x) => x.unitPriceRwf),
            lines.map((x) => x.qty),
            channel.channel,
            fulfilment,
            kitchenId,
          ]
        );
        return {
          ok: true,
          ref: r.rows[0].ref,
          token,
          placedAt: r.rows[0].placedAt,
          quote: publicQuoteView(quote),
        };
      } catch (e) {
        // A ref clash retries with a new ref. Anything else stops.
        if (String(e?.code) === "23505" && String(e?.constraint || "").includes("ref")) continue;
        throw e;
      }
    }
    return fail(503, "Could not create an order reference. Try again.");
  } catch (e) {
    return dbError(e, "Could not place this order.");
  }
}

async function loadOrderByRef(dbQuery, ref) {
  const r = await dbQuery(
    `SELECT o.id::text, o.ref, o.track_token_hash, o.customer_name, o.district, o.sector, o.status,
            o.payment_status, o.momo_txn_id, o.subtotal_rwf, o.delivery_fee_rwf, o.total_rwf,
            o.placed_at, o.updated_at, o.accepted_at, o.ready_at, o.out_at, o.delivered_at, o.cancelled_at,
            o.butcher_id::text, s.pay_within_minutes, o.channel, o.fulfilment,
            k.shop_name AS partner_name, k.district AS partner_district, k.sector AS partner_sector,
            ks.pickup_address, ks.pickup_directions, ks.prep_minutes,
            r.name AS rider_name, r.phone AS rider_phone
       FROM shop_orders o CROSS JOIN shop_settings s
       LEFT JOIN shop_butchers k ON k.id = o.butcher_id
       LEFT JOIN shop_kitchen_settings ks ON ks.partner_id = o.butcher_id
       LEFT JOIN shop_riders r ON r.id = o.rider_id
      WHERE s.id = 1 AND o.ref = $1`,
    [ref]
  );
  return r.rows[0] || null;
}

function firstName(full) {
  return String(full || "").trim().split(/\s+/)[0] || "";
}

/** What the customer's tracking page may show. No phone, address or money split. */
export function publicOrderView(o, lines, payTo) {
  const payBy =
    o.status === "placed"
      ? new Date(new Date(o.updated_at).getTime() + Number(o.pay_within_minutes) * 60000).toISOString()
      : null;
  return {
    ref: o.ref,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentSent: Boolean(o.momo_txn_id),
    firstName: firstName(o.customer_name),
    district: o.district,
    sector: o.sector,
    lines: lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceRwf: l.unit_price_rwf,
      lineTotalRwf: l.line_total_rwf,
      weightMinKg: l.weight_min_kg === null ? null : Number(l.weight_min_kg),
      weightMaxKg: l.weight_max_kg === null ? null : Number(l.weight_max_kg),
    })),
    subtotalRwf: o.subtotal_rwf,
    deliveryFeeRwf: o.delivery_fee_rwf,
    totalRwf: o.total_rwf,
    payToPhone: o.status === "placed" || o.status === "payment_pending" ? payTo : null,
    payBy,
    placedAt: o.placed_at,
    acceptedAt: o.accepted_at,
    readyAt: o.ready_at,
    outAt: o.out_at,
    deliveredAt: o.delivered_at,
    cancelledAt: o.cancelled_at,
    channel: o.channel || "fresh",
    fulfilment: o.fulfilment || "delivery",
    ...kitchenOrderExtras(o),
  };
}

/**
 * Dish orders tell the customer when to expect the food, where to collect it,
 * and who is bringing it. Kitchen and rider details only once they apply.
 */
function kitchenOrderExtras(o) {
  if (o.channel !== "kitchen") return {};
  const kitchenKnown = Boolean(o.butcher_id) && ["paid", "accepted", "ready", "out_for_delivery", "delivered"].includes(o.status);
  const readyBy =
    o.accepted_at && o.prep_minutes ? new Date(new Date(o.accepted_at).getTime() + Number(o.prep_minutes) * 60000).toISOString() : null;
  return {
    kitchenName: kitchenKnown || o.fulfilment === "pickup" ? o.partner_name ?? null : null,
    readyBy,
    pickup:
      o.fulfilment === "pickup"
        ? {
            district: o.partner_district,
            sector: o.partner_sector,
            address: o.pickup_address ?? "",
            directions: o.pickup_directions ?? "",
          }
        : null,
    rider: o.status === "out_for_delivery" && o.rider_name ? { name: o.rider_name, phone: o.rider_phone } : null,
  };
}

/** A wrong ref or wrong token both answer "not found", so refs cannot be probed. */
async function orderForToken(dbQuery, rawRef, token) {
  const ref = normalizeOrderRef(rawRef);
  if (!ref) return null;
  const o = await loadOrderByRef(dbQuery, ref);
  if (!o || !trackTokenMatches(token, o.track_token_hash)) return null;
  return o;
}

export async function getPublicOrder(dbQuery, rawRef, token) {
  try {
    await expireUnpaidOrders(dbQuery);
    await sweepLateKitchenOrders(dbQuery);
    const o = await orderForToken(dbQuery, rawRef, token);
    if (!o) return fail(404, "Order not found.");
    const lines = await dbQuery(
      `SELECT name, qty, unit_price_rwf, line_total_rwf, weight_min_kg, weight_max_kg
         FROM shop_order_lines WHERE order_id = $1::uuid ORDER BY name`,
      [o.id]
    );
    return { ok: true, order: publicOrderView(o, lines.rows, await loadPayTo(dbQuery)) };
  } catch (e) {
    return dbError(e, "Could not load this order.");
  }
}

export async function markPaymentSent(dbQuery, rawRef, token, body) {
  const pay = momoTxnFromBody(body);
  if (!pay.ok) return pay;
  try {
    await expireUnpaidOrders(dbQuery);
    const o = await orderForToken(dbQuery, rawRef, token);
    if (!o) return fail(404, "Order not found.");
    const step = nextShopOrderStatus({ status: o.status }, "pay_sent", { kind: "customer" });
    if (!step.ok) {
      return fail(409, o.status === "expired" ? "This order expired before payment. Please place a new order." : step.error);
    }
    const r = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = 'payment_pending', payment_status = 'pending', momo_txn_id = $2, payer_phone = $3,
                updated_at = now()
          WHERE id = $1::uuid AND status = 'placed'
          RETURNING id, total_rwf
       ),
       s AS (
         INSERT INTO shop_settlements (order_id, side, status, amount_rwf, method, phone, reference)
         SELECT id, 'customer_in', 'pending', total_rwf, 'momo', $3, $2 FROM o
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, kind, from_status, to_status, note)
         SELECT id, 'pay_sent', 'placed', 'payment_pending', $2 FROM o
       )
       SELECT id::text FROM o`,
      [o.id, pay.values.txn, pay.values.payerPhone]
    );
    if (!r.rows[0]) return fail(409, "This order changed. Refresh the page.");
    return { ok: true, status: "payment_pending", ref: o.ref, totalRwf: o.total_rwf };
  } catch (e) {
    return dbError(e, "Could not record the payment.");
  }
}

// ---------- desk ----------

function deskWhere(view) {
  switch (view) {
    case "to_confirm":
      return `o.status = 'payment_pending'`;
    case "open":
      return `o.status IN ('placed', 'payment_pending', 'paid', 'accepted', 'ready', 'out_for_delivery', 'problem')`;
    case "done":
      return `o.status IN ('delivered', 'resolved', 'cancelled', 'expired')`;
    default:
      return `true`;
  }
}

export async function listDeskOrders(dbQuery, view = "open") {
  const v = DESK_VIEWS.includes(view) ? view : "open";
  try {
    await expireUnpaidOrders(dbQuery);
    await sweepLateKitchenOrders(dbQuery);
    const r = await dbQuery(
      `SELECT o.id::text, o.ref, o.status, o.payment_status AS "paymentStatus",
              o.customer_name AS "customerName", o.customer_phone AS "customerPhone",
              o.district, o.sector, o.address_note AS "addressNote",
              o.subtotal_rwf AS "subtotalRwf", o.delivery_fee_rwf AS "deliveryFeeRwf", o.total_rwf AS "totalRwf",
              o.commission_rwf AS "commissionRwf", o.butcher_payout_rwf AS "butcherPayoutRwf",
              o.delivery_paid_by AS "deliveryPaidBy", o.cleva_delivery_cost_rwf AS "clevaDeliveryCostRwf",
              o.momo_txn_id AS "momoTxnId", o.payer_phone AS "payerPhone",
              o.placed_at AS "placedAt", o.updated_at AS "updatedAt", o.paid_confirmed_at AS "paidConfirmedAt",
              o.butcher_id::text AS "butcherId", b.shop_name AS "butcherName", z.name AS "zoneName",
              o.channel, o.fulfilment,
              COALESCE((SELECT json_agg(json_build_object('name', l.name, 'qty', l.qty) ORDER BY l.name)
                          FROM shop_order_lines l WHERE l.order_id = o.id), '[]'::json) AS lines
         FROM shop_orders o
         LEFT JOIN shop_butchers b ON b.id = o.butcher_id
         LEFT JOIN shop_zones z ON z.id = o.zone_id
        WHERE ${deskWhere(v)}
        ORDER BY (o.status = 'payment_pending') DESC, o.placed_at DESC
        LIMIT 200`
    );
    const counts = await dbQuery(
      `SELECT count(*) FILTER (WHERE status = 'payment_pending')::int AS "toConfirm",
              count(*) FILTER (WHERE status IN ('placed', 'payment_pending', 'paid', 'accepted', 'ready',
                                                'out_for_delivery', 'problem'))::int AS "open"
         FROM shop_orders`
    );
    return { ok: true, view: v, orders: r.rows, counts: counts.rows[0] || { toConfirm: 0, open: 0 } };
  } catch (e) {
    return dbError(e, "Could not load orders.");
  }
}

async function loadDeskOrder(dbQuery, id) {
  const r = await dbQuery(
    `SELECT id::text, status, payment_status AS "paymentStatus", butcher_id::text AS "butcherId",
            zone_id::text AS "zoneId", total_rwf AS "totalRwf", channel, fulfilment
       FROM shop_orders WHERE id = $1::uuid`,
    [id]
  );
  return r.rows[0] || null;
}

/** Ops checked MoMo and saw the money. The order goes to the zone's first active butcher. */
export async function confirmPayment(dbQuery, id, actor) {
  try {
    const o = await loadDeskOrder(dbQuery, id);
    if (!o) return fail(404, "Order not found.");
    const step = nextShopOrderStatus(o, "confirm_payment", { kind: "ops" });
    if (!step.ok) return fail(409, step.error);
    let butcherId = o.butcherId;
    let choices = butcherId ? 1 : 0;
    const kitchenOrder = o.channel === "kitchen";
    if (!butcherId && o.zoneId && !kitchenOrder) {
      const links = await dbQuery(
        `SELECT l.butcher_id::text AS "butcherId", l.priority, b.status
           FROM shop_butcher_zones l JOIN shop_butchers b ON b.id = l.butcher_id
          WHERE l.zone_id = $1::uuid AND b.kind = 'butcher'`,
        [o.zoneId]
      );
      ({ butcherId, choices } = pickButcher(links.rows));
    }
    const r = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = 'paid', payment_status = 'paid', paid_confirmed_by = $2::uuid, paid_confirmed_at = now(),
                butcher_id = COALESCE(butcher_id, $3::uuid), updated_at = now()
          WHERE id = $1::uuid AND status = 'payment_pending'
          RETURNING id
       ),
       s AS (
         UPDATE shop_settlements
            SET status = 'paid', confirmed_by = $2::uuid, confirmed_at = now()
          WHERE order_id IN (SELECT id FROM o) AND side = 'customer_in' AND status = 'pending'
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
         SELECT id, $2::uuid, 'confirm_payment', 'payment_pending', 'paid', $4 FROM o
       )
       SELECT id::text FROM o`,
      [id, actor.userId, butcherId, butcherId || kitchenOrder ? null : "No active butcher for this zone"]
    );
    if (!r.rows[0]) return fail(409, "This order changed. Refresh the list.");
    if (kitchenOrder) {
      // Dish orders go to a kitchen now, with that kitchen's fees.
      const routed = await routeKitchenOrder(dbQuery, id, { actorUserId: actor.userId });
      butcherId = routed.kitchenId;
      choices = butcherId ? 1 : 0;
    }
    actor.audit?.(actor.userId, actor.role, "shop.order.confirm_payment", "shop_order", id, {
      butcherId,
      totalRwf: o.totalRwf,
    });
    return { ok: true, status: "paid", butcherId, butcherChoices: choices };
  } catch (e) {
    return dbError(e, "Could not confirm the payment.");
  }
}

/** The MoMo payment was not found. The customer gets a fresh pay window. */
export async function rejectPayment(dbQuery, id, body, actor) {
  const reason = str(body?.reason, 300);
  if (!reason) return fail(400, "Say why the payment was not found.");
  try {
    const o = await loadDeskOrder(dbQuery, id);
    if (!o) return fail(404, "Order not found.");
    const step = nextShopOrderStatus(o, "reject_payment", { kind: "ops" });
    if (!step.ok) return fail(409, step.error);
    const r = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = 'placed', payment_status = 'unpaid', momo_txn_id = NULL, updated_at = now()
          WHERE id = $1::uuid AND status = 'payment_pending'
          RETURNING id
       ),
       s AS (
         UPDATE shop_settlements
            SET status = 'failed', note = $3, confirmed_by = $2::uuid, confirmed_at = now()
          WHERE order_id IN (SELECT id FROM o) AND side = 'customer_in' AND status = 'pending'
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
         SELECT id, $2::uuid, 'reject_payment', 'payment_pending', 'placed', $3 FROM o
       )
       SELECT id::text FROM o`,
      [id, actor.userId, reason]
    );
    if (!r.rows[0]) return fail(409, "This order changed. Refresh the list.");
    actor.audit?.(actor.userId, actor.role, "shop.order.reject_payment", "shop_order", id, { reason });
    return { ok: true, status: "placed" };
  } catch (e) {
    return dbError(e, "Could not reject the payment.");
  }
}

/** Ops cancels. A paid order gets a pending refund for ops to send by MoMo. */
export async function cancelOrder(dbQuery, id, body, actor) {
  const reason = str(body?.reason, 300);
  try {
    const o = await loadDeskOrder(dbQuery, id);
    if (!o) return fail(404, "Order not found.");
    const step = nextShopOrderStatus(o, "cancel", { kind: "ops" }, { reason });
    if (!step.ok) return fail(step.code === "bad_input" ? 400 : 409, step.error);
    const r = await dbQuery(
      `WITH o AS (
         UPDATE shop_orders
            SET status = 'cancelled', cancelled_at = now(), cancel_reason = $3, updated_at = now()
          WHERE id = $1::uuid AND status = $4
          RETURNING id, total_rwf, payer_phone, customer_phone
       ),
       pending AS (
         UPDATE shop_settlements
            SET status = 'cancelled'
          WHERE order_id IN (SELECT id FROM o) AND side = 'customer_in' AND status = 'pending'
       ),
       refund AS (
         INSERT INTO shop_settlements (order_id, side, status, amount_rwf, method, phone, note, created_by)
         SELECT id, 'refund', 'pending', total_rwf, 'momo', COALESCE(payer_phone, customer_phone), $3, $2::uuid
           FROM o WHERE $5
       ),
       e AS (
         INSERT INTO shop_order_events (order_id, actor_user_id, kind, from_status, to_status, note)
         SELECT id, $2::uuid, 'cancel', $4, 'cancelled', $3 FROM o
       )
       SELECT id::text FROM o`,
      [id, actor.userId, reason, o.status, step.needsRefund]
    );
    if (!r.rows[0]) return fail(409, "This order changed. Refresh the list.");
    actor.audit?.(actor.userId, actor.role, "shop.order.cancel", "shop_order", id, {
      reason,
      refund: step.needsRefund,
    });
    return { ok: true, status: "cancelled", refundPending: step.needsRefund };
  } catch (e) {
    return dbError(e, "Could not cancel the order.");
  }
}
