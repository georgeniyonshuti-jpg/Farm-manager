import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSellPath } from "./marketAudience.ts";
import {
  countWeekFacets,
  resolveMarketSurface,
  shouldShowMarketFilters,
} from "./marketSurface.ts";

describe("resolveMarketSurface", () => {
  it("is always the board, including empty and failed weeks", () => {
    assert.equal(resolveMarketSurface({ failed: true, total: 12 }), "shop");
    assert.equal(resolveMarketSurface({ failed: true, total: 0 }), "shop");
    assert.equal(resolveMarketSurface({ total: 0 }), "shop");
    assert.equal(resolveMarketSurface({ total: null }), "shop");
    assert.equal(resolveMarketSurface({}), "shop");
    assert.equal(resolveMarketSurface({ total: 8, failed: false }), "shop");
  });
});

describe("shouldShowMarketFilters", () => {
  it("hides filters on a short list", () => {
    assert.equal(shouldShowMarketFilters({ total: 5, districtCount: 4, weekCount: 3 }), false);
    assert.equal(shouldShowMarketFilters({ total: 6, districtCount: 1, weekCount: 1 }), false);
  });

  it("shows filters at 6+ lots with two useful facets", () => {
    assert.equal(shouldShowMarketFilters({ total: 6, districtCount: 2, weekCount: 1 }), true);
    assert.equal(shouldShowMarketFilters({ total: 8, districtCount: 1, weekCount: 2 }), true);
  });
});

describe("isSellPath", () => {
  it("treats only /market/sell as the farm side", () => {
    assert.equal(isSellPath("/market/sell"), true);
    assert.equal(isSellPath("/market"), false);
    assert.equal(isSellPath("/market/lot/LOT-ABC"), false);
    assert.equal(isSellPath("/market/how-it-works"), false);
  });
});

describe("countWeekFacets", () => {
  it("counts weeks that actually have birds", () => {
    assert.equal(countWeekFacets(null), 0);
    assert.equal(countWeekFacets({ birdsThisWeek: 40, birdsNextWeek: 0, birdsLater: 12 }), 2);
  });
});
