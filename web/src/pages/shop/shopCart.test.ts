import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShopCatalog } from "../../api/shop.api.ts";
import { cartForCatalog, cleanCart, EMPTY_CART, orderPath, qtyOf, servedPlaces, setQty, whatsappOrderText } from "./shopCart.ts";

const catalog: ShopCatalog = {
  open: true,
  closedReason: null,
  closedMessage: "",
  openTime: "08:00",
  closeTime: "18:00",
  minOrderRwf: 10000,
  minOrderItems: 2,
  products: [
    { sku: "CK-M", name: "Medium", nameRw: "", description: "", descriptionRw: "", weightMinKg: 1.4, weightMaxKg: 1.6, priceRwf: 8000, photoUrl: null },
  ],
  zones: [
    { name: "Remera", district: "Gasabo", sectors: ["Remera", "Kimihurura"], deliveryFeeRwf: 2000, freeDeliveryOverRwf: 25000 },
    { name: "Kicukiro", district: "Kicukiro", sectors: ["Kicukiro"], deliveryFeeRwf: 1500, freeDeliveryOverRwf: null },
  ],
};

describe("shop cart", () => {
  it("cleans stored carts", () => {
    const c = cleanCart({
      items: [{ sku: "CK-M", qty: 2 }, { sku: "CK-M", qty: 1 }, { sku: "CK-S", qty: 0 }, { sku: "", qty: 3 }, { sku: "X", qty: 1.5 }],
      district: "Gasabo",
      sector: 7,
    });
    assert.deepEqual(c, { items: [{ sku: "CK-M", qty: 3 }], district: "Gasabo", sector: "" });
    assert.deepEqual(cleanCart(null), EMPTY_CART);
    assert.deepEqual(cleanCart("junk"), EMPTY_CART);
  });

  it("sets and clears quantities within 0–50", () => {
    let c = setQty(EMPTY_CART, "CK-M", 2);
    assert.equal(qtyOf(c, "CK-M"), 2);
    c = setQty(c, "CK-M", 99);
    assert.equal(qtyOf(c, "CK-M"), 50);
    c = setQty(c, "CK-M", 0);
    assert.deepEqual(c.items, []);
  });

  it("drops items that left the catalog", () => {
    const c = cartForCatalog({ items: [{ sku: "CK-M", qty: 1 }, { sku: "OLD", qty: 2 }], district: "", sector: "" }, catalog);
    assert.deepEqual(c.items, [{ sku: "CK-M", qty: 1 }]);
  });

  it("lists served sectors with their district", () => {
    assert.deepEqual(
      servedPlaces(catalog).map((p) => p.value),
      ["Kicukiro|Kicukiro", "Gasabo|Kimihurura", "Gasabo|Remera"]
    );
  });

  it("builds the private order link", () => {
    assert.equal(orderPath("CK-ABC234", "a/b"), "/raw/order/CK-ABC234?t=a%2Fb");
  });

  it("writes the WhatsApp order message", () => {
    const text = whatsappOrderText(
      { items: [{ sku: "CK-M", qty: 2 }, { sku: "CK-X", qty: 1 }], district: "Gasabo", sector: "Remera" },
      [{ sku: "CK-M", name: "Medium chicken" }],
      { intro: "Hello Cleva, I would like to order:", deliverTo: "Deliver to Remera, Gasabo." }
    );
    assert.equal(text, "Hello Cleva, I would like to order:\n- 2 × Medium chicken\n- 1 × CK-X\nDeliver to Remera, Gasabo.");
    const noPlace = whatsappOrderText({ items: [{ sku: "CK-M", qty: 1 }], district: "", sector: "" }, [], {
      intro: "Hi",
      deliverTo: "Deliver to ,.",
    });
    assert.equal(noPlace, "Hi\n- 1 × CK-M");
  });
});
