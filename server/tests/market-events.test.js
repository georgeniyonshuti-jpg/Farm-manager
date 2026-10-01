import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMarketEventType, validateMarketEvent } from "../src/services/pipeline/marketEvents.js";

describe("marketEvents", () => {
  it("accepts privacy-safe types only", () => {
    assert.equal(normalizeMarketEventType("listing_view"), "listing_view");
    assert.equal(normalizeMarketEventType("ip_hash"), null);
  });

  it("requires a farm, lot, or public ref and never stores extra fields", () => {
    assert.equal(validateMarketEvent({ eventType: "listing_view" }).ok, false);
    const v = validateMarketEvent({
      eventType: "listing_view",
      publicRef: "lot-abc",
      buyerEmail: "leak@example.com",
    });
    assert.equal(v.ok, true);
    assert.equal(v.publicRef, "LOT-ABC");
    assert.equal(v.buyerEmail, undefined);
  });
});
