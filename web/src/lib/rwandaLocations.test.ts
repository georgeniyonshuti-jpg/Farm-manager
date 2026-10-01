import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RWANDA_DISTRICTS,
  RWANDA_PROVINCES,
  districtsInProvince,
  isRwandaDistrict,
  provinceForDistrict,
} from "./rwandaLocations.ts";

describe("rwandaLocations", () => {
  it("lists 30 unique districts grouped by province", () => {
    assert.equal(RWANDA_DISTRICTS.length, 30);
    assert.equal(new Set(RWANDA_DISTRICTS).size, 30);
    assert.equal(RWANDA_PROVINCES.length, 5);
  });

  it("places Gasabo in Kigali and Musanze in the North", () => {
    assert.equal(provinceForDistrict("Gasabo"), "Kigali City");
    assert.equal(provinceForDistrict("Musanze"), "Northern Province");
    assert.equal(isRwandaDistrict("Gasabo"), true);
    assert.equal(isRwandaDistrict("Not a district"), false);
    assert.deepEqual(districtsInProvince("Kigali City"), ["Gasabo", "Kicukiro", "Nyarugenge"]);
  });
});
