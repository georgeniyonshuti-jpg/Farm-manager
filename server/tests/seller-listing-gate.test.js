import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoutReadyGate, sellerListingGate } from "../src/services/pipeline/farmProfiles.js";

describe("seller listing gate", () => {
  it("keeps a pending market seller from registering flocks", () => {
    const gate = sellerListingGate({
      marketOnly: true,
      companyStatus: "verified",
      profileStatus: "pending",
    });
    assert.equal(gate.allow, false);
    assert.equal(gate.code, "not_ready");
  });

  it("lets a ready market seller register a flock that still waits for review", () => {
    const gate = sellerListingGate({
      marketOnly: true,
      companyStatus: "verified",
      profileStatus: "verified",
    });
    assert.equal(gate.allow, true);
    assert.equal(gate.holdForReview, true);
  });

  it("blocks a scout until Cleva marks them ready", () => {
    assert.equal(scoutReadyGate("pending").allow, false);
    assert.equal(scoutReadyGate("approved").allow, true);
    assert.equal(scoutReadyGate("rejected").allow, false);
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
