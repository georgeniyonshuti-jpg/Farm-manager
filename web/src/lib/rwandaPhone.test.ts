import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rwandaPhoneError } from "./rwandaPhone.ts";

describe("rwandaPhoneError", () => {
  it("accepts the four Rwanda shapes and rejects the rest", () => {
    assert.equal(rwandaPhoneError("781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("0781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("+250 781 234 567", { required: true }), null);
    assert.equal(rwandaPhoneError("250781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("", { required: true }), "Phone is required.");
    assert.ok(rwandaPhoneError("12345", { required: true }));
  });
});
