import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashToken } from "../src/services/shop/orderRef.js";
import {
  cancelOrder,
  confirmPayment,
  customerFromBody,
  getPublicOrder,
  kigaliClock,
  markPaymentSent,
  momoTxnFromBody,
  placeShopOrder,
  publicOrderView,
  rejectPayment,
  shopOpenState,
} from "../src/services/shop/shopOrders.js";

// 10:00 in Kigali (UTC+2).
const NOW = new Date("2026-11-03T08:00:00Z");
const actor = { userId: "11111111-1111-4111-8111-111111111111", role: "sales_coordinator", audit: null };

const settingsRow = {
  id: 1,
  commission_pct: "12",
  min_order_rwf: 10000,
  min_order_items: 2,
  pay_within_minutes: 30,
  accept_within_minutes: 20,
  is_open: true,
  closed_message: "",
  order_hours: { open: "08:00", close: "18:00" },
};
const productRows = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sku: "CK-M", name: "Medium chicken", weight_min_kg: "1.4", weight_max_kg: "1.6", price_rwf: 8000, active: true },
];
const zoneRows = [
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Remera", district: "Gasabo", sectors: ["Remera"], delivery_fee_rwf: 2000, free_delivery_over_rwf: 25000, active: true },
];

const customer = {
  customerName: "Aline Uwase",
  phone: "0788123456",
  district: "Gasabo",
  sector: "Remera",
  addressNote: "Near the bus stop, blue gate",
  items: [{ sku: "CK-M", qty: 2 }],
};

function fakeDb(handlers = []) {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    for (const [match, result] of handlers) {
      if (sql.includes(match)) {
        if (result instanceof Error) throw result;
        return { rows: typeof result === "function" ? result(sql, params, calls) : result };
      }
    }
    return { rows: [] };
  };
  fn.calls = calls;
  return fn;
}

function shopDb(extra = [], settings = settingsRow) {
  return fakeDb([
    ...extra,
    ["FROM shop_settings WHERE id = 1", [settings]],
    ["FROM shop_products", productRows],
    ["FROM shop_zones WHERE active", zoneRows],
  ]);
}

describe("shop hours", () => {
  it("reads Kigali time", () => {
    assert.equal(kigaliClock(NOW), "10:00");
    assert.equal(kigaliClock(new Date("2026-11-03T22:30:00Z")), "00:30");
  });

  it("is open only when switched on and inside the hours", () => {
    assert.equal(shopOpenState(settingsRow, NOW).open, true);
    assert.equal(shopOpenState({ ...settingsRow, is_open: false }, NOW).reason, "closed");
    assert.equal(shopOpenState(settingsRow, new Date("2026-11-03T16:00:00Z")).reason, "hours");
    assert.equal(shopOpenState(null, NOW).open, false);
  });
});

describe("checkout input", () => {
  it("accepts a real customer and normalizes the phone", () => {
    const r = customerFromBody({ ...customer, phone: "0788 123 456" }, Date.now());
    assert.equal(r.ok, true);
    assert.equal(r.values.phone, "0788123456");
  });

  it("rejects bots, missing address and places that do not exist", () => {
    assert.equal(customerFromBody({ ...customer, website: "x" }).ok, false);
    assert.equal(customerFromBody({ ...customer, formStartedAt: 1000 }, 1500).ok, false);
    assert.equal(customerFromBody({ ...customer, addressNote: "" }).ok, false);
    assert.equal(customerFromBody({ ...customer, sector: "Niboye" }).ok, false);
    assert.equal(customerFromBody({ ...customer, phone: "12" }).ok, false);
  });

  it("checks the MoMo transaction id", () => {
    assert.equal(momoTxnFromBody({ momoTxnId: " 1234 5678 9 " }).values.txn, "123456789");
    assert.equal(momoTxnFromBody({ momoTxnId: "ab" }).ok, false);
    assert.equal(momoTxnFromBody({ momoTxnId: "12345678", payerPhone: "1" }).ok, false);
  });
});

describe("place order", () => {
  it("refuses when the shop is closed and writes nothing", async () => {
    const db = shopDb([], { ...settingsRow, is_open: false });
    const r = await placeShopOrder(db, customer, { now: NOW });
    assert.equal(r.status, 409);
    assert.equal(r.code, "shop_closed");
    assert.equal(db.calls.some((c) => c.sql.includes("INSERT INTO shop_orders")), false);
  });

  it("refuses a sector with no zone", async () => {
    const db = shopDb();
    const r = await placeShopOrder(db, { ...customer, sector: "Kimihurura" }, { now: NOW });
    assert.equal(r.code, "not_served");
  });

  it("writes the order, lines and event in one statement and keeps only the token hash", async () => {
    const db = shopDb([["INSERT INTO shop_orders", [{ ref: "CK-ABCDEF", placedAt: NOW.toISOString() }]]]);
    const r = await placeShopOrder(db, customer, { now: NOW, attribution: { source: "whatsapp" } });
    assert.equal(r.ok, true);
    const inserts = db.calls.filter((c) => c.sql.includes("INSERT INTO shop_orders"));
    assert.equal(inserts.length, 1);
    assert.ok(inserts[0].sql.includes("INSERT INTO shop_order_lines"));
    assert.ok(inserts[0].sql.includes("INSERT INTO shop_order_events"));
    const p = inserts[0].params;
    assert.equal(p[1], hashToken(r.token));
    assert.notEqual(p[1], r.token);
    assert.deepEqual(p.slice(8, 15), [16000, 2000, 18000, 12, 1920, 16080, "customer"]);
    assert.equal(p[15], "whatsapp");
    assert.equal("commissionRwf" in r.quote, false);
  });

  it("retries with a new ref when the ref is taken", async () => {
    let tries = 0;
    const clash = Object.assign(new Error("dup"), { code: "23505", constraint: "shop_orders_ref_key" });
    const db = shopDb([
      [
        "INSERT INTO shop_orders",
        () => {
          tries += 1;
          if (tries === 1) throw clash;
          return [{ ref: "CK-XYZXYZ", placedAt: NOW.toISOString() }];
        },
      ],
    ]);
    const r = await placeShopOrder(db, customer, { now: NOW });
    assert.equal(r.ok, true);
    assert.equal(tries, 2);
  });
});

const orderRow = (extra = {}) => ({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  ref: "CK-ABCDEF",
  track_token_hash: hashToken("secret-token"),
  customer_name: "Aline Uwase",
  district: "Gasabo",
  sector: "Remera",
  status: "placed",
  payment_status: "unpaid",
  momo_txn_id: null,
  subtotal_rwf: 16000,
  delivery_fee_rwf: 2000,
  total_rwf: 18000,
  placed_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  pay_within_minutes: 30,
  ...extra,
});

describe("track order", () => {
  it("answers not found for a wrong token or a bad ref", async () => {
    const db = fakeDb([["WHERE s.id = 1 AND o.ref = $1", [orderRow()]]]);
    assert.equal((await getPublicOrder(db, "CK-ABCDEF", "wrong")).status, 404);
    assert.equal((await getPublicOrder(db, "nonsense", "secret-token")).status, 404);
  });

  it("shows the order with the right token, without phone, address or money split", async () => {
    const db = fakeDb([
      ["WHERE s.id = 1 AND o.ref = $1", [orderRow()]],
      ["FROM shop_order_lines", [{ name: "Medium chicken", qty: 2, unit_price_rwf: 8000, line_total_rwf: 16000, weight_min_kg: "1.4", weight_max_kg: "1.6" }]],
      ["app_settings", [{ setting_value: "0788000000" }]],
    ]);
    const r = await getPublicOrder(db, "ck-abcdef", "secret-token");
    assert.equal(r.ok, true);
    assert.equal(r.order.firstName, "Aline");
    assert.equal(r.order.payToPhone, "0788000000");
    assert.equal(r.order.payBy, "2026-11-03T08:30:00.000Z");
    const json = JSON.stringify(r.order);
    for (const hidden of ["customer_phone", "address", "commission", "butcherPayout", "Uwase", "track_token"]) {
      assert.equal(json.includes(hidden), false, hidden);
    }
  });

  it("hides the pay number once the order is paid", () => {
    const view = publicOrderView(orderRow({ status: "paid", payment_status: "paid" }), [], "0788000000");
    assert.equal(view.payToPhone, null);
    assert.equal(view.payBy, null);
  });
});

describe("payment sent", () => {
  it("tells the customer when the order expired", async () => {
    const db = fakeDb([["WHERE s.id = 1 AND o.ref = $1", [orderRow({ status: "expired" })]]]);
    const r = await markPaymentSent(db, "CK-ABCDEF", "secret-token", { momoTxnId: "12345678" });
    assert.equal(r.status, 409);
    assert.match(r.error, /expired/);
  });

  it("moves to payment pending and records the settlement in one statement", async () => {
    const db = fakeDb([
      ["WHERE s.id = 1 AND o.ref = $1", [orderRow()]],
      ["SET status = 'payment_pending'", [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]],
    ]);
    const r = await markPaymentSent(db, "CK-ABCDEF", "secret-token", { momoTxnId: "MP123456" });
    assert.equal(r.ok, true);
    const write = db.calls.find((c) => c.sql.includes("SET status = 'payment_pending'"));
    assert.ok(write.sql.includes("'customer_in'"));
    assert.ok(write.sql.includes("AND status = 'placed'"));
  });
});

describe("desk order actions", () => {
  const deskOrder = (status, extra = {}) => [
    "FROM shop_orders WHERE id = $1::uuid",
    [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status, paymentStatus: "pending", butcherId: null, zoneId: zoneRows[0].id, totalRwf: 18000, ...extra }],
  ];

  it("confirms payment and hands the order to the zone's first active butcher", async () => {
    const db = fakeDb([
      deskOrder("payment_pending"),
      [
        "FROM shop_butcher_zones",
        [
          { butcherId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", priority: 5, status: "active" },
          { butcherId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", priority: 1, status: "paused" },
        ],
      ],
      ["SET status = 'paid'", [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]],
    ]);
    const r = await confirmPayment(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", actor);
    assert.equal(r.ok, true);
    assert.equal(r.butcherId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const write = db.calls.find((c) => c.sql.includes("SET status = 'paid'"));
    assert.equal(write.params[2], "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it("will not confirm an order that is not waiting for payment", async () => {
    const db = fakeDb([deskOrder("placed")]);
    assert.equal((await confirmPayment(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", actor)).status, 409);
  });

  it("needs a reason to reject a payment", async () => {
    const db = fakeDb([deskOrder("payment_pending")]);
    assert.equal((await rejectPayment(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", {}, actor)).status, 400);
  });

  it("cancels a paid order with a pending refund", async () => {
    const db = fakeDb([
      deskOrder("paid", { paymentStatus: "paid" }),
      ["SET status = 'cancelled'", [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]],
    ]);
    const r = await cancelOrder(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", { reason: "Butcher closed" }, actor);
    assert.equal(r.ok, true);
    assert.equal(r.refundPending, true);
    const write = db.calls.find((c) => c.sql.includes("SET status = 'cancelled'"));
    assert.equal(write.params[4], true);
  });

  it("cancels an unpaid order with no refund", async () => {
    const db = fakeDb([
      deskOrder("placed", { paymentStatus: "unpaid" }),
      ["SET status = 'cancelled'", [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]],
    ]);
    const r = await cancelOrder(db, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", { reason: "Customer asked" }, actor);
    assert.equal(r.refundPending, false);
  });
});
