import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MARKET_EXPECTATIONS,
  normalizeMarketExpectations,
} from "../src/services/marketInsightsPacks.js";

describe("market expectations", () => {
  it("fills defaults and clamps known keys", () => {
    const next = normalizeMarketExpectations({
      newSellersPerWeek: 12,
      scoutLotsPerWeek: "8",
      deadAfterDays: -1,
      unknownKey: 99,
    });
    assert.equal(next.newSellersPerWeek, 12);
    assert.equal(next.scoutLotsPerWeek, 8);
    assert.equal(next.deadAfterDays, DEFAULT_MARKET_EXPECTATIONS.deadAfterDays);
    assert.equal(next.newScoutsPerWeek, DEFAULT_MARKET_EXPECTATIONS.newScoutsPerWeek);
    assert.equal(/** @type {any} */ (next).unknownKey, undefined);
  });
});
