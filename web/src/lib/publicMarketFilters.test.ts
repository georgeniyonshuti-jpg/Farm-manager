import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPublicMarketFilters,
  filtersToPublicLotsQuery,
  formatPriceBand,
  formatWeightBand,
} from "./publicMarketFilters.ts";

describe("publicMarketFilters", () => {
  it("builds query from filters", () => {
    const q = filtersToPublicLotsQuery(
      { district: "Gasabo", week: "this", minBirds: 100, sort: "birds", productType: "", service: "", farmMode: "" },
      2,
      12
    );
    assert.equal(q.district, "Gasabo");
    assert.equal(q.week, "this");
    assert.equal(q.minBirds, 100);
    assert.equal(q.sort, "birds");
    assert.equal(q.page, 2);
    assert.equal(q.pageSize, 12);
  });

  it("omits empty district/week and defaults sort to buyer price", () => {
    const q = filtersToPublicLotsQuery(defaultPublicMarketFilters(), 1, 12);
    assert.equal(q.district, undefined);
    assert.equal(q.week, undefined);
    assert.equal(q.minBirds, undefined);
    assert.equal(q.sort, "price");
  });

  it("formats bands", () => {
    assert.equal(formatPriceBand(null), "Price on request");
    assert.match(formatPriceBand({ min: 3800, max: 4200 }), /RWF\/kg/);
    assert.equal(formatWeightBand({ min: 1.8, max: 1.8 }), "1.8 kg");
    assert.equal(formatWeightBand({ min: 1.5, max: 2.0 }), "1.5 – 2.0 kg");
  });
});
