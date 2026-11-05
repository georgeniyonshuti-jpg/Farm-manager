import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitchenFromBody } from "../src/services/shop/shopSetup.js";

const menu = [
  { id: "d1", name: "Skewer plate", price_rwf: 6500, category: "cooked" },
  { id: "d2", name: "Wings, 8 pieces", price_rwf: 5500, category: "cooked" },
  { id: "f1", name: "Medium chicken", price_rwf: 8000, category: "whole" },
];

const base = {
  shopName: "Kimihurura Grill",
  phone: "0788123456",
  status: "pending",
  hours: { mon: { open: "11:00", close: "21:00" } },
  dishes: [{ productId: "d1", feeRwf: 4500 }],
};

describe("kitchen setup", () => {
  it("accepts a kitchen with hours, dishes and fees", () => {
    const r = kitchenFromBody(base, menu);
    assert.equal(r.ok, true);
    assert.deepEqual(r.dishes, [{ productId: "d1", feeRwf: 4500 }]);
    assert.deepEqual(r.kitchen.hours.mon, { open: "11:00", close: "21:00" });
    assert.equal(r.kitchen.hours.tue, null);
    assert.equal(r.kitchen.prepMinutes, 25);
    assert.equal(r.kitchen.takingOrders, false);
  });

  it("keeps each fee below the dish price, so Cleva never loses on a dish", () => {
    const r = kitchenFromBody({ ...base, dishes: [{ productId: "d1", feeRwf: 6500 }] }, menu);
    assert.equal(r.ok, false);
    assert.match(r.error, /below its price/);
  });

  it("only takes BigChix dishes, not fresh chicken", () => {
    const r = kitchenFromBody({ ...base, dishes: [{ productId: "f1", feeRwf: 1000 }] }, menu);
    assert.equal(r.ok, false);
    assert.match(r.error, /not a BigChix dish/);
  });

  it("checks opening hours", () => {
    assert.equal(kitchenFromBody({ ...base, hours: { mon: { open: "9", close: "21:00" } } }, menu).ok, false);
    assert.equal(kitchenFromBody({ ...base, hours: { mon: { open: "21:00", close: "11:00" } } }, menu).ok, false);
  });

  it("needs a pickup address when pickup is on", () => {
    assert.equal(kitchenFromBody({ ...base, pickupEnabled: true }, menu).ok, false);
    assert.equal(kitchenFromBody({ ...base, pickupEnabled: true, pickupAddress: "KG 7 Ave, Kimihurura" }, menu).ok, true);
  });

  it("lists what is missing before a kitchen can be active", () => {
    const r = kitchenFromBody({ shopName: "New kitchen", phone: "0788123456", status: "active" }, menu);
    assert.equal(r.ok, false);
    assert.match(r.error, /Before making this kitchen active/);
    const ready = kitchenFromBody(
      {
        ...base,
        status: "active",
        licenceRef: "RFDA-123",
        momoPayoutPhone: "0788123456",
        momoPayoutName: "Kimihurura Grill Ltd",
        pickupEnabled: true,
        pickupAddress: "KG 7 Ave",
      },
      menu
    );
    assert.equal(ready.ok, true, ready.error);
  });
});
