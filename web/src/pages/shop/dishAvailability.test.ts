import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anyDishAvailable, dishState, kitchensOpenAt, pickupKitchensFor, zoneIdFor } from "./dishAvailability.ts";

const product = (sku: string, category = "cooked", orderable = true) => ({
  sku, name: sku, nameRw: "", description: "", descriptionRw: "", weightMinKg: null, weightMaxKg: null,
  priceRwf: 6500, photoUrl: null, category: category as "cooked", orderable,
});
const kitchen = (id: string, over = {}) => ({
  id, name: id, open: true, zoneIds: ["remera"], dishSkus: ["BC-PLATE"], readyInMinutes: 25, opensAt: null,
  pickup: { district: "Gasabo", sector: "Kimihurura", address: "KG 7 Ave", directions: "" }, ...over,
});
const catalog = (kitchens: ReturnType<typeof kitchen>[], products = [product("BC-PLATE"), product("BC-WINGS")]) => ({
  products,
  kitchens,
  zones: [{ id: "remera", name: "Remera", district: "Gasabo", sectors: ["Remera"], deliveryFeeRwf: 1500, freeDeliveryOverRwf: null }],
});

describe("dish availability", () => {
  it("is available when an open kitchen makes it", () => {
    assert.equal(dishState("BC-PLATE", catalog([kitchen("a")])).state, "available");
    assert.equal(anyDishAvailable(catalog([kitchen("a")])), true);
  });

  it("is closed, with the opening time, when its kitchens are closed", () => {
    const c = catalog([kitchen("a", { open: false, opensAt: "17:00" }), kitchen("b", { open: false, opensAt: "11:00" })]);
    assert.deepEqual(dishState("BC-PLATE", c), { state: "closed", opensAt: "11:00" });
    assert.equal(kitchensOpenAt(c), "11:00");
    assert.equal(anyDishAvailable(c), false);
  });

  it("is sold out when no kitchen makes it today", () => {
    assert.equal(dishState("BC-WINGS", catalog([kitchen("a")])).state, "sold_out");
  });

  it("is coming soon when dishes are not on sale or there are no kitchens", () => {
    assert.equal(dishState("BC-PLATE", catalog([])).state, "soon");
    assert.equal(dishState("BC-PLATE", catalog([kitchen("a")], [product("BC-PLATE", "cooked", false)])).state, "soon");
  });

  it("checks the customer's area for delivery and the chosen kitchen for pickup", () => {
    const c = catalog([kitchen("a")]);
    assert.equal(zoneIdFor(c, "gasabo", " Remera "), "remera");
    assert.equal(dishState("BC-PLATE", c, { fulfilment: "delivery", zoneId: "remera" }).state, "available");
    assert.equal(dishState("BC-PLATE", c, { fulfilment: "delivery", zoneId: "kicukiro" }).state, "not_here");
    assert.equal(dishState("BC-PLATE", c, { fulfilment: "pickup", pickupKitchenId: "a" }).state, "available");
    assert.equal(dishState("BC-PLATE", c, { fulfilment: "pickup", pickupKitchenId: "z" }).state, "not_here");
  });

  it("offers pickup only at open kitchens that make every dish in the basket", () => {
    const c = catalog([kitchen("a"), kitchen("b", { dishSkus: ["BC-PLATE", "BC-WINGS"] }), kitchen("c", { pickup: null, dishSkus: ["BC-PLATE", "BC-WINGS"] })]);
    assert.deepEqual(pickupKitchensFor(c, ["BC-PLATE", "BC-WINGS"]).map((k) => k.id), ["b"]);
  });
});
