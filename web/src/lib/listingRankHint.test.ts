import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatListingRankHint, offerRowLeakKeys } from "./listingRankHint.ts";

describe("listingRankHint", () => {
  it("writes rail, place, and cheaper gap", () => {
    const copy = formatListingRankHint({
      rails: { min: 3610, max: 4104 },
      inRail: true,
      rank: 3,
      peers: 7,
      cheaper: 2,
      cheapestBuyerRwfPerKg: 4000,
      yourBuyerRwfPerKg: 4150,
    });
    assert.match(copy, /3 of 7/);
    assert.match(copy, /3610–4104/);
    assert.match(copy, /150 RWF\/kg cheaper/);
  });

  it("flags an out-of-rail ask", () => {
    const copy = formatListingRankHint({ inRail: false, rails: { min: 3800, max: 4320 } });
    assert.match(copy, /will not rank/);
  });
});

describe("offer row identity", () => {
  it("treats farm name and ask as leaks on a shop row", () => {
    assert.deepEqual(
      offerRowLeakKeys({
        farm: { displayName: "Green Ridge" },
        farmLabel: "Green Ridge",
        askPricePerKg: 4000,
        companyId: "co-1",
      }),
      ["farm", "farmLabel", "askPricePerKg", "companyId"]
    );
    assert.deepEqual(offerRowLeakKeys({ district: "Musanze", buyerRwfPerKg: 4150 }), []);
  });
});
