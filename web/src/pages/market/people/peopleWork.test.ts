import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvalGaps, cardBadge, cardStatus, contractBadgeLabel, kycDocsStatus, kycSendBlocked, kycWaiting, listingState, liveSellerWarning, personDeskMode, personDeskTitle, RECRUITMENT_STAGES, roleBrief, stageActions, stageLabel, superuserStageChoices } from "./peopleWork.ts";

describe("people workflow labels", () => {
  it("names the recruitment stages and seller follow-up states", () => {
    assert.equal(stageLabel("application"), "Application");
    assert.equal(stageLabel("follow_up"), "Contact");
    assert.equal(stageLabel("kyc"), "KYC");
    assert.equal(stageLabel("active"), "Onboarded");
    assert.equal(stageLabel("onboarded"), "Onboarded");
    assert.equal(contractBadgeLabel({ contractStatus: "signed" }), "Signed, awaiting approval");
    assert.equal(contractBadgeLabel({ kycContractStatus: "submitted" }), "Needs the new link");
    assert.equal(contractBadgeLabel({}), "Not sent");
    assert.deepEqual(
      RECRUITMENT_STAGES.map((item) => item[0]),
      ["application", "contact", "kyc", "onboarded", "closed"]
    );
    assert.deepEqual(cardStatus({ stage: "contact", deskStatus: "called" }), { id: "called", label: "Called" });
    assert.deepEqual(cardBadge({ stage: "contact", deskStatus: "call_scheduled", overdue: true }), {
      id: "overdue",
      label: "Call is overdue",
      tone: "warning",
    });
    assert.equal(
      cardBadge({ stage: "kyc", kycContractStatus: "submitted", kycLocationStatus: "missing", kycPaymentStatus: "missing", kycIdentityStatus: "missing" })?.id,
      "kyc_waiting"
    );
    assert.equal(cardBadge({ stage: "contact", deskStatus: "call_scheduled" })?.tone, "neutral");
    assert.equal(cardBadge({ stage: "closed", deskStatus: "not_a_fit" })?.tone, "danger");
    assert.equal(cardBadge({ stage: "application" }), null);
    assert.equal(kycDocsStatus({ kycContractStatus: "missing", kycIdentityStatus: "submitted" }), "docs_received");
    assert.equal(kycDocsStatus({ kycContractStatus: "missing" }), "docs_pending");
    assert.equal(kycWaiting({ kycContractStatus: "submitted", kycLocationStatus: "missing", kycPaymentStatus: "approved" }), true);
    assert.equal(kycWaiting({ kycContractStatus: "approved", kycLocationStatus: "approved", kycPaymentStatus: "approved", kycIdentityStatus: "submitted" }), true);
    assert.equal(kycWaiting({ kycContractStatus: "approved", kycLocationStatus: "approved", kycPaymentStatus: "approved", kycIdentityStatus: "approved" }), false);
    assert.equal(listingState({ want: "sell", flockCount: 0, listedCount: 0 }), "No flock yet");
    assert.equal(listingState({ want: "sell", flockCount: 2, listedCount: 0 }), "Flock not listed");
    assert.equal(listingState({ want: "sell", flockCount: 2, listedCount: 1 }), "Listed");
    assert.equal(listingState({ want: "buy", flockCount: 0 }), null);
    assert.equal(liveSellerWarning({ stage: "contact", alreadyLive: true }), "This phone is already a live seller. A coordinator keeps that account.");
    assert.equal(liveSellerWarning({ stage: "onboarded", alreadyLive: true }), null);
    assert.equal(liveSellerWarning({ stage: "contact", alreadyLive: false }), null);
    assert.deepEqual(superuserStageChoices("closed").map(([value]) => value), ["application", "contact", "kyc"]);
    assert.deepEqual(superuserStageChoices("onboarded").map(([value]) => value), ["application", "contact", "kyc", "closed"]);
    assert.equal(superuserStageChoices("contact").some(([value]) => value === "contact" || value === "onboarded"), false);
  });

  it("opens a different desk for each recruitment stage", () => {
    assert.equal(personDeskMode("application"), "schedule");
    assert.equal(personDeskMode("contact", "call_scheduled"), "call");
    assert.equal(personDeskMode("contact", "called"), "decision");
    assert.equal(personDeskMode("contact", "follow_up"), "follow_up");
    assert.equal(personDeskMode("kyc"), "kyc");
    assert.equal(personDeskMode("onboarded"), "active");
    assert.equal(personDeskMode("closed", "not_a_fit"), "closed");
    assert.equal(personDeskMode("contact", "unreachable"), "closed");
    assert.equal(personDeskTitle("kyc"), "Review the contract, place, payment, and ID");
    assert.deepEqual(approvalGaps({ want: "sell", locationConfirmed: null, ownsBroilers: null }), [
      "Confirm whether the location is correct.",
      "Record whether they own broilers.",
    ]);
    assert.deepEqual(approvalGaps({ want: "buy", locationConfirmed: true }), [
      "Record who they are buying for.",
      "Record how many birds they need in a normal week.",
    ]);
    assert.deepEqual(approvalGaps({ want: "scout", locationConfirmed: true, willVisit: null }), [
      "Record whether they will visit farms.",
    ]);
    assert.deepEqual(
      approvalGaps({
        want: "sell",
        locationConfirmed: true,
        ownsBroilers: true,
        birdType: "broiler",
        quantityMin: 10,
        flockSize: null,
      }),
      ["Record how many birds are in the flock."]
    );
    assert.equal(roleBrief("sell"), "They applied to sell birds.");
    assert.equal(roleBrief("buy"), "They applied to buy birds.");
    assert.equal(roleBrief("scout"), "They applied to visit farms and list birds.");
  });

  it("offers the next step that belongs on each stage", () => {
    const labels = (actions: { label: string }[]) => actions.map((action) => action.label);
    assert.deepEqual(labels(stageActions({ mode: "schedule", recordingNow: true })), [
      "Send to KYC",
      "Call later",
      "No answer",
      "Not a fit",
    ]);
    assert.equal(stageActions({ mode: "schedule", recordingNow: true })[0].primary, true);
    assert.deepEqual(labels(stageActions({ mode: "schedule", recordingNow: false })), ["Schedule call", "Not a fit"]);
    assert.deepEqual(labels(stageActions({ mode: "call", outcome: "reached" })), ["Send to KYC", "Call later", "Not a fit"]);
    assert.deepEqual(labels(stageActions({ mode: "call", outcome: "no_answer" })), ["No answer", "Unreachable"]);
    assert.deepEqual(labels(stageActions({ mode: "call", outcome: "scheduled" })), ["Reschedule"]);
    assert.deepEqual(labels(stageActions({ mode: "decision" })), ["Send to KYC", "Call later", "Not a fit"]);
    assert.deepEqual(labels(stageActions({ mode: "follow_up" })), ["Save follow-up", "Send to KYC", "Not a fit", "Unreachable"]);
    assert.deepEqual(labels(stageActions({ mode: "kyc" })), ["Not a fit"]);
    assert.deepEqual(labels(stageActions({ mode: "active" })), ["Save follow-up"]);
    assert.deepEqual(labels(stageActions({ mode: "closed", stage: "unreachable" })), ["Try again"]);
    assert.deepEqual(stageActions({ mode: "closed", stage: "not_a_fit" }), []);
    const seller = { want: "sell", locationConfirmed: null, ownsBroilers: null, birdType: null, quantityMin: null };
    assert.equal(kycSendBlocked(seller), true);
    assert.equal(
      kycSendBlocked(seller, { locationConfirmed: "yes", ownsBroilers: "yes", birdType: "broiler", quantityMin: "40" }),
      true
    );
    assert.equal(
      kycSendBlocked(seller, {
        locationConfirmed: "yes",
        ownsBroilers: "yes",
        birdType: "broiler",
        quantityMin: "40",
        flockSize: "800",
      }),
      false
    );
    assert.equal(kycSendBlocked({ want: "buy", locationConfirmed: true }, { locationConfirmed: "" }), true);
    assert.equal(
      kycSendBlocked(
        { want: "buy", locationConfirmed: true, buyerFor: null, quantityMin: null },
        { buyerFor: "butcher", quantityMin: "30" }
      ),
      false
    );
    assert.equal(kycSendBlocked({ want: "scout", locationConfirmed: true, willVisit: null }, { willVisit: "no" }), false);
  });
});
