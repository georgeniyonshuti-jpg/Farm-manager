/**
 * Butcher shop setup for the ops desk: settings, products, zones, butchers.
 * The `*FromBody` functions are pure and check input. The rest read and write.
 */

import { isRwandaDistrict, isSectorInDistrict } from "../pipeline/rwandaLocations.js";
import { normalizeRwandaPhone, rwandaPhoneError } from "../pipeline/rwandaPhone.js";
import { zoneSectorConflicts } from "./assignButcher.js";
import { isAllowedPhotoUrl } from "./shopPhotos.js";

export const BUTCHER_STATUSES = ["pending", "active", "paused", "ended"];

/** Shelves on the public shop, in display order. */
export const SHOP_CATEGORIES = ["whole", "cuts", "prepared", "cooked"];

function str(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function intOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function bad(error) {
  return { ok: false, status: 400, error };
}

function dbError(e, fallback) {
  if (String(e?.code) === "42P01") {
    return { ok: false, status: 503, error: "The shop tables are not in the database yet. Run migration 095 after a backup." };
  }
  if (String(e?.code) === "23505") return { ok: false, status: 409, error: "That code is already used." };
  return { ok: false, status: 500, error: e instanceof Error ? e.message : fallback };
}

// ---------- input checks (pure) ----------

export function settingsFromBody(body) {
  const pct = Number(body?.commissionPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return bad("Commission must be between 0 and 100.");
  const values = {
    commissionPct: Math.round(pct * 100) / 100,
    minOrderRwf: intOrNull(body?.minOrderRwf) ?? 0,
    minOrderItems: intOrNull(body?.minOrderItems) ?? 0,
    payWithinMinutes: intOrNull(body?.payWithinMinutes),
    acceptWithinMinutes: intOrNull(body?.acceptWithinMinutes),
    isOpen: body?.isOpen === true,
    closedMessage: str(body?.closedMessage, 300),
    openTime: str(body?.openTime, 5) || "08:00",
    closeTime: str(body?.closeTime, 5) || "18:00",
  };
  if (!Number.isInteger(values.minOrderRwf) || values.minOrderRwf < 0) return bad("Minimum amount must be a whole number, 0 or more.");
  if (!Number.isInteger(values.minOrderItems) || values.minOrderItems < 0) return bad("Minimum items must be a whole number, 0 or more.");
  if (!(values.payWithinMinutes > 0)) return bad("Pay-within minutes must be above 0.");
  if (!(values.acceptWithinMinutes > 0)) return bad("Accept-within minutes must be above 0.");
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(values.openTime) || !hhmm.test(values.closeTime)) return bad("Hours must look like 08:00.");
  if (values.closeTime <= values.openTime) return bad("Closing time must be after opening time.");
  return { ok: true, values };
}

export function productFromBody(body) {
  const sku = str(body?.sku, 20).toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(sku)) return bad("Code must be 2–20 letters, numbers or dashes.");
  const name = str(body?.name, 80);
  if (!name) return bad("Name is required.");
  const priceRwf = intOrNull(body?.priceRwf);
  if (!(priceRwf > 0)) return bad("Price must be a whole number of RWF above 0.");
  const weightMinKg = numOrNull(body?.weightMinKg);
  const weightMaxKg = numOrNull(body?.weightMaxKg);
  if (Number.isNaN(weightMinKg) || Number.isNaN(weightMaxKg)) return bad("Weights must be numbers.");
  if ((weightMinKg !== null && weightMinKg <= 0) || (weightMaxKg !== null && weightMaxKg <= 0)) {
    return bad("Weights must be above 0.");
  }
  if (weightMinKg !== null && weightMaxKg !== null && weightMaxKg < weightMinKg) {
    return bad("Largest weight must not be below the smallest.");
  }
  const sortOrder = intOrNull(body?.sortOrder) ?? 0;
  if (!Number.isInteger(sortOrder)) return bad("Order must be a whole number.");
  const photoUrl = str(body?.photoUrl, 500) || null;
  const category = str(body?.category, 20) || "whole";
  if (!SHOP_CATEGORIES.includes(category)) return bad("Choose a category.");
  if (photoUrl && !isAllowedPhotoUrl(photoUrl)) return bad("Upload the photo again.");
  return {
    ok: true,
    values: {
      sku,
      name,
      nameRw: str(body?.nameRw, 80),
      description: str(body?.description, 400),
      descriptionRw: str(body?.descriptionRw, 400),
      weightMinKg,
      weightMaxKg,
      priceRwf,
      photoUrl,
      category,
      active: body?.active !== false,
      sortOrder,
    },
  };
}

export function zoneFromBody(body) {
  const name = str(body?.name, 80);
  if (!name) return bad("Zone name is required.");
  const district = str(body?.district, 60);
  if (!isRwandaDistrict(district)) return bad("Choose a district.");
  const raw = Array.isArray(body?.sectors) ? body.sectors : [];
  const sectors = [...new Set(raw.map((s) => str(s, 60)).filter(Boolean))];
  if (sectors.length === 0) return bad("Choose at least one sector.");
  const outside = sectors.filter((s) => !isSectorInDistrict(district, s));
  if (outside.length) return bad(`Not in ${district}: ${outside.join(", ")}.`);
  const deliveryFeeRwf = intOrNull(body?.deliveryFeeRwf) ?? 0;
  if (!Number.isInteger(deliveryFeeRwf) || deliveryFeeRwf < 0) return bad("Delivery fee must be a whole number, 0 or more.");
  const freeDeliveryOverRwf = intOrNull(body?.freeDeliveryOverRwf);
  if (Number.isNaN(freeDeliveryOverRwf) || (freeDeliveryOverRwf !== null && freeDeliveryOverRwf < 0)) {
    return bad("Free-delivery amount must be a whole number, or blank for none.");
  }
  return {
    ok: true,
    values: { name, district, sectors, deliveryFeeRwf, freeDeliveryOverRwf, active: body?.active !== false },
  };
}

export function butcherFromBody(body, { noun = "butcher" } = {}) {
  const shopName = str(body?.shopName, 100);
  if (!shopName) return bad(noun === "kitchen" ? "Kitchen name is required." : "Shop name is required.");
  const phoneErr = rwandaPhoneError(body?.phone, { required: true });
  if (phoneErr) return bad(phoneErr);
  const whatsappErr = rwandaPhoneError(body?.whatsapp);
  if (whatsappErr) return bad(`WhatsApp: ${whatsappErr}`);
  const payoutErr = rwandaPhoneError(body?.momoPayoutPhone);
  if (payoutErr) return bad(`MoMo payout: ${payoutErr}`);
  const district = str(body?.district, 60);
  const sector = str(body?.sector, 60);
  if (district && !isRwandaDistrict(district)) return bad("Choose a district.");
  if (sector && !isSectorInDistrict(district, sector)) return bad(`${sector} is not in ${district || "that district"}.`);
  const status = BUTCHER_STATUSES.includes(body?.status) ? body.status : "pending";
  const loginEmail = str(body?.loginEmail, 200).toLowerCase();
  if (loginEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) return bad("Login email does not look right.");
  const values = {
    shopName,
    ownerName: str(body?.ownerName, 100),
    phone: normalizeRwandaPhone(body?.phone),
    whatsapp: normalizeRwandaPhone(body?.whatsapp) || null,
    district: district || null,
    sector: sector || null,
    addressNote: str(body?.addressNote, 300),
    licenceRef: str(body?.licenceRef, 80),
    momoPayoutPhone: normalizeRwandaPhone(body?.momoPayoutPhone) || null,
    momoPayoutName: str(body?.momoPayoutName, 100),
    status,
    notes: str(body?.notes, 1000),
    loginEmail,
  };
  if (status === "active") {
    const missing = [];
    if (!values.licenceRef) missing.push("licence number");
    if (!values.momoPayoutPhone) missing.push("MoMo payout number");
    if (!values.momoPayoutName) missing.push("MoMo account name");
    if (missing.length) return bad(`Before making this ${noun} active, add: ${missing.join(", ")}.`);
  }
  const zonesRaw = Array.isArray(body?.zones) ? body.zones : [];
  const zones = [];
  const seen = new Set();
  for (const z of zonesRaw) {
    const zoneId = str(z?.zoneId, 64);
    if (!zoneId || seen.has(zoneId)) continue;
    const priority = intOrNull(z?.priority) ?? 100;
    if (!Number.isInteger(priority) || priority < 0) return bad("Priority must be a whole number, 0 or more.");
    seen.add(zoneId);
    zones.push({ zoneId, priority });
  }
  return { ok: true, values, zones };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A BigChix kitchen: the partner fields butchers use, plus hours, preparation
 * time, capacity, pickup details and the dishes it makes with its fee for each.
 * `products` = the menu rows, to check each dish and keep fees below the price.
 */
export function kitchenFromBody(body, products = []) {
  const partner = butcherFromBody(body, { noun: "kitchen" });
  if (!partner.ok) return partner;

  const hours = {};
  for (const day of WEEKDAYS) {
    const h = body?.hours?.[day];
    if (!h || (!h.open && !h.close)) {
      hours[day] = null;
      continue;
    }
    const open = str(h.open, 5);
    const close = str(h.close, 5);
    if (!HHMM.test(open) || !HHMM.test(close)) return bad("Opening hours must look like 11:00.");
    if (close <= open) return bad("Each day must close after it opens.");
    hours[day] = { open, close };
  }

  const prepMinutes = intOrNull(body?.prepMinutes) ?? 25;
  if (!Number.isInteger(prepMinutes) || prepMinutes < 5 || prepMinutes > 180) {
    return bad("Preparation time must be between 5 and 180 minutes.");
  }
  const maxOpenOrders = intOrNull(body?.maxOpenOrders) ?? 10;
  if (!Number.isInteger(maxOpenOrders) || maxOpenOrders < 1 || maxOpenOrders > 200) {
    return bad("Most open orders must be between 1 and 200.");
  }
  const pickupEnabled = body?.pickupEnabled === true;
  const pickupAddress = str(body?.pickupAddress, 300);
  if (pickupEnabled && !pickupAddress) return bad("Add the pickup address, or turn pickup off.");
  if (pickupEnabled && !(partner.values.district && partner.values.sector)) {
    return bad("Choose the kitchen's district and sector, so pickup orders show where it is.");
  }

  const byId = new Map(products.map((p) => [String(p.id), p]));
  const dishes = [];
  const seen = new Set();
  for (const d of Array.isArray(body?.dishes) ? body.dishes : []) {
    const productId = str(d?.productId, 64);
    if (!productId || seen.has(productId)) continue;
    const product = byId.get(productId);
    if (!product) return bad("One of the dishes is no longer on the menu.");
    if ((product.category || "whole") !== "cooked") return bad(`${product.name} is not a BigChix dish.`);
    const feeRwf = intOrNull(d?.feeRwf);
    if (!Number.isInteger(feeRwf) || feeRwf < 0) return bad(`Fee for ${product.name} must be a whole number of RWF.`);
    if (feeRwf >= product.price_rwf) {
      return bad(`Fee for ${product.name} must be below its price of ${product.price_rwf} RWF, or Cleva loses money on it.`);
    }
    seen.add(productId);
    dishes.push({ productId, feeRwf });
  }

  if (partner.values.status === "active") {
    const missing = [];
    if (dishes.length === 0) missing.push("at least one dish with its fee");
    if (!WEEKDAYS.some((d) => hours[d])) missing.push("opening hours");
    if (partner.zones.length === 0 && !pickupEnabled) missing.push("a delivery zone or pickup");
    if (missing.length) return bad(`Before making this kitchen active, add: ${missing.join(", ")}.`);
  }

  return {
    ok: true,
    values: partner.values,
    zones: partner.zones,
    kitchen: {
      hours,
      prepMinutes,
      maxOpenOrders,
      takingOrders: body?.takingOrders === true,
      pickupEnabled,
      pickupAddress,
      pickupDirections: str(body?.pickupDirections, 500),
    },
    dishes,
  };
}

/** What still stops the shop from opening. Empty means it can open. */
export function openBlockers(counts) {
  const out = [];
  if (!(counts.activeProducts > 0)) out.push("Add at least one product that is on sale.");
  if (!(counts.servedZones > 0)) out.push("Add a zone with at least one active butcher.");
  return out;
}

// ---------- rows to API shape ----------

function mapSettings(r) {
  const hours = r.order_hours || {};
  return {
    commissionPct: Number(r.commission_pct),
    minOrderRwf: r.min_order_rwf,
    minOrderItems: r.min_order_items,
    payWithinMinutes: r.pay_within_minutes,
    acceptWithinMinutes: r.accept_within_minutes,
    isOpen: r.is_open,
    closedMessage: r.closed_message,
    openTime: hours.open || "08:00",
    closeTime: hours.close || "18:00",
    updatedAt: r.updated_at,
  };
}

function mapProduct(r) {
  return {
    id: r.id,
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
    active: r.active,
    sortOrder: r.sort_order,
  };
}

function mapZone(r) {
  return {
    id: r.id,
    name: r.name,
    district: r.district,
    sectors: r.sectors || [],
    deliveryFeeRwf: r.delivery_fee_rwf,
    freeDeliveryOverRwf: r.free_delivery_over_rwf,
    active: r.active,
  };
}

function mapButcher(r, links) {
  return {
    id: r.id,
    userId: r.user_id,
    loginEmail: r.login_email ?? null,
    shopName: r.shop_name,
    ownerName: r.owner_name,
    phone: r.phone,
    whatsapp: r.whatsapp,
    district: r.district,
    sector: r.sector,
    addressNote: r.address_note,
    licenceRef: r.licence_ref,
    momoPayoutPhone: r.momo_payout_phone,
    momoPayoutName: r.momo_payout_name,
    status: r.status,
    notes: r.notes,
    zones: links.filter((l) => l.butcher_id === r.id).map((l) => ({ zoneId: l.zone_id, priority: l.priority })),
  };
}

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function mapKitchen(r, links, settingsRows, dishRows) {
  const s = settingsRows.find((x) => x.partner_id === r.id) || {};
  const base = mapButcher(r, links);
  delete base.userId;
  return {
    ...base,
    hours: kitchenHoursFrom(s.hours),
    prepMinutes: s.prep_minutes ?? 25,
    maxOpenOrders: s.max_open_orders ?? 10,
    takingOrders: s.taking_orders ?? false,
    pickupEnabled: s.pickup_enabled ?? false,
    pickupAddress: s.pickup_address ?? "",
    pickupDirections: s.pickup_directions ?? "",
    dishes: dishRows
      .filter((d) => d.partner_id === r.id)
      .map((d) => ({ productId: d.product_id, feeRwf: d.fee_rwf, soldOutOn: d.sold_out_on })),
  };
}

/** Always all seven days, each {open, close} or null (closed). */
function kitchenHoursFrom(raw) {
  const h = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    WEEKDAYS.map((d) => [d, h[d] && h[d].open && h[d].close ? { open: h[d].open, close: h[d].close } : null])
  );
}

// ---------- reads ----------

async function loadAll(dbQuery) {
  const [settings, products, zones, butchers, links] = await Promise.all([
    dbQuery(`SELECT * FROM shop_settings WHERE id = 1`),
    dbQuery(`SELECT * FROM shop_products ORDER BY sort_order, name`),
    dbQuery(`SELECT id::text, name, district, sectors, delivery_fee_rwf, free_delivery_over_rwf, active
               FROM shop_zones ORDER BY district, name`),
    dbQuery(`SELECT b.id::text, b.user_id::text, u.email AS login_email, b.shop_name, b.owner_name, b.phone,
                    b.whatsapp, b.district, b.sector, b.address_note, b.licence_ref, b.momo_payout_phone,
                    b.momo_payout_name, b.status, b.notes, b.kind
               FROM shop_butchers b LEFT JOIN users u ON u.id = b.user_id
              ORDER BY b.shop_name`),
    dbQuery(`SELECT butcher_id::text, zone_id::text, priority FROM shop_butcher_zones`),
  ]);
  const [kitchenSettings, kitchenDishes] = await Promise.all([
    dbQuery(`SELECT partner_id::text, hours, prep_minutes, max_open_orders, taking_orders,
                    pickup_enabled, pickup_address, pickup_directions
               FROM shop_kitchen_settings`),
    dbQuery(`SELECT partner_id::text, product_id::text, fee_rwf, sold_out_on::text FROM shop_kitchen_dishes`),
  ]);
  return {
    settings: settings.rows[0],
    products: products.rows,
    zones: zones.rows,
    butchers: butchers.rows,
    links: links.rows,
    kitchenSettings: kitchenSettings.rows,
    kitchenDishes: kitchenDishes.rows,
  };
}

function countsFrom(all) {
  const activeButchers = new Set(
    all.butchers.filter((b) => b.status === "active" && (b.kind || "butcher") === "butcher").map((b) => b.id)
  );
  const activeZones = new Set(all.zones.filter((z) => z.active).map((z) => z.id));
  const served = new Set(
    all.links.filter((l) => activeButchers.has(l.butcher_id) && activeZones.has(l.zone_id)).map((l) => l.zone_id)
  );
  return { activeProducts: all.products.filter((p) => p.active).length, servedZones: served.size };
}

export async function getShopSetup(dbQuery) {
  try {
    const all = await loadAll(dbQuery);
    return {
      ok: true,
      settings: all.settings ? mapSettings(all.settings) : null,
      products: all.products.map((r) => mapProduct({ ...r, id: String(r.id) })),
      zones: all.zones.map(mapZone),
      butchers: all.butchers.filter((b) => (b.kind || "butcher") === "butcher").map((b) => mapButcher(b, all.links)),
      dishesOnSale: all.settings?.dishes_on_sale === true,
      kitchens: all.butchers
        .filter((b) => b.kind === "kitchen")
        .map((b) => mapKitchen(b, all.links, all.kitchenSettings, all.kitchenDishes)),
      openBlockers: openBlockers(countsFrom(all)),
    };
  } catch (e) {
    return dbError(e, "Could not load the shop setup.");
  }
}

// ---------- writes ----------

export async function saveShopSettings(dbQuery, body, actor) {
  const parsed = settingsFromBody(body);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  try {
    if (v.isOpen) {
      const blockers = openBlockers(countsFrom(await loadAll(dbQuery)));
      if (blockers.length) return bad(`The shop cannot open yet. ${blockers.join(" ")}`);
    }
    const r = await dbQuery(
      `UPDATE shop_settings
          SET commission_pct = $1, min_order_rwf = $2, min_order_items = $3,
              pay_within_minutes = $4, accept_within_minutes = $5, is_open = $6,
              closed_message = $7, order_hours = $8::jsonb, updated_at = now(), updated_by = $9::uuid
        WHERE id = 1
        RETURNING *`,
      [
        v.commissionPct,
        v.minOrderRwf,
        v.minOrderItems,
        v.payWithinMinutes,
        v.acceptWithinMinutes,
        v.isOpen,
        v.closedMessage,
        JSON.stringify({ open: v.openTime, close: v.closeTime }),
        actor.userId,
      ]
    );
    actor.audit?.(actor.userId, actor.role, "shop.settings.save", "shop_settings", "1", {
      commissionPct: v.commissionPct,
      isOpen: v.isOpen,
    });
    return { ok: true, settings: mapSettings(r.rows[0]) };
  } catch (e) {
    return dbError(e, "Could not save the shop settings.");
  }
}

export async function saveProduct(dbQuery, id, body, actor) {
  const parsed = productFromBody(body);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  const params = [
    v.sku, v.name, v.nameRw, v.description, v.descriptionRw,
    v.weightMinKg, v.weightMaxKg, v.priceRwf, v.photoUrl, v.active, v.sortOrder, v.category,
  ];
  try {
    const r = id
      ? await dbQuery(
          `UPDATE shop_products
              SET sku = $1, name = $2, name_rw = $3, description = $4, description_rw = $5,
                  weight_min_kg = $6, weight_max_kg = $7, price_rwf = $8, photo_url = $9,
                  active = $10, sort_order = $11, category = $12, updated_at = now()
            WHERE id = $13::uuid
            RETURNING *`,
          [...params, id]
        )
      : await dbQuery(
          `INSERT INTO shop_products
             (sku, name, name_rw, description, description_rw, weight_min_kg, weight_max_kg,
              price_rwf, photo_url, active, sort_order, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          params
        );
    if (!r.rows[0]) return { ok: false, status: 404, error: "Product not found." };
    const product = mapProduct({ ...r.rows[0], id: String(r.rows[0].id) });
    actor.audit?.(actor.userId, actor.role, id ? "shop.product.update" : "shop.product.create", "shop_product", product.id, {
      sku: v.sku,
      priceRwf: v.priceRwf,
      active: v.active,
    });
    return { ok: true, product };
  } catch (e) {
    return dbError(e, "Could not save the product.");
  }
}

export async function saveZone(dbQuery, id, body, actor) {
  const parsed = zoneFromBody(body);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  try {
    const existing = await dbQuery(`SELECT id::text, name, district, sectors, active FROM shop_zones`);
    const clashes = zoneSectorConflicts(existing.rows, { id: id || "__new__", ...v });
    if (clashes.length) {
      const list = clashes.map((c) => `${c.sector} (${c.zoneName})`).join(", ");
      return { ok: false, status: 409, error: `Already in another active zone: ${list}.` };
    }
    const params = [v.name, v.district, v.sectors, v.deliveryFeeRwf, v.freeDeliveryOverRwf, v.active];
    const r = id
      ? await dbQuery(
          `UPDATE shop_zones
              SET name = $1, district = $2, sectors = $3::text[], delivery_fee_rwf = $4,
                  free_delivery_over_rwf = $5, active = $6, updated_at = now()
            WHERE id = $7::uuid
            RETURNING id::text, name, district, sectors, delivery_fee_rwf, free_delivery_over_rwf, active`,
          [...params, id]
        )
      : await dbQuery(
          `INSERT INTO shop_zones (name, district, sectors, delivery_fee_rwf, free_delivery_over_rwf, active)
           VALUES ($1, $2, $3::text[], $4, $5, $6)
           RETURNING id::text, name, district, sectors, delivery_fee_rwf, free_delivery_over_rwf, active`,
          params
        );
    if (!r.rows[0]) return { ok: false, status: 404, error: "Zone not found." };
    const zone = mapZone(r.rows[0]);
    actor.audit?.(actor.userId, actor.role, id ? "shop.zone.update" : "shop.zone.create", "shop_zone", zone.id, {
      deliveryFeeRwf: v.deliveryFeeRwf,
      freeDeliveryOverRwf: v.freeDeliveryOverRwf,
      active: v.active,
    });
    return { ok: true, zone };
  } catch (e) {
    return dbError(e, "Could not save the zone.");
  }
}

/**
 * The butcher's login is a normal user with role "butcher", created under
 * Users first. Linking it here lets that person see this shop's orders.
 */
export async function findButcherLogin(dbQuery, email) {
  const r = await dbQuery(`SELECT id::text, email, role FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
  const u = r.rows[0];
  if (!u) return { error: "No user has that email. Create the login under Users first, with the role Butcher." };
  if (u.role !== "butcher") return { error: `That user's role is ${u.role}. Change it to Butcher before linking.` };
  return { userId: u.id, email: u.email };
}

export async function saveButcher(dbQuery, id, body, actor) {
  const parsed = butcherFromBody(body);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  let login = { userId: null, email: null };
  if (v.loginEmail) {
    try {
      login = await findButcherLogin(dbQuery, v.loginEmail);
    } catch (e) {
      return dbError(e, "Could not check the login.");
    }
    if (login.error) return bad(login.error);
  }
  const params = [
    v.shopName, v.ownerName, v.phone, v.whatsapp, v.district, v.sector, v.addressNote,
    v.licenceRef, v.momoPayoutPhone, v.momoPayoutName, v.status, v.notes,
  ];
  const cols = `id::text, user_id::text, shop_name, owner_name, phone, whatsapp, district, sector,
                address_note, licence_ref, momo_payout_phone, momo_payout_name, status, notes`;
  const write = id
    ? `UPDATE shop_butchers
          SET shop_name = $1, owner_name = $2, phone = $3, whatsapp = $4, district = $5, sector = $6,
              address_note = $7, licence_ref = $8, momo_payout_phone = $9, momo_payout_name = $10,
              status = $11, notes = $12, user_id = $16::uuid, updated_at = now()
        WHERE id = $13::uuid AND kind = 'butcher'
        RETURNING ${cols}`
    : `INSERT INTO shop_butchers
         (shop_name, owner_name, phone, whatsapp, district, sector, address_note,
          licence_ref, momo_payout_phone, momo_payout_name, status, notes, created_by, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::uuid, $16::uuid)
       RETURNING ${cols}`;
  const zoneIds = parsed.zones.map((z) => z.zoneId);
  const priorities = parsed.zones.map((z) => z.priority);
  try {
    // One statement, so the butcher and their zones change together or not at all.
    // dbQuery is a pool, so BEGIN/COMMIT across calls would not be one transaction.
    const r = await dbQuery(
      `WITH b AS (${write}),
            dropped AS (
              DELETE FROM shop_butcher_zones
               WHERE butcher_id IN (SELECT id::uuid FROM b)
                 AND NOT (zone_id = ANY($14::uuid[]))
            ),
            kept AS (
              INSERT INTO shop_butcher_zones (butcher_id, zone_id, priority)
              SELECT b.id::uuid, t.zone_id, t.priority
                FROM b CROSS JOIN unnest($14::uuid[], $15::int[]) AS t(zone_id, priority)
              ON CONFLICT (butcher_id, zone_id) DO UPDATE SET priority = EXCLUDED.priority
            )
       SELECT * FROM b`,
      [...params, id || actor.userId, zoneIds, priorities, login.userId]
    );
    const row = r.rows[0];
    if (!row) return { ok: false, status: 404, error: "Butcher not found." };
    const links = parsed.zones.map((z) => ({ butcher_id: row.id, zone_id: z.zoneId, priority: z.priority }));
    actor.audit?.(actor.userId, actor.role, id ? "shop.butcher.update" : "shop.butcher.create", "shop_butcher", row.id, {
      status: v.status,
      zones: parsed.zones.length,
    });
    return { ok: true, butcher: mapButcher({ ...row, login_email: login.email }, links) };
  } catch (e) {
    if (String(e?.code) === "23505" && String(e?.constraint || "").includes("user_id")) {
      return bad("That login is already linked to another butcher.");
    }
    if (String(e?.code) === "23503") return bad("One of the chosen zones no longer exists.");
    if (String(e?.code) === "22P02") return bad("One of the chosen zones is not valid.");
    return dbError(e, "Could not save the butcher.");
  }
}

export async function saveKitchen(dbQuery, id, body, actor) {
  let products;
  try {
    products = (await dbQuery(`SELECT id::text, name, price_rwf, category FROM shop_products`)).rows;
  } catch (e) {
    return dbError(e, "Could not load the menu.");
  }
  const parsed = kitchenFromBody(body, products);
  if (!parsed.ok) return parsed;
  const v = parsed.values;
  const k = parsed.kitchen;
  let login = { userId: null, email: null };
  if (v.loginEmail) {
    try {
      login = await findButcherLogin(dbQuery, v.loginEmail);
    } catch (e) {
      return dbError(e, "Could not check the login.");
    }
    if (login.error) return bad(login.error);
  }
  const params = [
    v.shopName, v.ownerName, v.phone, v.whatsapp, v.district, v.sector, v.addressNote,
    v.licenceRef, v.momoPayoutPhone, v.momoPayoutName, v.status, v.notes,
  ];
  const cols = `id::text, user_id::text, shop_name, owner_name, phone, whatsapp, district, sector,
                address_note, licence_ref, momo_payout_phone, momo_payout_name, status, notes, kind`;
  const write = id
    ? `UPDATE shop_butchers
          SET shop_name = $1, owner_name = $2, phone = $3, whatsapp = $4, district = $5, sector = $6,
              address_note = $7, licence_ref = $8, momo_payout_phone = $9, momo_payout_name = $10,
              status = $11, notes = $12, user_id = $25::uuid, updated_at = now()
        WHERE id = $13::uuid AND kind = 'kitchen'
        RETURNING ${cols}`
    : `INSERT INTO shop_butchers
         (shop_name, owner_name, phone, whatsapp, district, sector, address_note,
          licence_ref, momo_payout_phone, momo_payout_name, status, notes, created_by, kind, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::uuid, 'kitchen', $25::uuid)
       RETURNING ${cols}`;
  try {
    // One statement: the kitchen, its zones, settings and dishes change together or not at all.
    const r = await dbQuery(
      `WITH b AS (${write}),
            zones_dropped AS (
              DELETE FROM shop_butcher_zones
               WHERE butcher_id IN (SELECT id::uuid FROM b)
                 AND NOT (zone_id = ANY($14::uuid[]))
            ),
            zones_kept AS (
              INSERT INTO shop_butcher_zones (butcher_id, zone_id, priority)
              SELECT b.id::uuid, t.zone_id, t.priority
                FROM b CROSS JOIN unnest($14::uuid[], $15::int[]) AS t(zone_id, priority)
              ON CONFLICT (butcher_id, zone_id) DO UPDATE SET priority = EXCLUDED.priority
            ),
            settings AS (
              INSERT INTO shop_kitchen_settings
                (partner_id, hours, prep_minutes, max_open_orders, taking_orders,
                 pickup_enabled, pickup_address, pickup_directions)
              SELECT b.id::uuid, $16::jsonb, $17, $18, $19, $20, $21, $22 FROM b
              ON CONFLICT (partner_id) DO UPDATE
                SET hours = EXCLUDED.hours, prep_minutes = EXCLUDED.prep_minutes,
                    max_open_orders = EXCLUDED.max_open_orders, taking_orders = EXCLUDED.taking_orders,
                    pickup_enabled = EXCLUDED.pickup_enabled, pickup_address = EXCLUDED.pickup_address,
                    pickup_directions = EXCLUDED.pickup_directions, updated_at = now()
            ),
            dishes_dropped AS (
              DELETE FROM shop_kitchen_dishes
               WHERE partner_id IN (SELECT id::uuid FROM b)
                 AND NOT (product_id = ANY($23::uuid[]))
            ),
            dishes_kept AS (
              INSERT INTO shop_kitchen_dishes (partner_id, product_id, fee_rwf)
              SELECT b.id::uuid, t.product_id, t.fee_rwf
                FROM b CROSS JOIN unnest($23::uuid[], $24::int[]) AS t(product_id, fee_rwf)
              ON CONFLICT (partner_id, product_id) DO UPDATE SET fee_rwf = EXCLUDED.fee_rwf, updated_at = now()
            )
       SELECT * FROM b`,
      [
        ...params,
        id || actor.userId,
        parsed.zones.map((z) => z.zoneId),
        parsed.zones.map((z) => z.priority),
        JSON.stringify(k.hours),
        k.prepMinutes,
        k.maxOpenOrders,
        k.takingOrders,
        k.pickupEnabled,
        k.pickupAddress,
        k.pickupDirections,
        parsed.dishes.map((d) => d.productId),
        parsed.dishes.map((d) => d.feeRwf),
        login.userId,
      ]
    );
    const row = r.rows[0];
    if (!row) return { ok: false, status: 404, error: "Kitchen not found." };
    const links = parsed.zones.map((z) => ({ butcher_id: row.id, zone_id: z.zoneId, priority: z.priority }));
    const settingsRow = {
      partner_id: row.id,
      hours: k.hours,
      prep_minutes: k.prepMinutes,
      max_open_orders: k.maxOpenOrders,
      taking_orders: k.takingOrders,
      pickup_enabled: k.pickupEnabled,
      pickup_address: k.pickupAddress,
      pickup_directions: k.pickupDirections,
    };
    const dishRows = parsed.dishes.map((d) => ({ partner_id: row.id, product_id: d.productId, fee_rwf: d.feeRwf, sold_out_on: null }));
    actor.audit?.(actor.userId, actor.role, id ? "shop.kitchen.update" : "shop.kitchen.create", "shop_butcher", row.id, {
      status: v.status,
      zones: parsed.zones.length,
      dishes: parsed.dishes.map((d) => ({ productId: d.productId, feeRwf: d.feeRwf })),
    });
    return { ok: true, kitchen: mapKitchen({ ...row, login_email: login.email }, links, [settingsRow], dishRows) };
  } catch (e) {
    if (String(e?.code) === "23505" && String(e?.constraint || "").includes("user_id")) {
      return bad("That login is already linked to another butcher or kitchen.");
    }
    if (String(e?.code) === "23503") return bad("One of the chosen zones or dishes no longer exists.");
    if (String(e?.code) === "22P02") return bad("One of the chosen zones or dishes is not valid.");
    return dbError(e, "Could not save the kitchen.");
  }
}

/**
 * What still stops BigChix dishes going on sale. Empty means they can.
 * Needs a dish on the menu, an active kitchen that makes it with opening
 * hours, and a way to reach customers: a rider for delivery, or pickup.
 */
export function dishesOnSaleBlockers(c) {
  const out = [];
  if (!(c.activeDishes > 0)) out.push("Add at least one dish to the menu that is on sale.");
  if (!(c.readyKitchens > 0)) out.push("Make a kitchen active, with opening hours and at least one dish and its fee.");
  if (!(c.activeRiders > 0) && !(c.pickupKitchens > 0)) out.push("Add a rider, or turn on pickup at a kitchen.");
  return out;
}

export async function setDishesOnSale(dbQuery, body, actor) {
  const onSale = body?.onSale === true;
  try {
    if (onSale) {
      const r = await dbQuery(
        `SELECT
           (SELECT count(*) FROM shop_products WHERE active AND category = 'cooked')::int AS "activeDishes",
           (SELECT count(*) FROM shop_butchers b JOIN shop_kitchen_settings s ON s.partner_id = b.id
             WHERE b.kind = 'kitchen' AND b.status = 'active' AND s.hours <> '{}'::jsonb
               AND EXISTS (SELECT 1 FROM shop_kitchen_dishes d JOIN shop_products p ON p.id = d.product_id
                            WHERE d.partner_id = b.id AND p.active AND p.category = 'cooked'))::int AS "readyKitchens",
           (SELECT count(*) FROM shop_butchers b JOIN shop_kitchen_settings s ON s.partner_id = b.id
             WHERE b.kind = 'kitchen' AND b.status = 'active' AND s.pickup_enabled)::int AS "pickupKitchens",
           (SELECT count(*) FROM shop_riders WHERE active)::int AS "activeRiders"`
      );
      const blockers = dishesOnSaleBlockers(r.rows[0] || {});
      if (blockers.length) return bad(`Dishes cannot go on sale yet. ${blockers.join(" ")}`);
    }
    await dbQuery(
      `UPDATE shop_settings SET dishes_on_sale = $1, updated_at = now(), updated_by = $2::uuid WHERE id = 1`,
      [onSale, actor.userId]
    );
    actor.audit?.(actor.userId, actor.role, "shop.dishes_on_sale", "shop_settings", "1", { onSale });
    return { ok: true, dishesOnSale: onSale };
  } catch (e) {
    return dbError(e, "Could not change whether dishes are on sale.");
  }
}
