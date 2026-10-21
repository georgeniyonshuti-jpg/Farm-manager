import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRwandaPhone, rwandaPhoneError } from "../src/services/pipeline/rwandaPhone.js";

describe("rwandaPhoneError", () => {
  it("accepts 9 digits starting with 7, 10 starting with 0, and 12 starting with 250", () => {
    assert.equal(rwandaPhoneError("781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("0781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("250781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("+250781234567", { required: true }), null);
    assert.equal(rwandaPhoneError("078 123 4567", { required: true }), null);
    assert.equal(normalizeRwandaPhone("078-123-4567"), "0781234567");
  });

  it("rejects a blank number when required, and other lengths or prefixes", () => {
    assert.equal(rwandaPhoneError("", { required: true }), "Phone is required.");
    assert.equal(rwandaPhoneError("   ", { required: true }), "Phone is required.");
    assert.equal(rwandaPhoneError("", { required: false }), null);
    assert.ok(rwandaPhoneError("78123456", { required: true }));
    assert.ok(rwandaPhoneError("1781234567", { required: true }));
    assert.ok(rwandaPhoneError("+2507812345678", { required: true }));
    assert.ok(rwandaPhoneError("25078123456", { required: true }));
  });
});
