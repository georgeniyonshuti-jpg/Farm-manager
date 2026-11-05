import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isKitchenOpen, kigaliNow, kitchenCanTake, kitchenPayout, noKitchenMessage, pickKitchen } from "../src/services/shop/kitchenRouting.js";
import { nextShopOrderStatus } from "../src/services/shop/orderStatus.js";
import { channelForItems } from "../src/services/shop/shopOrders.js";

// Thursday 5 November 2026, 12:30 in Kigali (10:30 UTC).
const clock = kigaliNow(new Date("2026-11-05T10:30:00Z"));
const open = { thu: { open: "11:00", close: "21:00" } };

function kitchen(id, over = {}) {
  return {
    id,
    name: id,
    status: "active",
    takingOrders: true,
    hours: open,
    maxOpenOrders: 5,
    openOrders: 0,
    pickupEnabled: true,
    zones: [{ zoneId: "remera", priority: 10 }],
    dishes: [
      { productId: "plate", feeRwf: 4500, soldOutOn: null },
      { productId: "wings", feeRwf: 3500, soldOutOn: null },
    ],
    ...over,
  };
}

const delivery = { fulfilment: "delivery", zoneId: "remera", productIds: ["plate"] };

describe("kitchen opening hours", () => {
  it("reads the Kigali day and time", () => {
    assert.deepEqual(clock, { day: "thu", time: "12:30", date: "2026-11-05" });
    assert.equal(isKitchenOpen(open, clock), true);
    assert.equal(isKitchenOpen(open, { ...clock, time: "21:00" }), false);
    assert.equal(isKitchenOpen(open, { ...clock, day: "fri" }), false);
  });
});

describe("which kitchen takes a dish order", () => {
  it("takes the lowest priority kitchen that can take it", () => {
    const a = kitchen("a", { zones: [{ zoneId: "remera", priority: 20 }] });
    const b = kitchen("b", { zones: [{ zoneId: "remera", priority: 5 }] });
    assert.equal(pickKitchen([a, b], delivery, clock).id, "b");
  });

  it("skips kitchens that are closed, paused, full, inactive, elsewhere or declined", () => {
    const ok = kitchen("ok", { zones: [{ zoneId: "remera", priority: 99 }] });
    const others = [
      kitchen("closed", { hours: {} }),
      kitchen("paused", { takingOrders: false }),
      kitchen("full", { openOrders: 5 }),
      kitchen("pending", { status: "pending" }),
      kitchen("far", { zones: [{ zoneId: "kicukiro", priority: 1 }] }),
      kitchen("declined"),
    ];
    assert.equal(pickKitchen([...others, ok], delivery, clock, ["declined"]).id, "ok");
  });

  it("needs every dish in the order, none sold out today", () => {
    const noWings = kitchen("a", { dishes: [{ productId: "plate", feeRwf: 4500 }] });
    assert.equal(kitchenCanTake(noWings, { ...delivery, productIds: ["plate", "wings"] }, clock).reason, "no_dish");
    const soldOut = kitchen("b", { dishes: [{ productId: "plate", feeRwf: 4500, soldOutOn: "2026-11-05" }] });
    assert.equal(kitchenCanTake(soldOut, delivery, clock).reason, "sold_out");
    const soldOutYesterday = kitchen("c", { dishes: [{ productId: "plate", feeRwf: 4500, soldOutOn: "2026-11-04" }] });
    assert.equal(kitchenCanTake(soldOutYesterday, delivery, clock).ok, true);
  });

  it("sends pickup orders only to the chosen kitchen, if it offers pickup", () => {
    const pickup = { fulfilment: "pickup", pickupKitchenId: "b", productIds: ["plate"] };
    assert.equal(pickKitchen([kitchen("a"), kitchen("b")], pickup, clock).id, "b");
    assert.equal(pickKitchen([kitchen("b", { pickupEnabled: false })], pickup, clock), null);
  });

  it("explains why no kitchen can take it", () => {
    assert.equal(noKitchenMessage([kitchen("a", { hours: {} })], delivery, clock), "Our kitchens are closed right now.");
    assert.equal(noKitchenMessage([kitchen("a", { openOrders: 9 })], delivery, clock), "Our kitchens are very busy. Try again in a few minutes.");
    assert.equal(noKitchenMessage([], delivery, clock), "BigChix does not deliver here yet.");
  });
});

describe("what a kitchen is paid", () => {
  it("pays the fixed fee per dish; Cleva keeps the rest of the dish money", () => {
    const lines = [
      { productId: "plate", qty: 2, lineTotalRwf: 13000 },
      { productId: "wings", qty: 1, lineTotalRwf: 5500 },
    ];
    const pay = kitchenPayout(lines, kitchen("a").dishes);
    assert.equal(pay.payoutRwf, 2 * 4500 + 3500);
    assert.equal(pay.clevaShareRwf, 18500 - 12500);
    assert.deepEqual(pay.lines.map((l) => l.partnerFeeRwf), [4500, 3500]);
  });

  it("refuses when the kitchen lacks a dish", () => {
    assert.equal(kitchenPayout([{ productId: "nuggets", qty: 1, lineTotalRwf: 3000 }], kitchen("a").dishes).ok, false);
  });
});

describe("dish orders and fresh orders", () => {
  const products = [
    { sku: "BC-PLATE", category: "cooked" },
    { sku: "CK-M", category: "whole" },
  ];
  it("keeps them apart", () => {
    assert.equal(channelForItems([{ sku: "BC-PLATE" }], products).channel, "kitchen");
    assert.equal(channelForItems([{ sku: "CK-M" }], products).channel, "fresh");
    assert.equal(channelForItems([{ sku: "BC-PLATE" }, { sku: "CK-M" }], products).ok, false);
  });

  it("lets a pickup order be collected, never sent out for delivery", () => {
    const partner = { kind: "butcher", butcherId: "k" };
    const pickupReady = { status: "ready", butcherId: "k", fulfilment: "pickup" };
    assert.equal(nextShopOrderStatus(pickupReady, "collected", partner).to, "delivered");
    assert.equal(nextShopOrderStatus(pickupReady, "out", partner).ok, false);
    const deliveryReady = { status: "ready", butcherId: "k", fulfilment: "delivery" };
    assert.equal(nextShopOrderStatus(deliveryReady, "collected", partner).ok, false);
    assert.equal(nextShopOrderStatus(deliveryReady, "out", partner).to, "out_for_delivery");
  });
});
