import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buyerPlaceGroup,
  districtsInProvince,
  isSectorInDistrict,
  normalizePlace,
  sectorsInDistrict,
} from "../src/services/pipeline/rwandaLocations.js";

const PROVINCES = [
  "Kigali City",
  "Eastern Province",
  "Northern Province",
  "Southern Province",
  "Western Province",
];

describe("rwanda locations", () => {
  it("keeps all 416 sectors under the right district", () => {
    const count = PROVINCES.flatMap((province) =>
      districtsInProvince(province).flatMap((district) => sectorsInDistrict(district))
    ).length;
    assert.equal(count, 416);
    assert.equal(isSectorInDistrict("Bugesera", "Nyarugenge"), true);
    assert.equal(isSectorInDistrict("Gasabo", "Nyarugenge"), false);
    assert.equal(sectorsInDistrict("Gasabo").includes("Kacyiru"), true);
  });

  it("requires a sector that belongs to the district", () => {
    assert.equal(normalizePlace("Gasabo", "Kacyiru", { required: true }).ok, true);
    assert.equal(normalizePlace("Gasabo", "", { required: true }).code, "sector_required");
    assert.equal(normalizePlace("Gasabo", "Nyarugenge").code, "sector_invalid");
    assert.equal(normalizePlace("", "Kacyiru").code, "sector_invalid");
    assert.deepEqual(normalizePlace("", ""), { ok: true, district: null, sector: null });
  });

  it("groups buyers by sector, then district, then province", () => {
    const flock = { district: "Gasabo", sector: "Kacyiru" };
    assert.equal(buyerPlaceGroup(flock, { district: "Gasabo", sector: "Kacyiru" }), "sector");
    assert.equal(buyerPlaceGroup(flock, { district: "Gasabo", sector: "Remera" }), "district");
    assert.equal(buyerPlaceGroup(flock, { district: "Kicukiro", sector: "Gikondo" }), "province");
    assert.equal(buyerPlaceGroup(flock, { district: "Musanze", sector: "Muhoza" }), null);
  });
});
