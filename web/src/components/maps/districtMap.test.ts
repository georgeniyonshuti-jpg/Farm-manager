import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RWANDA_DISTRICTS } from "../../lib/rwandaLocations.ts";
import locations from "../../data/rwandaLocations.json" with { type: "json" };
import {
  circleRadius,
  districtFromFeature,
  fillOpacity,
  matchDistrictName,
  offMapSentence,
  placeFor,
  sectorCenter,
  splitMapRows,
  whiteSpaceDistricts,
} from "./districtMapModel.ts";

describe("district map helpers", () => {
  it("matches every official district name and rejects names that cannot be drawn", () => {
    for (const name of RWANDA_DISTRICTS) {
      assert.equal(matchDistrictName(name), name);
      assert.equal(matchDistrictName(`  ${name}  `), name);
    }
    assert.equal(RWANDA_DISTRICTS.length, 30);
    assert.equal(matchDistrictName("District unknown"), null);
    assert.equal(matchDistrictName("Unknown"), null);
    assert.equal(matchDistrictName(""), null);
    assert.equal(matchDistrictName(null), null);
    assert.equal(matchDistrictName(undefined), null);
  });

  it("reads a feature name and stays quiet when the name is missing", () => {
    assert.equal(districtFromFeature({ shapeName: "Gasabo" }), "Gasabo");
    assert.equal(districtFromFeature({}), null);
    assert.equal(districtFromFeature(null), null);
    assert.equal(districtFromFeature(undefined), null);
    assert.equal(districtFromFeature({ shapeName: 3 }), null);
  });

  it("keeps known districts on the map and names the rest in one sentence", () => {
    const rows = [
      { district: "Gasabo", value: 2, label: "2 scouts, 2 lots" },
      { district: "Unknown", value: 4, label: "4 birds listed, 0 buyers" },
      { district: "District unknown", value: 1, label: "1 scout, 0 lots" },
    ];
    const split = splitMapRows(rows);
    assert.deepEqual(split.onMap.map((row) => row.district), ["Gasabo"]);
    assert.deepEqual(split.offMap.map((row) => row.district), ["Unknown", "District unknown"]);
    assert.equal(
      offMapSentence(rows),
      "Off the map: Unknown (4 birds listed, 0 buyers); District unknown (1 scout, 0 lots).",
    );
    assert.equal(offMapSentence([{ district: "Musanze", value: 0, label: "0 scouts, 0 lots" }]), null);
    assert.deepEqual(splitMapRows([]), { onMap: [], offMap: [] });
  });

  it("lists districts with supply or demand and no scout", () => {
    assert.deepEqual(
      whiteSpaceDistricts(
        [
          { district: "Gasabo", supply: 10, demand: 4 },
          { district: "Nyagatare", supply: 0, demand: 8 },
          { district: "Musanze", supply: 0, demand: 0 },
          { district: "District unknown", supply: 3, demand: 0 },
        ],
        [{ district: "Gasabo", scouts: 1 }],
      ),
      [
        { district: "District unknown", supply: 3, demand: 0 },
        { district: "Nyagatare", supply: 0, demand: 8 },
      ],
    );
    assert.deepEqual(whiteSpaceDistricts([], []), []);
  });

  it("bundles the 30 official district shapes", () => {
    const file = fileURLToPath(new URL("../../../public/data/districts.geojson", import.meta.url));
    const bytes = readFileSync(file);
    assert.ok(bytes.byteLength < 200_000);
    const data = JSON.parse(bytes.toString("utf8")) as {
      features: { properties: { shapeName: string } }[];
    };
    const names = data.features.map((feature) => feature.properties.shapeName).sort();
    assert.deepEqual(names, [...RWANDA_DISTRICTS].sort());
  });

  it("places every sector at its own center and keeps a repeated name in two districts", () => {
    let count = 0;
    for (const districts of Object.values(locations)) {
      for (const [district, sectors] of Object.entries(districts)) {
        for (const sector of sectors) {
          const hit = sectorCenter(district, sector);
          assert.ok(hit, `${district} ${sector}`);
          assert.ok(hit.lng > 28 && hit.lng < 31);
          assert.ok(hit.lat < -1 && hit.lat > -3);
          count += 1;
        }
      }
    }
    assert.equal(count, 416);
    const nyanza = sectorCenter("Nyanza", "Busasamana");
    const rubavu = sectorCenter("Rubavu", "Busasamana");
    assert.ok(nyanza && rubavu);
    assert.notEqual(nyanza.district, rubavu.district);
    assert.notEqual(nyanza.lng, rubavu.lng);
  });

  it("uses the sector center when the sector is known and the district center otherwise", () => {
    const districtCenter = { lng: 30.1, lat: -1.9 };
    const sector = placeFor("Gasabo", "Kacyiru", districtCenter);
    assert.equal(sector?.kind, "sector");
    assert.equal(sector?.caption, "Circle is the sector center.");
    assert.ok(sector && Math.abs(sector.lng - 30.0802) < 0.001);
    const blank = placeFor("Gasabo", "", districtCenter);
    assert.equal(blank?.kind, "district");
    assert.equal(blank?.caption, "Sector not recorded. Circle is the district center.");
    assert.equal(blank?.lng, 30.1);
    const omitted = placeFor("Gasabo", undefined, districtCenter);
    assert.equal(omitted?.caption, "Circle is the district center.");
    const unknown = placeFor("Gasabo", "Not a sector", districtCenter);
    assert.equal(unknown?.kind, "district");
    assert.equal(unknown?.caption, "Sector is not on the map. Circle is the district center.");
    assert.equal(placeFor("Not a district", "Kacyiru", districtCenter), null);
    assert.equal(placeFor("Gasabo", "Kacyiru", null)?.kind, "sector");
    assert.equal(placeFor("Gasabo", "", null), null);
  });

  it("keeps circle radius finite and hides a zero count", () => {
    assert.equal(circleRadius(0, 0), 0);
    assert.equal(Number.isFinite(circleRadius(0, 0)), true);
    assert.equal(circleRadius(0, 10), 0);
    assert.ok(circleRadius(1, 100) > 0);
    assert.ok(circleRadius(1, 100) < circleRadius(100, 100));
    assert.ok(circleRadius(100, 100) <= 18);
  });

  it("picks a darker green as the value grows and does not divide by zero", () => {
    assert.equal(fillOpacity(0, 0), 0.15);
    assert.equal(fillOpacity(10, 0), 0.15);
    assert.equal(fillOpacity(Number.NaN, 10), 0.15);
    assert.equal(fillOpacity(5, 10), 0.575);
    assert.equal(fillOpacity(10, 10), 1);
    assert.equal(fillOpacity(0, 10), 0.15);
    assert.equal(Number.isFinite(fillOpacity(0, 0)), true);
  });
});
