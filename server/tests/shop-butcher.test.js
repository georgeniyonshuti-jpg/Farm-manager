import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createShopButcherRouter } from "../src/routes/shop.routes.js";
import {
  applyOrderStep,
  butcherOrderView,
  butcherSeesContact,
  reassignOrder,
} from "../src/services/shop/shopButcher.js";

const NOW = new Date("2026-11-04T10:00:00Z");
const ORDER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const B2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function fakeDb(handlers = []) {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    for (const [match, result] of handlers) {
      if (sql.includes(match)) return { rows: typeof result === "function" ? result(sql, params) : result };
    }
    return { rows: [] };
  };
  fn.calls = calls;
  return fn;
}

const row = (extra = {}) => ({
  id: ORDER,
  ref: "CK-ABCDEF",
  status: "paid",
  placedAt: "2026-11-04T09:00:00Z",
  paidConfirmedAt: "2026-11-04T09:50:00Z",
  deliveredAt: null,
  district: "Gasabo",
  sector: "Remera",
  customerName: "Aline Uwase",
  customerPhone: "0788123456",
  addressNote: "Blue gate",
  lines: [{ name: "Medium chicken", qty: 2 }],
  deliveryFeeRwf: 2000,
  deliveryPaidBy: "customer",
  butcherPayoutRwf: 16080,
  commissionRwf: 1920,
  ...extra,
});

describe("what a butcher sees", () => {
  it("shows the customer on open orders and for a week after delivery", () => {
    assert.equal(butcherSeesContact({ status: "accepted" }, NOW), true);
    assert.equal(butcherSeesContact({ status: "delivered", deliveredAt: "2026-10-30T10:00:00Z" }, NOW), true);
    assert.equal(butcherSeesContact({ status: "delivered", deliveredAt: "2026-10-27T09:00:00Z" }, NOW), false);
    assert.equal(butcherSeesContact({ status: "cancelled" }, NOW), false);
  });

  it("hides contact details once the week is over, and never shows commission", () => {
    const open = butcherOrderView(row(), 20, NOW);
    assert.equal(open.customerPhone, "0788123456");
    assert.equal("commissionRwf" in open, false);
    const old = butcherOrderView(row({ status: "delivered", deliveredAt: "2026-10-20T10:00:00Z" }), 20, NOW);
    assert.equal(old.customerPhone, null);
    assert.equal(old.addressNote, null);
    assert.equal(old.customerName, null);
  });

  it("flags a paid order not accepted in time", () => {
    assert.equal(butcherOrderView(row(), 20, NOW).acceptLate, false);
    assert.equal(butcherOrderView(row({ paidConfirmedAt: "2026-11-04T09:30:00Z" }), 20, NOW).acceptLate, true);
  });
});

describe("order steps", () => {
  const load = (status, butcherId = B1) => ["FROM shop_orders WHERE id = $1::uuid", [{ id: ORDER, status, butcherId }]];

  it("lets the butcher accept their own paid order in one statement", async () => {
    const db = fakeDb([load("paid"), ["SET status = $2", [{ id: ORDER }]]]);
    const r = await applyOrderStep(db, ORDER, "accept", { kind: "butcher", butcherId: B1, userId: null });
    assert.equal(r.ok, true);
    assert.equal(r.status, "accepted");
    const write = db.calls.find((c) => c.sql.includes("SET status = $2"));
    assert.ok(write.sql.includes("accepted_at = now()"));
    assert.ok(write.sql.includes("INSERT INTO shop_order_events"));
    assert.deepEqual(write.params.slice(1, 4), ["accepted", "paid", B1]);
  });

  it("answers not found for another butcher's order", async () => {
    const db = fakeDb([load("paid", B2)]);
    const r = await applyOrderStep(db, ORDER, "accept", { kind: "butcher", butcherId: B1 });
    assert.equal(r.status, 404);
    assert.equal(db.calls.length, 1);
  });

  it("refuses steps out of order and unknown steps", async () => {
    const db = fakeDb([load("paid")]);
    assert.equal((await applyOrderStep(db, ORDER, "delivered", { kind: "butcher", butcherId: B1 })).status, 409);
    assert.equal((await applyOrderStep(db, ORDER, "cancel", { kind: "butcher", butcherId: B1 })).status, 400);
  });

  it("lets ops take a step for an order handled by phone", async () => {
    const db = fakeDb([load("out_for_delivery"), ["SET status = $2", [{ id: ORDER }]]]);
    const r = await applyOrderStep(db, ORDER, "delivered", { kind: "ops", userId: null });
    assert.equal(r.status, "delivered");
  });
});

describe("reassign", () => {
  const load = (status, butcherId = B1) => ["FROM shop_orders WHERE id = $1::uuid", [{ id: ORDER, status, butcherId }]];
  const actor = { userId: "11111111-1111-4111-8111-111111111111", role: "sales_coordinator" };

  it("moves the order to an active butcher and back to paid", async () => {
    const db = fakeDb([
      load("accepted"),
      ["FROM shop_butchers WHERE id", [{ id: B2, status: "active", shopName: "Kicukiro Meats" }]],
      ["SET status = 'paid', butcher_id", [{ id: ORDER }]],
    ]);
    const r = await reassignOrder(db, ORDER, B2, actor);
    assert.equal(r.ok, true);
    assert.equal(r.butcherName, "Kicukiro Meats");
    const write = db.calls.find((c) => c.sql.includes("SET status = 'paid', butcher_id"));
    assert.ok(write.sql.includes("accepted_at = NULL"));
  });

  it("refuses a paused butcher, the same butcher, or an order already on the way", async () => {
    const paused = fakeDb([load("paid"), ["FROM shop_butchers WHERE id", [{ id: B2, status: "paused", shopName: "X" }]]]);
    assert.equal((await reassignOrder(paused, ORDER, B2, actor)).status, 400);
    const same = fakeDb([load("paid"), ["FROM shop_butchers WHERE id", [{ id: B1, status: "active", shopName: "X" }]]]);
    assert.equal((await reassignOrder(same, ORDER, B1, actor)).status, 400);
    const out = fakeDb([load("out_for_delivery"), ["FROM shop_butchers WHERE id", [{ id: B2, status: "active", shopName: "X" }]]]);
    assert.equal((await reassignOrder(out, ORDER, B2, actor)).status, 409);
  });
});

describe("butcher routes", () => {
  let server;
  let base;
  let currentUser;
  let linked = true;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.authUser = currentUser;
      next();
    });
    const db = fakeDb([
      ["FROM shop_butchers", () => (linked ? [{ id: B1, shopName: "Remera Meats", status: "active" }] : [])],
      ["FROM shop_orders o CROSS JOIN shop_settings", [{ ...row(), acceptWithin: 20 }]],
    ]);
    app.use("/api/shop/butcher", createShopButcherRouter({ dbQuery: db, hasDb: true, appendAudit: () => {} }));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api/shop/butcher`;
  });

  after(() => server.close());

  async function get(user) {
    currentUser = user;
    const res = await fetch(`${base}/orders`);
    return { status: res.status, body: await res.json() };
  }

  it("keeps everyone but butchers out, including desk staff", async () => {
    assert.equal((await get({ id: "u", role: "sales_coordinator" })).status, 403);
    assert.equal((await get({ id: "u", role: "buyer" })).status, 403);
  });

  it("tells a butcher whose login is not linked", async () => {
    linked = false;
    const r = await get({ id: "44444444-4444-4444-8444-444444444444", role: "butcher" });
    linked = true;
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "not_linked");
  });

  it("returns the linked butcher's orders without commission", async () => {
    const r = await get({ id: "44444444-4444-4444-8444-444444444444", role: "butcher" });
    assert.equal(r.status, 200);
    assert.equal(r.body.shopName, "Remera Meats");
    assert.equal(r.body.orders.length, 1);
    assert.equal(JSON.stringify(r.body).includes("commission"), false);
  });
});
