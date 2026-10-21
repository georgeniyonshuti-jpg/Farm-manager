import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flockStep, personNeedsCall } from "./deskWork.ts";

describe("desk work", () => {
  const open = { id: "lot-1", status: "open", verificationStatus: "verified", listingPhase: "visit_due" };

  it("asks for approval before price, visit, or post", () => {
    assert.equal(
      flockStep({ ...open, verificationStatus: "pending_review" }, { verifyIds: new Set(), pricePublished: true }),
      "approve"
    );
    assert.equal(
      flockStep(open, { verifyIds: new Set(["lot-1"]), pricePublished: true }),
      "approve"
    );
  });

  it("asks for a price only when the board is not published", () => {
    assert.equal(flockStep(open, { verifyIds: new Set(), pricePublished: false }), "price");
    assert.equal(flockStep(open, { verifyIds: new Set(), pricePublished: true }), "visit");
  });

  it("drops flocks that are already live, weighed, rejected, or closed", () => {
    assert.equal(flockStep({ ...open, listingPhase: "live" }, { verifyIds: new Set(), pricePublished: true }), null);
    assert.equal(flockStep({ ...open, listingPhase: "weighed" }, { verifyIds: new Set(), pricePublished: true }), null);
    assert.equal(flockStep({ ...open, verificationStatus: "rejected" }, { verifyIds: new Set(), pricePublished: true }), null);
    assert.equal(flockStep({ ...open, status: "cancelled" }, { verifyIds: new Set(), pricePublished: true }), null);
  });

  it("calls people who have no account yet", () => {
    assert.equal(personNeedsCall("new", false), true);
    assert.equal(personNeedsCall("contacted", false), true);
    assert.equal(personNeedsCall("new", true), false);
    assert.equal(personNeedsCall("active", false), false);
  });
});
