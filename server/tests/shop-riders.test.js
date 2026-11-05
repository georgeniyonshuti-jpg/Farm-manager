import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_FARE_RWF, fareFromBody, riderFromBody } from "../src/services/shop/shopRiders.js";

describe("riders", () => {
  it("needs a name and a phone; the MoMo number defaults to the phone", () => {
    assert.equal(riderFromBody({ name: "", phone: "0788123456" }).ok, false);
    assert.equal(riderFromBody({ name: "Jean", phone: "12" }).ok, false);
    const r = riderFromBody({ name: "Jean", phone: "0788123456", plate: "rc 123 a" });
    assert.equal(r.ok, true);
    assert.equal(r.values.momoPhone, r.values.phone);
    assert.equal(r.values.plate, "RC 123 A");
  });

  it("takes a whole, positive fare and catches an extra zero", () => {
    assert.equal(fareFromBody({ fareRwf: 1200 }).fareRwf, 1200);
    assert.equal(fareFromBody({ fareRwf: 0 }).ok, false);
    assert.equal(fareFromBody({ fareRwf: 1200.5 }).ok, false);
    assert.equal(fareFromBody({ fareRwf: MAX_FARE_RWF + 1 }).ok, false);
  });
});
