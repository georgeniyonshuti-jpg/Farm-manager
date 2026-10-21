import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostRedirectTarget, isMarketSignup } from "./marketHost.ts";

describe("market host", () => {
  it("sends the public market and market signup off the farm host", () => {
    assert.equal(
      hostRedirectTarget("farm.cleva.rw", "/market/sell", "?x=1"),
      "https://market.cleva.rw/market/sell?x=1",
    );
    assert.equal(
      hostRedirectTarget("farm.cleva.rw", "/signup", "?from=market&accountType=scout"),
      "https://market.cleva.rw/signup?from=market&accountType=scout",
    );
    assert.equal(
      hostRedirectTarget("farm.cleva.rw", "/signup", "?from=facebook"),
      "https://market.cleva.rw/signup?from=facebook",
    );
    assert.equal(
      hostRedirectTarget("farm.cleva.rw", "/signup", "?utm_source=facebook"),
      "https://market.cleva.rw/signup?utm_source=facebook",
    );
    assert.equal(hostRedirectTarget("farm.cleva.rw", "/signup", ""), null);
    assert.equal(hostRedirectTarget("farm.cleva.rw", "/app/cleva/farm/pipeline", ""), null);
  });

  it("treats ad channels as market signup", () => {
    assert.equal(isMarketSignup("/signup", "?from=facebook"), true);
    assert.equal(isMarketSignup("/signup", "?utm_source=instagram"), true);
    assert.equal(isMarketSignup("/signup", "?gclid=abc"), true);
    assert.equal(isMarketSignup("/signup", ""), false);
    assert.equal(isMarketSignup("/signup", "", "market.cleva.rw"), true);
    assert.equal(isMarketSignup("/signup", "?workspace=1", "market.cleva.rw"), false);
  });

  it("sends farm controls off the market host and keeps seller and scout pages", () => {
    assert.equal(
      hostRedirectTarget("market.cleva.rw", "/app/cleva/farm/pipeline", "?tab=scouts"),
      "https://farm.cleva.rw/app/cleva/farm/pipeline?tab=scouts",
    );
    assert.equal(
      hostRedirectTarget("market.cleva.rw", "/app/cleva/market/verify", ""),
      "https://farm.cleva.rw/app/cleva/market/verify",
    );
    assert.equal(
      hostRedirectTarget("market.cleva.rw", "/signup", "?workspace=1"),
      "https://farm.cleva.rw/signup?workspace=1",
    );
    assert.equal(hostRedirectTarget("market.cleva.rw", "/app/cleva/farm/pipeline/home", ""), null);
    assert.equal(hostRedirectTarget("market.cleva.rw", "/app/cleva/market/listings", ""), null);
    assert.equal(hostRedirectTarget("market.cleva.rw", "/", ""), null);
    assert.equal(hostRedirectTarget("localhost", "/market", ""), null);
  });
});
