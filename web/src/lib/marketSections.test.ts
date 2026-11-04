import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryFromSlug,
  categoryPath,
  isOldWholesalePath,
  isSectionPath,
  isShopHostname,
  shopHostPath,
  shopPath,
} from "./marketSections.ts";
import { hostRedirectTarget, isPublicMarketPath } from "./marketHost.ts";

describe("shop addresses", () => {
  it("are short on the shop host and under /shop elsewhere", () => {
    assert.equal(shopPath("", "shop.cleva.rw"), "/");
    assert.equal(shopPath("checkout", "shop.cleva.rw"), "/checkout");
    assert.equal(shopPath("/order/CK-1", "shop.localhost"), "/order/CK-1");
    assert.equal(shopPath("", "localhost"), "/shop");
    assert.equal(shopPath("checkout", "localhost"), "/shop/checkout");
    assert.equal(categoryPath("cooked", "shop.cleva.rw"), "/hot-and-ready");
    assert.equal(categoryPath(null, "shop.cleva.rw"), "/");
    assert.equal(categoryPath("cooked", "localhost"), "/shop/hot-and-ready");
    assert.equal(isShopHostname("shop.cleva.rw"), true);
    assert.equal(isShopHostname("market.cleva.rw"), false);
  });

  it("maps category words both ways", () => {
    assert.equal(categoryFromSlug("skewers-and-more"), "prepared");
    assert.equal(categoryFromSlug("nope"), null);
    assert.equal(categoryFromSlug("hot-and-ready"), "cooked");
    assert.equal(categoryFromSlug("bigchix"), "cooked");
    assert.equal(categoryFromSlug("BigChix"), "cooked");
    assert.equal(categoryFromSlug("ready-to-eat"), "cooked");
  });

  it("finds the shop-host path for older addresses, keeping order tokens", () => {
    assert.equal(shopHostPath("/shop"), "/");
    assert.equal(shopHostPath("/shop/"), "/");
    assert.equal(shopHostPath("/shop/bigchix"), "/bigchix");
    assert.equal(shopHostPath("/shop/order/CK-ABC234", "?t=x%2Fy"), "/order/CK-ABC234?t=x%2Fy");
    assert.equal(shopHostPath("/market/shop/checkout"), "/checkout");
    assert.equal(shopHostPath("/raw/order/CK-1", "?t=z"), "/order/CK-1?t=z");
    assert.equal(shopHostPath("/shopping"), null);
    assert.equal(shopHostPath("/market"), null);
  });

  it("knows the old wholesale addresses and the public paths", () => {
    assert.equal(isOldWholesalePath("/wholesale"), true);
    assert.equal(isOldWholesalePath("/live/"), true);
    assert.equal(isOldWholesalePath("/market"), false);
    for (const p of ["/shop", "/shop/cuts", "/shop/order/X", "/wholesale", "/live", "/raw", "/raw/checkout"]) {
      assert.equal(isSectionPath(p), true, p);
      assert.equal(isPublicMarketPath(p), true, p);
    }
    assert.equal(isSectionPath("/shopping"), false);
  });
});

describe("shop host redirects", () => {
  it("sends shop pages on the market and farm hosts to shop.cleva.rw", () => {
    assert.equal(hostRedirectTarget("market.cleva.rw", "/shop"), "https://shop.cleva.rw/");
    assert.equal(hostRedirectTarget("market.cleva.rw", "/shop/bigchix", "?a=1"), "https://shop.cleva.rw/bigchix?a=1");
    assert.equal(
      hostRedirectTarget("market.cleva.rw", "/shop/order/CK-1", "?t=abc"),
      "https://shop.cleva.rw/order/CK-1?t=abc",
    );
    assert.equal(hostRedirectTarget("market.cleva.rw", "/market/shop/checkout"), "https://shop.cleva.rw/checkout");
    assert.equal(hostRedirectTarget("farm.cleva.rw", "/raw"), "https://shop.cleva.rw/");
    assert.equal(hostRedirectTarget("localhost", "/shop"), null);
  });

  it("sends business pages on the shop host to market.cleva.rw", () => {
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/login"), "https://market.cleva.rw/login");
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/market/sell", "?x=1"), "https://market.cleva.rw/market/sell?x=1");
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/wholesale"), "https://market.cleva.rw/");
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/app/cleva/market"), "https://market.cleva.rw/app/cleva/market");
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/"), null);
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/bigchix"), null);
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/order/CK-1", "?t=a"), null);
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/shop/cuts"), null);
    assert.equal(hostRedirectTarget("shop.cleva.rw", "/privacy"), null);
    assert.equal(hostRedirectTarget("shop.localhost", "/login"), null);
  });

  it("keeps the business market where it is", () => {
    assert.equal(hostRedirectTarget("market.cleva.rw", "/"), null);
    assert.equal(hostRedirectTarget("market.cleva.rw", "/wholesale"), null);
    assert.equal(hostRedirectTarget("market.cleva.rw", "/market/lot/ABC"), null);
  });
});
