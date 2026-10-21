import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flockDeskStatus, flockStatusLabel, placeLabel } from "./flockDesk.ts";

describe("flock desk status", () => {
  it("marks review, verified, and assigned flocks", () => {
    assert.equal(flockDeskStatus({ verificationStatus: "pending_review", assignedScoutUserId: null }), "needs_review");
    assert.equal(flockDeskStatus({ verificationStatus: "verified", assignedScoutUserId: null }), "verified");
    assert.equal(flockDeskStatus({ verificationStatus: "verified", assignedScoutUserId: "scout-1" }), "with_scout");
    assert.equal(flockDeskStatus({ verificationStatus: "rejected", assignedScoutUserId: null }), null);
    assert.equal(flockStatusLabel("needs_review"), "Needs review");
    assert.equal(placeLabel({ sector: "Kacyiru", district: "Gasabo" }), "Kacyiru, Gasabo");
  });
});
