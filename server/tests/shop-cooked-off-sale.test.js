import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COOKED_ON_SALE, cookedOnSale, getShopCatalog, isOrderable, quoteForCustomer } from "../src/services/shop/shopOrders.js";

const settings = { id: 1, is_open: true, open_time: null, close_time: null, min_order_rwf: 0, min_order_items: 1 };
const products = [
  { id: "1", sku: "CK-M", name: "Medium chicken", price_rwf: 8000, active: true, sort_order: 0, category: "whole" },
  { id: "2", sku: "BC-PLATE", name: "Skewer plate", price_rwf: 6500, active: true, sort_order: 1, category: "cooked" },
];
const zones = [{ id: "z", name: "Remera", district: "Gasabo", sectors: ["Remera"], delivery_fee_rwf: 1500, free_delivery_over_rwf: null, active: true }];

function fakeDb() {
  return async (sql) => {
    if (/FROM shop_settings/.test(sql)) return { rows: [settings] };
    if (/FROM shop_products/.test(sql)) return { rows: products };
    if (/FROM shop_zones/.test(sql)) return { rows: zones };
    return { rows: [] };
  };
}

describe("cooked dishes before kitchens exist", () => {
  it("are not orderable while kitchens are not set up", () => {
    assert.equal(COOKED_ON_SALE, false);
    assert.equal(cookedOnSale({}), false);
    assert.equal(cookedOnSale({ SHOP_COOKED_ON_SALE: "1" }), true);
    assert.equal(isOrderable({ category: "cooked" }), false);
    assert.equal(isOrderable({ category: "whole" }), true);
    assert.equal(isOrderable({}), true);
  });

  it("stay out of the public catalog, and show in preview only as not orderable", async () => {
    const live = await getShopCatalog(fakeDb());
    assert.deepEqual(live.products.map((p) => p.sku), ["CK-M"]);
    const preview = await getShopCatalog(fakeDb(), new Date(), { preview: true });
    assert.deepEqual(preview.products.map((p) => [p.sku, p.orderable]), [["CK-M", true], ["BC-PLATE", false]]);
  });

  it("cannot be priced into an order", async () => {
    const r = await quoteForCustomer(fakeDb(), { items: [{ sku: "BC-PLATE", qty: 1 }], district: "Gasabo", sector: "Remera" });
    assert.equal(r.quote.ok, false);
  });
});
