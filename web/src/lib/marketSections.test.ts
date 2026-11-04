import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoryFromSlug, categoryPath, isSectionPath, isShopArea, legacyRedirectPath, storePageFor } from "./marketSections.ts";
import { hostRedirectTarget, isPublicMarketPath } from "./marketHost.ts";

describe("market sections", () => {
  it("moves older addresses, keeping order links and their token", () => {
    assert.equal(legacyRedirectPath("/market/shop"), "/shop");
    assert.equal(legacyRedirectPath("/market/shop/"), "/shop");
    assert.equal(legacyRedirectPath("/market/shop/checkout"), "/shop/checkout");
    assert.equal(legacyRedirectPath("/market/shop/order/CK-ABC234", "?t=x%2Fy"), "/shop/order/CK-ABC234?t=x%2Fy");
    assert.equal(legacyRedirectPath("/raw"), "/shop");
    assert.equal(legacyRedirectPath("/raw/order/CK-1", "?t=z"), "/shop/order/CK-1?t=z");
    assert.equal(legacyRedirectPath("/live", "?utm=x"), "/wholesale?utm=x");
    assert.equal(legacyRedirectPath("/market/shopping"), null);
    assert.equal(legacyRedirectPath("/market"), null);
  });

  it("maps category words both ways", () => {
    assert.equal(categoryFromSlug("skewers-and-more"), "prepared");
    assert.equal(categoryFromSlug("nope"), null);
    assert.equal(categoryPath("cooked"), "/shop/bigchix");
    assert.equal(categoryFromSlug("bigchix"), "cooked");
    assert.equal(categoryFromSlug("BigChix"), "cooked");
    assert.equal(categoryFromSlug("ready-to-eat"), "cooked");
    assert.equal(categoryPath(null), "/shop");
  });

  it("knows which side of the market a page is on", () => {
    assert.equal(storePageFor("/", true), "shop");
    assert.equal(storePageFor("/", false), "wholesale");
    assert.equal(storePageFor("/shop", true), "shop");
    assert.equal(storePageFor("/shop/cuts", true), "shop");
    assert.equal(storePageFor("/wholesale", true), "wholesale");
    assert.equal(storePageFor("/market", true), "wholesale");
    assert.equal(storePageFor("/shop/checkout", true), null);
    assert.equal(storePageFor("/shop/order/X", true), null);
    assert.equal(storePageFor("/market/lot/ABC", true), null);
  });

  it("treats the short addresses as public market pages", () => {
    for (const p of ["/shop", "/shop/cuts", "/shop/order/X", "/wholesale", "/live", "/raw", "/raw/checkout"]) {
      assert.equal(isSectionPath(p), true, p);
      assert.equal(isPublicMarketPath(p), true, p);
    }
    assert.equal(isSectionPath("/shopping"), false);
    assert.equal(hostRedirectTarget("farm.cleva.rw", "/shop", "?a=1"), "https://market.cleva.rw/shop?a=1");
    assert.equal(hostRedirectTarget("market.cleva.rw", "/wholesale"), null);
  });

  it("gives shop pages the Grill look", () => {
    assert.equal(isShopArea("/", true), true);
    assert.equal(isShopArea("/", false), false);
    assert.equal(isShopArea("/shop/checkout", false), true);
    assert.equal(isShopArea("/wholesale", true), false);
    assert.equal(isShopArea("/market", true), false);
    assert.equal(isShopArea("/shopping", true), false);
  });
});
