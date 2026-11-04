import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSectionPath, sectionForPath, shopRedirectPath } from "./marketSections.ts";
import { hostRedirectTarget, isPublicMarketPath } from "./marketHost.ts";

describe("market sections", () => {
  it("moves old shop links to /raw, keeping the order link and token", () => {
    assert.equal(shopRedirectPath("/market/shop"), "/raw");
    assert.equal(shopRedirectPath("/market/shop/"), "/raw");
    assert.equal(shopRedirectPath("/market/shop/checkout"), "/raw/checkout");
    assert.equal(shopRedirectPath("/market/shop/order/CK-ABC234", "?t=x%2Fy"), "/raw/order/CK-ABC234?t=x%2Fy");
    assert.equal(shopRedirectPath("/market/shopping"), null);
    assert.equal(shopRedirectPath("/market"), null);
  });

  it("lights the right tab", () => {
    assert.equal(sectionForPath("/raw", true), "raw");
    assert.equal(sectionForPath("/live", true), "live");
    assert.equal(sectionForPath("/market", true), "live");
    assert.equal(sectionForPath("/", true), "raw");
    assert.equal(sectionForPath("/", false), "live");
    assert.equal(sectionForPath("/raw/checkout", true), null);
    assert.equal(sectionForPath("/market/lot/ABC", true), null);
  });

  it("treats the short addresses as public market pages", () => {
    for (const p of ["/live", "/raw", "/raw/checkout", "/raw/order/X"]) {
      assert.equal(isSectionPath(p), true, p);
      assert.equal(isPublicMarketPath(p), true, p);
    }
    assert.equal(isSectionPath("/rawhide"), false);
    assert.equal(hostRedirectTarget("farm.cleva.rw", "/raw", "?a=1"), "https://market.cleva.rw/raw?a=1");
    assert.equal(hostRedirectTarget("market.cleva.rw", "/raw"), null);
  });
});
