import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalGaps, kycWaiting, listingState, personDeskMode, personDeskTitle, RECRUITMENT_STAGES, roleBrief, stageLabel } from "./peopleWork.ts";

describe("people workflow labels", () => {
  it("names the recruitment stages and seller follow-up states", () => {
    assert.equal(stageLabel("application"), "Application");
    assert.equal(stageLabel("follow_up"), "Follow-up needed");
    assert.equal(stageLabel("kyc"), "KYC");
    assert.equal(stageLabel("active"), "Active");
    assert.deepEqual(
      RECRUITMENT_STAGES.map((item) => item[0]),
      ["application", "call_scheduled", "called", "follow_up", "kyc", "unreachable", "not_a_fit"]
    );
    assert.equal(kycWaiting({ kycContractStatus: "submitted", kycLocationStatus: "missing", kycPaymentStatus: "approved" }), true);
    assert.equal(kycWaiting({ kycContractStatus: "approved", kycLocationStatus: "approved", kycPaymentStatus: "approved", kycIdentityStatus: "submitted" }), true);
    assert.equal(kycWaiting({ kycContractStatus: "approved", kycLocationStatus: "approved", kycPaymentStatus: "approved", kycIdentityStatus: "approved" }), false);
    assert.equal(listingState({ want: "sell", flockCount: 0, listedCount: 0 }), "No flock yet");
    assert.equal(listingState({ want: "sell", flockCount: 2, listedCount: 0 }), "Flock not listed");
    assert.equal(listingState({ want: "sell", flockCount: 2, listedCount: 1 }), "Listed");
    assert.equal(listingState({ want: "buy", flockCount: 0 }), null);
  });

  it("opens a different desk for each recruitment stage", () => {
    assert.equal(personDeskMode("application"), "schedule");
    assert.equal(personDeskMode("call_scheduled"), "call");
    assert.equal(personDeskMode("called"), "decision");
    assert.equal(personDeskMode("follow_up"), "follow_up");
    assert.equal(personDeskMode("kyc"), "kyc");
    assert.equal(personDeskMode("active"), "active");
    assert.equal(personDeskMode("not_a_fit"), "closed");
    assert.equal(personDeskTitle("kyc"), "Review the contract, place, payment, and ID");
    assert.deepEqual(approvalGaps({ want: "sell", locationConfirmed: null, ownsBroilers: null }), [
      "Confirm whether the location is correct.",
      "Record whether they own broilers.",
    ]);
    assert.deepEqual(approvalGaps({ want: "buy", locationConfirmed: true }), []);
    assert.equal(roleBrief("sell"), "They applied to sell birds.");
    assert.equal(roleBrief("buy"), "They applied to buy birds.");
    assert.equal(roleBrief("scout"), "They applied to visit farms and list birds.");
  });
});
