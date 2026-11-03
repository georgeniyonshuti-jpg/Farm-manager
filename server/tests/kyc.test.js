import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contractFor,
  kycClear,
  stageAfterDecision,
  tradingAllowed,
  validateKycTask,
} from "../src/services/pipeline/kyc.js";

describe("kyc", () => {
  it("uses a different starter contract for each role", () => {
    assert.match(contractFor("sell"), /Seller agreement/);
    assert.match(contractFor("buy"), /Buyer agreement/);
    assert.match(contractFor("scout"), /Scout agreement/);
    assert.notEqual(contractFor("sell"), contractFor("buy"));
  });

  it("keeps a new approval in KYC until every check is approved", () => {
    const open = { kycContractStatus: "submitted", kycLocationStatus: "approved", kycPaymentStatus: "missing", kycIdentityStatus: "missing" };
    assert.equal(kycClear(open), false);
    assert.deepEqual(stageAfterDecision("approved", open), { stage: "kyc", deskStatus: null });
    const done = {
      kycContractStatus: "approved",
      kycLocationStatus: "approved",
      kycPaymentStatus: "approved",
      kycIdentityStatus: "approved",
    };
    assert.deepEqual(stageAfterDecision("approved", done), { stage: "onboarded", deskStatus: null });
    assert.deepEqual(stageAfterDecision("not_a_fit", open), { stage: "closed", deskStatus: "not_a_fit" });
    assert.deepEqual(stageAfterDecision("unreachable", open), { stage: "contact", deskStatus: "unreachable" });
    assert.equal(tradingAllowed({ stage: "onboarded" }).allow, true);
    assert.equal(tradingAllowed({ stage: "active" }).allow, true);
    assert.equal(tradingAllowed({ stage: "kyc" }).allow, false);
    assert.equal(tradingAllowed({ stage: "kyc" }).code, "kyc_required");
    assert.equal(tradingAllowed(null).allow, true);
  });

  it("rejects the old short signature and accepts a place and a mobile-money screenshot", () => {
    const signed = validateKycTask({ task: "contract", signatureUrl: "data:image/png;base64,abc" }, { want: "sell" });
    assert.equal(signed.ok, false);
    assert.match(signed.error, /link sent to their phone/);
    const reviewed = validateKycTask(
      { task: "location", district: "Gasabo", sector: "Kacyiru", place: "Near the market", review: "approved" },
      { want: "sell" }
    );
    assert.equal(reviewed.status, "approved");
    const pay = validateKycTask({ task: "payment", momoPhone: "0788123456", proofUrl: "https://res.cloudinary.com/demo/image.jpg" });
    assert.equal(pay.ok, true);
    assert.equal(pay.momoPhone, "0788123456");
    assert.equal(validateKycTask({ task: "payment", momoPhone: "123", proofUrl: "data:image/jpeg;base64,aa" }).ok, false);
    assert.equal(validateKycTask({ task: "contract", signatureUrl: "http://example.com/a.png" }).ok, false);
    const id = validateKycTask({ task: "identity", idNumber: "1199880012345678", photoUrl: "data:image/jpeg;base64,abc" });
    assert.equal(id.ok, true);
    assert.equal(id.idNumber, "1199880012345678");
    assert.equal(validateKycTask({ task: "identity", idNumber: "12", photoUrl: "data:image/jpeg;base64,abc" }).ok, false);
  });
});
