import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createShopDeskRouter } from "../src/routes/shop.routes.js";
import {
  butcherFromBody,
  openBlockers,
  productFromBody,
  saveButcher,
  saveShopSettings,
  saveZone,
  settingsFromBody,
  zoneFromBody,
} from "../src/services/shop/shopSetup.js";

const goodSettings = {
  commissionPct: 12,
  minOrderRwf: 10000,
  minOrderItems: 2,
  payWithinMinutes: 30,
  acceptWithinMinutes: 20,
  isOpen: false,
  openTime: "08:00",
  closeTime: "18:00",
};

const goodButcher = {
  shopName: "Remera Meats",
  phone: "0788 123 456",
  district: "Gasabo",
  sector: "Remera",
  status: "pending",
};

const actor = { userId: "11111111-1111-4111-8111-111111111111", role: "superuser", audit: null };

describe("shop setup input", () => {
  it("checks settings", () => {
    assert.equal(settingsFromBody(goodSettings).ok, true);
    assert.equal(settingsFromBody({ ...goodSettings, commissionPct: 101 }).ok, false);
    assert.equal(settingsFromBody({ ...goodSettings, minOrderRwf: 10.5 }).ok, false);
    assert.equal(settingsFromBody({ ...goodSettings, payWithinMinutes: 0 }).ok, false);
    assert.equal(settingsFromBody({ ...goodSettings, openTime: "8am" }).ok, false);
    assert.equal(settingsFromBody({ ...goodSettings, closeTime: "07:00" }).ok, false);
  });

  it("checks products and upper-cases the code", () => {
    const ok = productFromBody({ sku: "ck-m", name: "Medium chicken", priceRwf: 8000, weightMinKg: 1.4, weightMaxKg: 1.6 });
    assert.equal(ok.ok, true);
    assert.equal(ok.values.sku, "CK-M");
    assert.equal(productFromBody({ sku: "x", name: "A", priceRwf: 1 }).ok, false);
    assert.equal(productFromBody({ sku: "CK-M", name: "", priceRwf: 1 }).ok, false);
    assert.equal(productFromBody({ sku: "CK-M", name: "A", priceRwf: 0 }).ok, false);
    assert.equal(productFromBody({ sku: "CK-M", name: "A", priceRwf: 99.5 }).ok, false);
    assert.equal(productFromBody({ sku: "CK-M", name: "A", priceRwf: 1, weightMinKg: 2, weightMaxKg: 1 }).ok, false);
  });

  it("checks zones against real districts and sectors", () => {
    const ok = zoneFromBody({ name: "Remera", district: "Gasabo", sectors: ["Remera", "Remera", "Kimihurura"], deliveryFeeRwf: 2000 });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.values.sectors, ["Remera", "Kimihurura"]);
    assert.equal(ok.values.freeDeliveryOverRwf, null);
    assert.equal(zoneFromBody({ name: "X", district: "Atlantis", sectors: ["Remera"] }).ok, false);
    assert.equal(zoneFromBody({ name: "X", district: "Gasabo", sectors: [] }).ok, false);
    const outside = zoneFromBody({ name: "X", district: "Gasabo", sectors: ["Niboye"] });
    assert.equal(outside.ok, false);
    assert.match(outside.error, /Niboye/);
  });

  it("checks butchers and needs payout details before active", () => {
    const ok = butcherFromBody({ ...goodButcher, zones: [{ zoneId: "z1", priority: 5 }, { zoneId: "z1", priority: 9 }] });
    assert.equal(ok.ok, true);
    assert.equal(ok.values.phone, "0788123456");
    assert.deepEqual(ok.zones, [{ zoneId: "z1", priority: 5 }]);
    assert.equal(butcherFromBody({ ...goodButcher, phone: "123" }).ok, false);
    assert.equal(butcherFromBody({ ...goodButcher, sector: "Niboye" }).ok, false);

    const notReady = butcherFromBody({ ...goodButcher, status: "active" });
    assert.equal(notReady.ok, false);
    assert.match(notReady.error, /licence number/);
    const ready = butcherFromBody({
      ...goodButcher,
      status: "active",
      licenceRef: "RFDA-123",
      momoPayoutPhone: "0788123456",
      momoPayoutName: "Jean Remera",
    });
    assert.equal(ready.ok, true);
  });

  it("lists what stops the shop from opening", () => {
    assert.equal(openBlockers({ activeProducts: 0, servedZones: 0 }).length, 2);
    assert.deepEqual(openBlockers({ activeProducts: 3, servedZones: 1 }), []);
  });
});

function fakeDb(handlers = []) {
  const calls = [];
  const fn = async (sql, params) => {
    calls.push({ sql, params });
    for (const [match, rows] of handlers) {
      if (sql.includes(match)) return { rows: typeof rows === "function" ? rows(sql, params) : rows };
    }
    return { rows: [] };
  };
  fn.calls = calls;
  return fn;
}

describe("shop setup writes", () => {
  it("will not open the shop without products and a served zone", async () => {
    const db = fakeDb([["FROM shop_settings", [{ id: 1 }]]]);
    const r = await saveShopSettings(db, { ...goodSettings, isOpen: true }, actor);
    assert.equal(r.ok, false);
    assert.match(r.error, /cannot open yet/);
    assert.equal(db.calls.some((c) => c.sql.includes("UPDATE shop_settings")), false);
  });

  it("refuses a zone whose sector another active zone serves", async () => {
    const db = fakeDb([
      ["FROM shop_zones", [{ id: "z1", name: "Remera east", district: "Gasabo", sectors: ["Remera"], active: true }]],
    ]);
    const r = await saveZone(db, null, { name: "New", district: "Gasabo", sectors: ["Remera"] }, actor);
    assert.equal(r.status, 409);
    assert.match(r.error, /Remera east/);
    assert.equal(db.calls.some((c) => c.sql.includes("INSERT INTO shop_zones")), false);
  });

  it("saves a butcher and their zones in one statement", async () => {
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: null,
      shop_name: "Remera Meats",
      status: "pending",
    };
    const db = fakeDb([["INSERT INTO shop_butchers", [row]]]);
    const zoneId = "33333333-3333-4333-8333-333333333333";
    const r = await saveButcher(db, null, { ...goodButcher, zones: [{ zoneId, priority: 1 }] }, actor);
    assert.equal(r.ok, true);
    assert.deepEqual(r.butcher.zones, [{ zoneId, priority: 1 }]);
    assert.equal(db.calls.length, 1);
    assert.equal(db.calls.some((c) => /^\s*(BEGIN|COMMIT)/.test(c.sql)), false);
    assert.deepEqual(db.calls[0].params.slice(13, 15), [[zoneId], [1]]);
    assert.equal(db.calls[0].params[15], null);
  });

  it("links a butcher login by email only when the user is a butcher", async () => {
    const row = { id: "22222222-2222-4222-8222-222222222222", shop_name: "Remera Meats", status: "pending" };
    const userId = "44444444-4444-4444-8444-444444444444";
    const db = fakeDb([
      ["FROM users WHERE lower(email)", (_sql, params) => (params[0] === "jean@shop.rw" ? [{ id: userId, email: "jean@shop.rw", role: "butcher" }] : [{ id: "x", email: params[0], role: "manager" }])],
      ["INSERT INTO shop_butchers", [row]],
    ]);
    const ok = await saveButcher(db, null, { ...goodButcher, loginEmail: " Jean@Shop.rw " }, actor);
    assert.equal(ok.ok, true);
    assert.equal(ok.butcher.loginEmail, "jean@shop.rw");
    assert.equal(db.calls.at(-1).params[15], userId);

    const wrongRole = await saveButcher(db, null, { ...goodButcher, loginEmail: "boss@farm.rw" }, actor);
    assert.equal(wrongRole.ok, false);
    assert.match(wrongRole.error, /role is manager/);

    const none = await saveButcher(fakeDb(), null, { ...goodButcher, loginEmail: "nobody@x.rw" }, actor);
    assert.match(none.error, /Create the login under Users first/);
  });
});

describe("shop desk routes", () => {
  let server;
  let base;
  let currentUser;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.authUser = currentUser;
      next();
    });
    app.use(
      "/api/shop/desk",
      createShopDeskRouter({ dbQuery: fakeDb([["FROM shop_settings", [{ id: 1 }]]]), hasDb: true, appendAudit: () => {} })
    );
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api/shop/desk`;
  });

  after(() => server.close());

  async function call(user, method, path, body) {
    currentUser = user;
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  }

  it("keeps sales officers and farm roles out", async () => {
    assert.equal((await call({ id: "u", role: "sales_officer" }, "GET", "/setup")).status, 403);
    assert.equal((await call({ id: "u", role: "manager" }, "GET", "/setup")).status, 403);
  });

  it("lets only a superuser change settings", async () => {
    const r = await call({ id: "u", role: "sales_coordinator" }, "PUT", "/settings", goodSettings);
    assert.equal(r.status, 403);
  });

  it("returns 404 for an id that is not a uuid", async () => {
    const r = await call({ id: "u", role: "sales_coordinator" }, "PUT", "/products/abc", { sku: "CK-M" });
    assert.equal(r.status, 404);
  });

  it("returns the input error as 400", async () => {
    const r = await call({ id: "u", role: "sales_coordinator" }, "POST", "/products", { sku: "CK-M", name: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "Name is required.");
  });
});
