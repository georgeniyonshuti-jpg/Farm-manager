import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sellerListingGate } from "../src/services/pipeline/farmProfiles.js";

describe("seller listing gate", () => {
  it("lets a pending market seller save flocks and holds them for review", () => {
    const gate = sellerListingGate({
      marketOnly: true,
      companyStatus: "verified",
      profileStatus: "pending",
    });
    assert.equal(gate.allow, true);
    assert.equal(gate.holdForReview, true);
  });

  it("lets an approved market seller list without the extra hold", () => {
    const gate = sellerListingGate({
      marketOnly: true,
      companyStatus: "verified",
      profileStatus: "verified",
    });
    assert.equal(gate.allow, true);
    assert.equal(gate.holdForReview, false);
  });

  it("blocks a rejected market seller", () => {
    const gate = sellerListingGate({
      marketOnly: true,
      companyStatus: "verified",
      profileStatus: "rejected",
    });
    assert.equal(gate.allow, false);
    assert.equal(gate.code, "rejected");
  });

  it("still requires a full-farm company to be verified first", () => {
    const gate = sellerListingGate({
      marketOnly: false,
      companyStatus: "pending",
      profileStatus: "pending",
    });
    assert.equal(gate.allow, false);
    assert.equal(gate.code, "pending_verification");
  });
});
