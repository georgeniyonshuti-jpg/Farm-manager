import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalReady,
  canonicalStage,
  fieldsAfterUpsert,
  nextStageAfterTouch,
  normalizeCallAnswers,
  normalizeContactInput,
  profileChanges,
  onboardingStageFor,
  stageMoveAllowed,
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
      { name: "Aline", district: "Gasabo", birdCount: 40, want: "sell", stage: "called", source: "whatsapp", userId: null },
      incoming
    );
    assert.equal(merged.stage, "called");
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
    assert.equal(nextStageAfterTouch("application", "reached"), "called");
    assert.equal(nextStageAfterTouch("new", "scheduled"), "call_scheduled");
    assert.equal(nextStageAfterTouch("called", "no_answer"), "called");
    assert.equal(nextStageAfterTouch("called", "reached", { needsFollowUp: true }), "follow_up");
    assert.equal(nextStageAfterTouch("active", "reached"), "active");
    assert.equal(canonicalStage("call_booked"), "call_scheduled");
    assert.equal(onboardingStageFor("application"), "new");
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
      true
    );
    assert.equal(normalizeCallAnswers("sell", { quantityMin: 20, quantityMax: 10 }).ok, false);
    assert.equal(stageMoveAllowed("called", "application", "sales_coordinator").ok, false);
    assert.equal(stageMoveAllowed("called", "application", "superuser").ok, true);
    assert.equal(stageMoveAllowed("called", "active", "superuser").ok, false);
    assert.equal(stageMoveAllowed("called", "not_a_fit", "sales_coordinator").ok, true);
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
