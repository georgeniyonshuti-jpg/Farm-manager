import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalReady,
  canonicalStage,
  fieldsAfterUpsert,
  nextStageAfterTouch,
  normalizeCallAnswers,
  normalizeContactInput,
  placementFor,
  profileChanges,
  onboardingStageFor,
  applicationChange,
  stageMoveAllowed,
  salesOfficerActionAllowed,
  livePhoneBlocksOfficer,
  areaContextSentence,
  LIVE_SELLER_WARNING,
  wantFor,
} from "../src/services/pipeline/recruitmentContacts.js";

describe("recruitment contacts", () => {
  it("maps account types and keeps an existing stage on signup", () => {
    assert.equal(wantFor({ accountType: "farmer" }), "sell");
    assert.equal(wantFor({ accountType: "buyer" }), "buy");
    assert.equal(wantFor({ want: "scout" }), "scout");
    const incoming = normalizeContactInput({
      phone: "0788123456",
      name: "Aline",
      accountType: "farmer",
      source: "signup",
      userId: "user-1",
    });
    assert.equal(incoming.ok, true);
    assert.equal(incoming.phone, "+250788123456");
    const merged = fieldsAfterUpsert(
      { name: "Aline", district: "Gasabo", birdCount: 40, want: "sell", stage: "contact", source: "whatsapp", userId: null },
      incoming
    );
    assert.equal(merged.stage, "contact");
    assert.equal(merged.source, "whatsapp");
    assert.equal(merged.userId, "user-1");
    assert.equal(merged.district, "Gasabo");
  });

  it("fills blanks and refuses a bad phone", () => {
    const incoming = normalizeContactInput({ phone: "788123456", district: "Musanze", birds: 12, source: "market_form", want: "buy" });
    assert.equal(incoming.want, "buy");
    const merged = fieldsAfterUpsert(null, incoming);
    assert.equal(merged.stage, "application");
    assert.equal(merged.birdCount, 12);
    assert.equal(normalizeContactInput({ phone: "12" }).ok, false);
  });

  it("moves an application forward when the call is logged", () => {
    assert.deepEqual(nextStageAfterTouch("application", "reached"), { stage: "contact", deskStatus: "called" });
    assert.deepEqual(nextStageAfterTouch("new", "scheduled"), { stage: "contact", deskStatus: "call_scheduled" });
    assert.deepEqual(nextStageAfterTouch("called", "no_answer"), { stage: "contact", deskStatus: "called" });
    assert.deepEqual(nextStageAfterTouch("called", "reached", { needsFollowUp: true }), { stage: "contact", deskStatus: "follow_up" });
    assert.deepEqual(nextStageAfterTouch("active", "reached"), { stage: "onboarded", deskStatus: null });
    assert.deepEqual(nextStageAfterTouch("unreachable", "no_answer"), { stage: "application", deskStatus: null });
    assert.equal(canonicalStage("call_booked"), "contact");
    assert.deepEqual(placementFor("call_booked"), { stage: "contact", deskStatus: "call_scheduled" });
    assert.deepEqual(placementFor("not_a_fit"), { stage: "closed", deskStatus: "not_a_fit" });
    assert.equal(onboardingStageFor("application"), "new");
    assert.equal(onboardingStageFor("contact", "call_scheduled"), "call_booked");
    assert.equal(onboardingStageFor("onboarded"), "active");
    assert.equal(onboardingStageFor("closed", "not_a_fit"), "not_a_fit");
    assert.equal(onboardingStageFor("contact", "unreachable"), "unreachable");
  });

  it("requires the verification answers before approval and blocks backward moves", () => {
    const answers = normalizeCallAnswers("sell", {
      locationConfirmed: true,
      ownsBroilers: true,
      birdType: "broiler",
      quantityMin: 100,
      quantityMax: 400,
      canSlaughter: false,
      canDeliver: true,
    });
    assert.equal(answers.ok, true);
    assert.equal(approvalReady({ want: "sell", locationConfirmed: null }).ok, false);
    assert.equal(
      approvalReady({
        want: "sell",
        locationConfirmed: true,
        ownsBroilers: true,
        birdType: "hybrid",
        quantityMin: 50,
      }).ok,
      false
    );
    assert.equal(
      approvalReady({
        want: "sell",
        locationConfirmed: true,
        ownsBroilers: true,
        birdType: "hybrid",
        quantityMin: 50,
        flockSize: 200,
      }).ok,
      true
    );
    assert.equal(normalizeCallAnswers("sell", { quantityMin: 20, quantityMax: 10 }).ok, false);
    assert.equal(normalizeCallAnswers("sell", { readyInWeeks: 9 }).ok, false);
    assert.equal(normalizeCallAnswers("sell", { flockSize: 1200, readyInWeeks: 0 }).answers.flockSize, 1200);
    assert.equal(normalizeCallAnswers("sell", { flockSize: 1200, readyInWeeks: 0 }).answers.readyInWeeks, 0);
    assert.equal(stageMoveAllowed("contact", "application", "sales_coordinator").ok, false);
    assert.equal(stageMoveAllowed("contact", "application", "superuser").ok, true);
    assert.equal(stageMoveAllowed("contact", "onboarded", "superuser").ok, false);
    assert.equal(stageMoveAllowed("contact", "closed", "sales_coordinator").ok, true);
    assert.equal(stageMoveAllowed("closed", "application", "superuser").ok, true);
    assert.equal(stageMoveAllowed("closed", "kyc", "superuser").ok, true);
    assert.equal(stageMoveAllowed("closed", "contact", "superuser").ok, true);
    assert.equal(stageMoveAllowed("contact", "contact", "superuser").ok, true);
    assert.equal(stageMoveAllowed("onboarded", "contact", "superuser").ok, true);
    assert.equal(stageMoveAllowed("closed", "application", "sales_coordinator").ok, false);
    assert.equal(stageMoveAllowed("closed", "onboarded", "superuser").ok, false);
    assert.equal(stageMoveAllowed("contact", "kyc", "sales_officer").ok, true);
    assert.equal(stageMoveAllowed("kyc", "onboarded", "sales_officer").ok, false);
    const clear = {
      stage: "kyc",
      kycContractStatus: "approved",
      kycLocationStatus: "approved",
      kycPaymentStatus: "approved",
      kycIdentityStatus: "approved",
    };
    assert.equal(salesOfficerActionAllowed("sales_officer", { decision: "approved", contact: clear }).ok, false);
    assert.equal(salesOfficerActionAllowed("sales_officer", { stage: "onboarded" }).ok, false);
    assert.equal(
      salesOfficerActionAllowed("sales_officer", {
        decision: "approved",
        contact: { stage: "contact", kycContractStatus: "pending" },
      }).ok,
      true
    );
    assert.equal(salesOfficerActionAllowed("sales_coordinator", { decision: "approved", contact: clear }).ok, true);
    assert.equal(livePhoneBlocksOfficer("sales_officer", { stage: "onboarded" }).ok, false);
    assert.equal(livePhoneBlocksOfficer("sales_officer", { stage: "active" }).error, LIVE_SELLER_WARNING);
    assert.equal(livePhoneBlocksOfficer("sales_officer", { stage: "contact" }).ok, true);
    assert.equal(livePhoneBlocksOfficer("sales_coordinator", { stage: "onboarded" }).ok, true);
    assert.equal(areaContextSentence({}), null);
    assert.equal(
      areaContextSentence({ sector: "Nyamirambo", district: "Nyarugenge", verifiedFlocks: 3, buyersNearby: 2 }),
      "3 verified flocks already in this sector. 2 buyers nearby want birds."
    );
    assert.equal(
      areaContextSentence({ district: "Nyarugenge", verifiedFlocks: 1, buyersNearby: 1 }),
      "1 verified flock already in this district. 1 buyer nearby wants birds."
    );
    assert.equal(
      areaContextSentence({ sector: "Nyamirambo", verifiedFlocks: 0, buyersNearby: 0 }),
      "No verified flocks in this sector yet."
    );
  });

  it("sends a changed application back to the interview", () => {
    const same = applicationChange("scout", "scout");
    assert.equal(same.ok, true);
    assert.equal(same.changed, false);
    const next = applicationChange("scout", "sell");
    assert.equal(next.ok, true);
    assert.equal(next.changed, true);
    assert.equal(next.want, "sell");
    assert.equal(next.stage, "contact");
    assert.equal(next.deskStatus, "call_scheduled");
    assert.equal(applicationChange("buy", "nope").ok, false);
    assert.equal(salesOfficerActionAllowed("sales_officer", { stage: "onboarded", changingApplication: true }).ok, true);
    assert.equal(salesOfficerActionAllowed("sales_officer", { stage: "onboarded" }).ok, false);
    assert.equal(salesOfficerActionAllowed("sales_coordinator", { stage: "onboarded" }).ok, true);
  });

  it("stores buyer and scout answers and blocks KYC until the required fact is present", () => {
    assert.equal(approvalReady({ want: "buy", locationConfirmed: true }).ok, false);
    assert.equal(
      approvalReady({ want: "buy", locationConfirmed: true, buyerFor: "hotel", quantityMin: 20 }).ok,
      true
    );
    assert.equal(approvalReady({ want: "scout", locationConfirmed: true }).ok, false);
    assert.equal(approvalReady({ want: "scout", locationConfirmed: true, willVisit: false }).ok, true);
    assert.equal(normalizeCallAnswers("buy", { buyerFor: "school" }).ok, false);
    const buyer = normalizeCallAnswers("buy", {
      buyerFor: "butcher",
      birdForm: "alive",
      deliveryRequired: true,
      quantityMin: 10,
      quantityMax: 20,
    });
    assert.equal(buyer.ok, true);
    assert.equal(buyer.answers.buyerFor, "butcher");
    assert.equal(buyer.answers.birdForm, "alive");
    assert.equal(buyer.answers.deliveryRequired, true);
    const scout = normalizeCallAnswers("scout", { willVisit: false, farmsKnown: 4 });
    assert.equal(scout.ok, true);
    assert.equal(scout.answers.willVisit, false);
    assert.equal(scout.answers.farmsKnown, 4);
    assert.equal(normalizeCallAnswers("scout", { farmsKnown: -1 }).ok, false);
  });

  it("marks a person edited only when a detail actually changes", () => {
    const current = { name: "Aline", phone: "+250788123456", email: null, district: "Gasabo", sector: "Kacyiru" };
    const same = profileChanges(current, { name: "Aline", phone: "0788123456", email: "", district: "Gasabo", sector: "Kacyiru" });
    assert.equal(same.ok, true);
    assert.equal(same.edited, false);
    assert.equal(same.changes.phone, "+250788123456");
    const moved = profileChanges(current, { name: "Aline M.", email: "Aline@Example.com", district: "Kicukiro", sector: "Gikondo" });
    assert.equal(moved.edited, true);
    assert.equal(moved.changes.email, "aline@example.com");
    assert.equal(moved.changes.sector, "Gikondo");
    assert.equal(profileChanges(current, { phone: "123" }).ok, false);
    assert.equal(profileChanges(current, { email: "not-an-email" }).ok, false);
    assert.equal(profileChanges(current, { district: "Gasabo", sector: "Nyarugenge" }).ok, false);
  });
});
